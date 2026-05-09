/**
 * Search Result Pagination Handler
 * 
 * Handles pagination on LinkedIn search results with reliable scrolling,
 * infinite scroll detection, and resume capability.
 * 
 * Features:
 * - Extract search results from LinkedIn pages
 * - Handle infinite scroll with proper delays
 * - Track pagination state and progress
 * - Resume capability for interrupted scraping
 * - Duplicate detection
 * - Error handling for various LinkedIn states
 * 
 * @module scraper/search/pagination
 */

import type { Page } from 'playwright';
import { logger } from '@/utils/logger';
import { randomDelay, scrollDelay } from '@/scraper/rate-limiter';
import { globalCircuitBreaker } from '@/scraper/retry-handler';
import * as scrapingLogRepo from '@/database/repositories/scrapingLog.repository';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Search result item
 */
export interface SearchResult {
  /** Profile URL */
  profileUrl: string;
  /** Profile name */
  name: string;
  /** Profile headline/title */
  headline: string;
  /** Location */
  location: string;
  /** Profile picture URL (optional) */
  profilePicture?: string;
  /** Connection degree (1st, 2nd, 3rd) */
  connectionDegree?: string;
}

/**
 * Pagination state for tracking progress
 */
export interface PaginationState {
  /** Current search URL */
  searchUrl: string;
  /** Number of profiles scraped so far */
  profilesScraped: number;
  /** Number of scrolls performed */
  scrollCount: number;
  /** Set of already scraped profile URLs */
  scrapedUrls: Set<string>;
  /** Timestamp of last activity */
  lastActivity: Date;
  /** Whether pagination is paused */
  isPaused: boolean;
  /** Whether pagination is stopped */
  isStopped: boolean;
  /** Error count */
  errorCount: number;
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
  /** Maximum number of scrolls */
  maxScrolls: number;
  /** Delay between scrolls in ms */
  scrollDelay: number;
  /** Maximum time per scroll operation in ms */
  scrollTimeout: number;
  /** Maximum total time for pagination in ms */
  totalTimeout: number;
  /** Batch size for saving progress */
  saveBatchSize: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PaginationConfig = {
  maxScrolls: 50,
  scrollDelay: 2000,
  scrollTimeout: 30000,
  totalTimeout: 600000, // 10 minutes
  saveBatchSize: 10,
};

// ============================================================================
// Selectors for LinkedIn Search Results
// ============================================================================

const SEARCH_SELECTORS = {
  // Search result cards
  resultList: '.search-results-container',
  resultCards: '[data-chameleon-result-urn]',
  resultCard: '.entity-result__item, .reusable-search__result-container',
  
  // Profile information
  profileLink: 'a.app-aware-link[href*="/in/"]',
  name: '.entity-result__title-text a, .actor-name',
  headline: '.entity-result__primary-subtitle, .entity-result__summary, .subline-level-1',
  location: '.entity-result__secondary-subtitle, .subline-level-2',
  profilePicture: '.presence-entity__image, .ivm-view-attr__img--centered',
  connectionDegree: '.entity-result__badge-icon, .dist-indicator',
  
  // Loading indicators
  skeletonLoader: '.artdeco-loader',
  loadingSpinner: '.loading-spinner',
  
  // End of results indicators
  noResultsMessage: '.artdeco-inline-feedback__message',
  endOfResults: '.artdeco-empty-state',
  noMoreResults: '[data-test-no-results-message]',
  
  // Error states
  errorPage: '.error-page, .artdeco-global-alert--error',
  somethingWentWrong: '.artdeco-inline-feedback--error',
  rateLimitPage: '.rate-limit-message',
};

// ============================================================================
// Search Result Extraction
// ============================================================================

/**
 * Extract search results from current page
 * 
 * @param page - Playwright page instance
 * @returns Array of search results
 */
export async function extractSearchResults(page: Page): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  try {
    // Wait for results to load
    await page.waitForSelector(SEARCH_SELECTORS.resultCards, { timeout: 10000 });
    
    // Extract data from all result cards
    const cards = await page.locator(SEARCH_SELECTORS.resultCards).all();
    
    for (const card of cards) {
      try {
        // Extract profile URL
        const linkElement = card.locator(SEARCH_SELECTORS.profileLink).first();
        const profileUrl = await linkElement.getAttribute('href');
        
        if (!profileUrl || !profileUrl.includes('/in/')) {
          continue;
        }
        
        // Normalize URL
        const normalizedUrl = normalizeProfileUrl(profileUrl);
        
        // Extract name
        const nameElement = card.locator(SEARCH_SELECTORS.name).first();
        const name = await nameElement.textContent().catch(() => '') || '';
        
        // Extract headline
        const headlineElement = card.locator(SEARCH_SELECTORS.headline).first();
        const headline = await headlineElement.textContent().catch(() => '') || '';
        
        // Extract location
        const locationElement = card.locator(SEARCH_SELECTORS.location).first();
        const location = await locationElement.textContent().catch(() => '') || '';
        
        // Extract connection degree
        const connectionElement = card.locator(SEARCH_SELECTORS.connectionDegree).first();
        const connectionDegree = await connectionElement.textContent().catch(() => '') || '';
        
        // Extract profile picture
        const pictureElement = card.locator(SEARCH_SELECTORS.profilePicture).first();
        const profilePicture = await pictureElement.getAttribute('src').catch(() => undefined) ?? undefined;
        
        results.push({
          profileUrl: normalizedUrl,
          name: name.trim(),
          headline: headline.trim(),
          location: location.trim(),
          profilePicture,
          connectionDegree: connectionDegree.trim(),
        });
      } catch (error) {
        logger.debug('Failed to extract individual search result:', error);
        continue;
      }
    }
    
    logger.info(`Extracted ${results.length} search results from current page`);
    return results;
    
  } catch (error) {
    logger.error('Failed to extract search results:', error);
    return [];
  }
}

/**
 * Normalize profile URL to standard format
 */
function normalizeProfileUrl(url: string): string {
  // Remove query parameters
  const cleanUrl = url.split('?')[0];
  
  // Ensure https prefix
  if (cleanUrl.startsWith('/in/')) {
    return `https://www.linkedin.com${cleanUrl}`;
  }
  
  if (!cleanUrl.startsWith('http')) {
    return `https://www.linkedin.com/in/${cleanUrl}`;
  }
  
  return cleanUrl;
}

// ============================================================================
// Infinite Scroll Handling
// ============================================================================

/**
 * Scroll to bottom of page with delays
 * 
 * @param page - Playwright page instance
 * @param maxScrolls - Maximum number of scrolls
 * @returns Number of scrolls performed
 */
export async function scrollToBottom(page: Page, maxScrolls: number = 10): Promise<number> {
  let scrollCount = 0;
  let previousHeight = 0;
  let noChangeCount = 0;
  
  while (scrollCount < maxScrolls) {
    // Get current scroll height
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    
    if (currentHeight === previousHeight) {
      noChangeCount++;
      if (noChangeCount >= 2) {
        logger.info('No new content after scrolling, stopping');
        break;
      }
    } else {
      noChangeCount = 0;
    }
    
    previousHeight = currentHeight;
    
    // Scroll down
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    scrollCount++;
    
    // Wait for new content
    await scrollDelay();
    
    // Wait for any loading indicators
    const hasNewContent = await waitForNewContent(page);
    if (!hasNewContent && noChangeCount >= 1) {
      logger.debug('No new content loaded, may be at end of results');
    }
  }
  
  return scrollCount;
}

/**
 * Wait for new content to load (skeleton loaders to disappear)
 * 
 * @param page - Playwright page instance
 * @param timeout - Maximum wait time in ms
 * @returns True if new content loaded, false if timeout
 */
export async function waitForNewContent(page: Page, timeout: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    // Check if skeleton loaders are present
    const skeletonCount = await page.locator(SEARCH_SELECTORS.skeletonLoader).count();
    const spinnerCount = await page.locator(SEARCH_SELECTORS.loadingSpinner).count();
    
    if (skeletonCount === 0 && spinnerCount === 0) {
      // No loading indicators, content should be loaded
      return true;
    }
    
    // Wait a bit and check again
    await randomDelay(500, 1000);
  }
  
  // Timeout waiting for content
  logger.warn('Timeout waiting for new content to load');
  return false;
}

/**
 * Detect if we've reached end of results
 * 
 * @param page - Playwright page instance
 * @returns True if end of results detected
 */
export async function detectEndOfResults(page: Page): Promise<boolean> {
  try {
    // Check for "no more results" messages
    const endOfResults = await page.locator(SEARCH_SELECTORS.endOfResults).count() > 0;
    const noMoreResults = await page.locator(SEARCH_SELECTORS.noMoreResults).count() > 0;
    const noResultsMessage = await page.locator(SEARCH_SELECTORS.noResultsMessage).count() > 0;
    
    if (endOfResults || noMoreResults || noResultsMessage) {
      logger.info('End of search results detected');
      return true;
    }
    
    // Check if we've scrolled to bottom and no new content
    const scrollPosition = await page.evaluate(() => {
      return window.scrollY + window.innerHeight >= document.body.scrollHeight - 100;
    });
    
    if (scrollPosition) {
      // At bottom of page, check if there are any results
      const resultCount = await page.locator(SEARCH_SELECTORS.resultCards).count();
      if (resultCount === 0) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logger.error('Error detecting end of results:', error);
    return false;
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Check for LinkedIn error states
 * 
 * @param page - Playwright page instance
 * @returns Error type or null if no error
 */
export async function detectErrorState(page: Page): Promise<string | null> {
  try {
    // Check for rate limiting
    const rateLimit = await page.locator(SEARCH_SELECTORS.rateLimitPage).count();
    if (rateLimit > 0) {
      return 'rate_limit';
    }
    
    // Check for generic error page
    const errorPage = await page.locator(SEARCH_SELECTORS.errorPage).count();
    if (errorPage > 0) {
      return 'error_page';
    }
    
    // Check for "Something went wrong"
    const somethingWrong = await page.locator(SEARCH_SELECTORS.somethingWentWrong).count();
    if (somethingWrong > 0) {
      return 'something_went_wrong';
    }
    
    return null;
  } catch (error) {
    logger.error('Error detecting error state:', error);
    return null;
  }
}

/**
 * Handle LinkedIn error state
 * 
 * @param page - Playwright page instance
 * @param errorType - Type of error detected
 */
export async function handleErrorState(page: Page, errorType: string): Promise<void> {
  logger.error(`LinkedIn error state detected: ${errorType}`);
  
  switch (errorType) {
    case 'rate_limit':
      // Circuit breaker will handle this
      globalCircuitBreaker.recordFailure(new Error('Rate limited by LinkedIn'));
      break;
      
    case 'something_went_wrong':
      // Try refreshing the page
      logger.info('Attempting to refresh page...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await randomDelay(3000, 5000);
      break;
      
    case 'error_page':
      // Can't recover from this
      throw new Error('LinkedIn error page encountered');
      
    default:
      logger.warn(`Unknown error type: ${errorType}`);
  }
}

// ============================================================================
// Pagination State Management
// ============================================================================

/**
 * Save pagination progress to file
 * 
 * @param state - Current pagination state
 */
async function savePaginationState(state: PaginationState): Promise<void> {
  try {
    // Convert Set to Array for serialization
    const serializedState = {
      ...state,
      scrapedUrls: Array.from(state.scrapedUrls),
    };
    
    // Save to temp file for resume capability
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const tempDir = os.tmpdir();
    const stateFile = path.join(tempDir, 'linkedin-pagination-state.json');
    
    await fs.writeFile(stateFile, JSON.stringify(serializedState, null, 2));
    logger.debug('Pagination state saved');
  } catch (error) {
    logger.error('Failed to save pagination state:', error);
  }
}

/**
 * Load pagination state from file
 * 
 * @returns Saved state or null if not found
 */
export async function loadPaginationState(): Promise<PaginationState | null> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const tempDir = os.tmpdir();
    const stateFile = path.join(tempDir, 'linkedin-pagination-state.json');
    
    const data = await fs.readFile(stateFile, 'utf-8');
    const parsed = JSON.parse(data);
    
    // Convert Array back to Set
    return {
      ...parsed,
      scrapedUrls: new Set(parsed.scrapedUrls),
      lastActivity: new Date(parsed.lastActivity),
    };
  } catch {
    // No saved state or error reading
    return null;
  }
}

/**
 * Clear pagination state
 */
export async function clearPaginationState(): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const tempDir = os.tmpdir();
    const stateFile = path.join(tempDir, 'linkedin-pagination-state.json');
    
    await fs.unlink(stateFile);
    logger.info('Pagination state cleared');
  } catch {
    // Ignore errors (file might not exist)
  }
}

// ============================================================================
// Search Pagination Class
// ============================================================================

/**
 * Search Pagination Handler
 * Manages pagination through LinkedIn search results with resume capability
 */
export class SearchPagination {
  private page: Page;
  private config: PaginationConfig;
  private state: PaginationState;
  private results: SearchResult[];
  private onProgressCallback?: (stats: { scraped: number; total: number }) => void;
  private onResultCallback?: (result: SearchResult) => void;

  constructor(
    page: Page,
    searchUrl: string,
    config?: Partial<PaginationConfig>
  ) {
    this.page = page;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.results = [];
    
    this.state = {
      searchUrl,
      profilesScraped: 0,
      scrollCount: 0,
      scrapedUrls: new Set(),
      lastActivity: new Date(),
      isPaused: false,
      isStopped: false,
      errorCount: 0,
    };
  }

  /**
   * Set progress callback
   */
  onProgress(callback: (stats: { scraped: number; total: number }) => void): void {
    this.onProgressCallback = callback;
  }

  /**
   * Set result callback (called for each new result)
   */
  onResult(callback: (result: SearchResult) => void): void {
    this.onResultCallback = callback;
  }

  /**
   * Start pagination
   */
  async start(): Promise<SearchResult[]> {
    logger.info('Starting search pagination...');
    
    const startTime = Date.now();
    
    while (!this.state.isStopped && !this.state.isPaused) {
      // Check total timeout
      if (Date.now() - startTime > this.config.totalTimeout) {
        logger.warn('Total pagination timeout reached');
        break;
      }
      
      // Check circuit breaker
      if (!globalCircuitBreaker.canExecute()) {
        const stats = globalCircuitBreaker.getStats();
        logger.warn(`Circuit breaker open, waiting ${Math.ceil(stats.timeUntilRecovery / 60000)} minutes`);
        await new Promise(resolve => setTimeout(resolve, stats.timeUntilRecovery));
        continue;
      }
      
      // Check for error states
      const errorState = await detectErrorState(this.page);
      if (errorState) {
        await handleErrorState(this.page, errorState);
        this.state.errorCount++;
        
        if (this.state.errorCount > 3) {
          logger.error('Too many errors, stopping pagination');
          break;
        }
        
        continue;
      }
      
      // Extract results from current view
      const newResults = await extractSearchResults(this.page);
      
      // Filter duplicates and add to collection
      for (const result of newResults) {
        if (!this.state.scrapedUrls.has(result.profileUrl)) {
          this.state.scrapedUrls.add(result.profileUrl);
          this.results.push(result);
          
          // Notify callbacks
          this.onResultCallback?.(result);
          
          logger.debug(`New result: ${result.name} - ${result.profileUrl}`);
        }
      }
      
      // Update progress
      this.state.profilesScraped = this.results.length;
      this.state.lastActivity = new Date();
      this.onProgressCallback?.({ scraped: this.state.profilesScraped, total: this.state.profilesScraped });
      
      // Save progress periodically
      if (this.state.profilesScraped % this.config.saveBatchSize === 0) {
        await savePaginationState(this.state);
        logger.info(`Progress saved: ${this.state.profilesScraped} profiles scraped`);
      }
      
      // Check if end of results
      const isEndOfResults = await detectEndOfResults(this.page);
      if (isEndOfResults) {
        logger.info('Reached end of search results');
        break;
      }
      
      // Scroll for more results
      const scrollsPerformed = await scrollToBottom(this.page, 1);
      this.state.scrollCount += scrollsPerformed;
      
      if (this.state.scrollCount >= this.config.maxScrolls) {
        logger.info(`Maximum scrolls (${this.config.maxScrolls}) reached`);
        break;
      }
    }
    
    // Final save
    await savePaginationState(this.state);
    
    logger.info(`Pagination complete: ${this.results.length} total profiles scraped`);
    return this.results;
  }

  /**
   * Pause pagination
   */
  pause(): void {
    logger.info('Pausing pagination...');
    this.state.isPaused = true;
    savePaginationState(this.state);
  }

  /**
   * Resume pagination
   */
  async resume(): Promise<SearchResult[]> {
    if (!this.state.isPaused) {
      logger.warn('Pagination not paused, cannot resume');
      return this.results;
    }
    
    logger.info('Resuming pagination...');
    this.state.isPaused = false;
    this.state.lastActivity = new Date();
    
    return this.start();
  }

  /**
   * Stop pagination
   */
  stop(): void {
    logger.info('Stopping pagination...');
    this.state.isStopped = true;
    savePaginationState(this.state);
  }

  /**
   * Get current stats
   */
  getStats(): {
    profilesScraped: number;
    scrollCount: number;
    isPaused: boolean;
    isStopped: boolean;
    errorCount: number;
  } {
    return {
      profilesScraped: this.state.profilesScraped,
      scrollCount: this.state.scrollCount,
      isPaused: this.state.isPaused,
      isStopped: this.state.isStopped,
      errorCount: this.state.errorCount,
    };
  }

  /**
   * Get all results
   */
  getResults(): SearchResult[] {
    return [...this.results];
  }

  /**
   * Load and resume from saved state
   */
  static async resumeFromState(
    page: Page,
    config?: Partial<PaginationConfig>
  ): Promise<SearchPagination | null> {
    const savedState = await loadPaginationState();
    
    if (!savedState) {
      logger.info('No saved pagination state found');
      return null;
    }
    
    logger.info(`Resuming pagination from saved state: ${savedState.profilesScraped} profiles already scraped`);
    
    const pagination = new SearchPagination(page, savedState.searchUrl, config);
    pagination.state = {
      ...savedState,
      scrapedUrls: new Set(savedState.scrapedUrls),
      isPaused: false,
      isStopped: false,
    };
    
    return pagination;
  }
}

// ============================================================================
// Export Functions
// ============================================================================

export { SEARCH_SELECTORS };
