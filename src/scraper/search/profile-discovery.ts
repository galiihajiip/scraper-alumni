/**
 * Profile URL Discovery & Filtering
 * 
 * System for collecting and filtering profile URLs before extraction phase.
 * Handles URL collection, alumni filtering by graduation year, queue management,
 * deduplication, and batch processing.
 * 
 * Features:
 * - Profile URL collection from search results
 * - Alumni filtering by angkatan (2004-2026)
 * - Priority queue management
 * - Database deduplication
 * - Batch processing with pauses
 * 
 * @module scraper/search/profile-discovery
 */

import type { Page } from 'playwright';
import { logger } from '@/utils/logger';
import { randomDelay } from '@/scraper/rate-limiter';
import { retryWithBackoff } from '@/scraper/retry-handler';
import * as alumniRepo from '@/database/repositories/alumni.repository';
import { SearchPagination, SearchResult } from './pagination';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Filtered profile result with metadata
 */
export interface FilteredResult {
  /** Profile URL */
  profileUrl: string;
  /** Profile name */
  name: string;
  /** Whether profile matches alumni criteria */
  isAlumni: boolean;
  /** Graduation year if detected */
  graduationYear?: number;
  /** Priority score (higher = process first) */
  priority: number;
  /** Last scraped timestamp if exists */
  lastScraped?: Date;
}

/**
 * Queue item with priority
 */
export interface QueueItem {
  /** Profile URL */
  url: string;
  /** Profile name */
  name: string;
  /** Priority score */
  priority: number;
  /** Timestamp added to queue */
  addedAt: Date;
  /** Number of retry attempts */
  retryCount: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Profile discovery configuration
 */
export interface DiscoveryConfig {
  /** Maximum profiles to collect per search */
  maxProfilesPerSearch: number;
  /** Batch size for processing */
  batchSize: number;
  /** Pause duration between batches in ms */
  batchPauseMs: number;
  /** Year range for alumni filtering */
  yearRange: { start: number; end: number };
  /** Whether to check database for existing profiles */
  checkDatabase: boolean;
  /** Priority boost for never-scraped profiles */
  newProfilePriority: number;
  /** Priority penalty for recently scraped profiles (days) */
  recentScrapeThreshold: number;
}

/**
 * Discovery statistics
 */
export interface DiscoveryStats {
  /** Total URLs discovered */
  totalDiscovered: number;
  /** Unique URLs after deduplication */
  uniqueUrls: number;
  /** URLs already in database */
  existingInDb: number;
  /** New URLs to scrape */
  newUrls: number;
  /** Alumni matches (passed year filter) */
  alumniMatches: number;
  /** Non-alumni filtered out */
  nonAlumniFiltered: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: DiscoveryConfig = {
  maxProfilesPerSearch: 100,
  batchSize: 10,
  batchPauseMs: 5000,
  yearRange: { start: 2004, end: 2026 },
  checkDatabase: true,
  newProfilePriority: 100,
  recentScrapeThreshold: 30,
};

// ============================================================================
// Profile URL Collector
// ============================================================================

/**
 * Collect profile URLs from a LinkedIn search URL
 * 
 * @param page - Playwright page instance
 * @param searchUrl - LinkedIn search URL
 * @param limit - Maximum number of profiles to collect
 * @returns Array of search results
 */
export async function collectProfileUrls(
  page: Page,
  searchUrl: string,
  limit: number = 100
): Promise<SearchResult[]> {
  logger.info(`Collecting profile URLs from: ${searchUrl}`);
  
  // Navigate to search URL
  await retryWithBackoff(
    async () => {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await randomDelay(2000, 3000);
    },
    { url: searchUrl, maxRetries: 3 }
  );
  
  // Handle pagination and collect results
  const pagination = new SearchPagination(page, searchUrl, {
    maxScrolls: Math.ceil(limit / 10), // Approximate 10 profiles per scroll
  });
  
  // Collect results with limit
  const results: SearchResult[] = [];
  
  pagination.onResult((result) => {
    if (results.length < limit) {
      results.push(result);
    } else {
      pagination.stop();
    }
  });
  
  await pagination.start();
  
  logger.info(`Collected ${results.length} profile URLs`);
  return results;
}

/**
 * Quick education check by opening profile briefly
 * This is a lightweight check to see if profile matches alumni criteria
 * 
 * @param page - Playwright page instance
 * @param profileUrl - Profile URL to check
 * @returns Education info or null
 */
export async function quickEducationCheck(
  page: Page,
  profileUrl: string
): Promise<{ school?: string; year?: number } | null> {
  try {
    // Open profile in new tab or navigate briefly
    await retryWithBackoff(
      async () => {
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
        await randomDelay(1000, 2000);
      },
      { url: profileUrl, maxRetries: 2, baseDelay: 500 }
    );
    
    // Look for education section indicators in preview
    const educationSelectors = [
      '.education-section',
      '.pv-education-entity',
      '[data-section="educations"]',
      '.profile-education',
    ];
    
    for (const selector of educationSelectors) {
      const element = page.locator(selector).first();
      const isVisible = await element.isVisible().catch(() => false);
      
      if (isVisible) {
        // Extract school name
        const schoolText = await element.locator('.pv-entity__school-name, .education__school').textContent().catch(() => '');
        
        // Extract year if available
        const dateText = await element.locator('.pv-entity__dates, .education__date').textContent().catch(() => '') ?? '';
        const yearMatch = dateText.match(/20\d{2}/);
        const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;
        
        return {
          school: schoolText?.trim(),
          year,
        };
      }
    }
    
    return null;
  } catch (error) {
    logger.debug(`Failed quick education check for ${profileUrl}:`, error);
    return null;
  }
}

// ============================================================================
// Alumni Filtering
// ============================================================================

/**
 * Filter profiles by graduation year (angkatan)
 * 
 * @param results - Search results to filter
 * @param yearRange - Year range for filtering (e.g., 2004-2026)
 * @param page - Playwright page for quick checks (optional)
 * @returns Filtered results with alumni flag
 */
export async function filterByAngkatan(
  results: SearchResult[],
  yearRange: { start: number; end: number },
  page?: Page
): Promise<FilteredResult[]> {
  logger.info(`Filtering ${results.length} profiles by year range ${yearRange.start}-${yearRange.end}`);
  
  const filtered: FilteredResult[] = [];
  
  for (const result of results) {
    let isAlumni = false;
    let graduationYear: number | undefined;
    
    // Try to extract year from headline/location (sometimes contains year)
    const yearMatch = result.headline.match(/(?:lulus|angkatan|class of)\s*(20\d{2})/i);
    if (yearMatch) {
      graduationYear = parseInt(yearMatch[1], 10);
      isAlumni = graduationYear >= yearRange.start && graduationYear <= yearRange.end;
    }
    
    // If no year found and page available, do quick check
    if (!isAlumni && page && !graduationYear) {
      const eduInfo = await quickEducationCheck(page, result.profileUrl);
      if (eduInfo?.year) {
        graduationYear = eduInfo.year;
        isAlumni = graduationYear >= yearRange.start && graduationYear <= yearRange.end;
      }
      
      // Check school name
      if (eduInfo?.school) {
        const schoolLower = eduInfo.school.toLowerCase();
        const upnKeywords = ['upn', 'veteran', 'pembangunan nasional'];
        const hasUpn = upnKeywords.some(kw => schoolLower.includes(kw));
        
        if (hasUpn) {
          isAlumni = true;
        }
      }
    }
    
    // Default: include all if we can't determine (will be filtered in extraction)
    if (!graduationYear && !isAlumni) {
      isAlumni = true; // Conservative: include for full extraction
    }
    
    filtered.push({
      profileUrl: result.profileUrl,
      name: result.name,
      isAlumni,
      graduationYear,
      priority: 0, // Will be calculated later
    });
    
    // Small delay between checks
    if (page) {
      await randomDelay(500, 1000);
    }
  }
  
  const alumniCount = filtered.filter(f => f.isAlumni).length;
  logger.info(`Filtered: ${alumniCount} alumni matches out of ${filtered.length} total`);
  
  return filtered;
}

// ============================================================================
// URL Queue Management
// ============================================================================

/**
 * Priority queue for profile URLs
 * Manages URL processing order based on priority scores
 */
export class ProfileQueue {
  private queue: QueueItem[];
  private processedUrls: Set<string>;
  private config: DiscoveryConfig;

  constructor(config?: Partial<DiscoveryConfig>) {
    this.queue = [];
    this.processedUrls = new Set();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add URL to queue with priority calculation
   */
  async addUrl(
    url: string,
    name: string,
    graduationYear?: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Skip if already in queue or processed
    if (this.processedUrls.has(url) || this.queue.some(item => item.url === url)) {
      return;
    }
    
    // Calculate priority
    const priority = await this.calculatePriority(url, graduationYear);
    
    this.queue.push({
      url,
      name,
      priority,
      addedAt: new Date(),
      retryCount: 0,
      metadata,
    });
    
    // Sort by priority (descending)
    this.queue.sort((a, b) => b.priority - a.priority);
    
    logger.debug(`Added to queue: ${name} (${url}) with priority ${priority}`);
  }

  /**
   * Add multiple URLs to queue
   */
  async addUrls(urls: FilteredResult[]): Promise<void> {
    for (const url of urls) {
      await this.addUrl(url.profileUrl, url.name, url.graduationYear);
    }
    logger.info(`Added ${urls.length} URLs to queue`);
  }

  /**
   * Get next URL from queue (highest priority)
   */
  getNext(): QueueItem | undefined {
    return this.queue.shift();
  }

  /**
   * Peek at next URL without removing
   */
  peek(): QueueItem | undefined {
    return this.queue[0];
  }

  /**
   * Get batch of URLs for processing
   */
  getBatch(size: number = this.config.batchSize): QueueItem[] {
    return this.queue.splice(0, size);
  }

  /**
   * Mark URL as processed
   */
  markProcessed(url: string): void {
    this.processedUrls.add(url);
    
    // Remove from queue if present
    const index = this.queue.findIndex(item => item.url === url);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  /**
   * Re-queue URL for retry
   */
  requeue(url: string, incrementRetry: boolean = true): void {
    const item = this.queue.find(i => i.url === url);
    if (item) {
      if (incrementRetry) {
        item.retryCount++;
      }
      // Reduce priority for retries
      item.priority = Math.max(0, item.priority - 10 * item.retryCount);
      
      // Re-sort
      this.queue.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueSize: number;
    processedCount: number;
    highPriority: number;
    retryPending: number;
  } {
    return {
      queueSize: this.queue.length,
      processedCount: this.processedUrls.size,
      highPriority: this.queue.filter(i => i.priority >= 80).length,
      retryPending: this.queue.filter(i => i.retryCount > 0).length,
    };
  }

  /**
   * Calculate priority score for URL
   */
  private async calculatePriority(url: string, graduationYear?: number): Promise<number> {
    let priority = 50; // Base priority
    
    // Check database for existing profile
    if (this.config.checkDatabase) {
      try {
        // Check if alumni exists by LinkedIn URL
        const exists = await alumniRepo.existsByLinkedInUrl(url);
        
        if (!exists) {
          // Never scraped - highest priority
          priority += this.config.newProfilePriority;
        } else {
          // Previously scraped - fetch to check last scraped date
          const existing = await alumniRepo.findByLinkedInUrl(url);
          if (existing?.lastScrapedAt) {
            const daysSinceScrape = Math.floor(
              (Date.now() - existing.lastScrapedAt.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (daysSinceScrape > this.config.recentScrapeThreshold) {
              priority += 50; // Old data, medium priority
            } else {
              priority += 10; // Recent data, low priority
            }
          } else {
            priority += 30; // No date, assume medium
          }
        }
      } catch (error) {
        logger.debug(`Failed to check database for ${url}:`, error);
        // Assume new profile if check fails
        priority += this.config.newProfilePriority;
      }
    }
    
    // Boost for recent graduation years (more likely to have current data)
    if (graduationYear) {
      const currentYear = new Date().getFullYear();
      const yearsSinceGrad = currentYear - graduationYear;
      
      if (yearsSinceGrad <= 5) {
        priority += 20; // Recent graduates
      } else if (yearsSinceGrad <= 10) {
        priority += 10; // Moderately recent
      }
    }
    
    return Math.min(priority, 200); // Cap at 200
  }

  /**
   * Save queue state to file
   */
  async saveToFile(filepath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      
      const state = {
        queue: this.queue,
        processedUrls: Array.from(this.processedUrls),
        savedAt: new Date().toISOString(),
      };
      
      await fs.writeFile(filepath, JSON.stringify(state, null, 2));
      logger.info(`Queue saved to ${filepath}: ${this.queue.length} items`);
    } catch (error) {
      logger.error('Failed to save queue state:', error);
      throw error;
    }
  }

  /**
   * Load queue state from file
   */
  async loadFromFile(filepath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      
      const data = await fs.readFile(filepath, 'utf-8');
      const state = JSON.parse(data);
      
      this.queue = state.queue || [];
      this.processedUrls = new Set(state.processedUrls || []);
      
      logger.info(`Queue loaded from ${filepath}: ${this.queue.length} items, ${this.processedUrls.size} processed`);
    } catch (error) {
      logger.error('Failed to load queue state:', error);
      throw error;
    }
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue = [];
    this.processedUrls.clear();
    logger.info('Queue cleared');
  }
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Deduplication service with memory cache and database check
 */
export class DeduplicationService {
  private memoryCache: Set<string>;
  private config: DiscoveryConfig;

  constructor(config?: Partial<DiscoveryConfig>) {
    this.memoryCache = new Set();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if URL is duplicate
   */
  async isDuplicate(url: string): Promise<boolean> {
    // Check memory cache first (fastest)
    if (this.memoryCache.has(url)) {
      return true;
    }
    
    // Check database if enabled
    if (this.config.checkDatabase) {
      try {
        // Check if alumni exists by LinkedIn URL
        const exists = await alumniRepo.existsByLinkedInUrl(url);
        if (exists) {
          // Add to cache for future checks
          this.memoryCache.add(url);
          return true;
        }
      } catch (error) {
        logger.debug(`Database check failed for ${url}:`, error);
      }
    }
    
    return false;
  }

  /**
   * Mark URL as seen
   */
  markSeen(url: string): void {
    this.memoryCache.add(url);
  }

  /**
   * Filter duplicate URLs from list
   */
  async filterDuplicates(urls: string[]): Promise<{ unique: string[]; duplicates: string[] }> {
    const unique: string[] = [];
    const duplicates: string[] = [];
    
    for (const url of urls) {
      const isDup = await this.isDuplicate(url);
      if (isDup) {
        duplicates.push(url);
      } else {
        unique.push(url);
        this.markSeen(url);
      }
    }
    
    logger.info(`Deduplication: ${unique.length} unique, ${duplicates.length} duplicates`);
    return { unique, duplicates };
  }

  /**
   * Get cache size
   */
  get cacheSize(): number {
    return this.memoryCache.size;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.memoryCache.clear();
    logger.info('Deduplication cache cleared');
  }
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Batch processor for handling profiles in chunks
 */
export class BatchProcessor {
  private config: DiscoveryConfig;
  private batchStartCallback?: (batch: QueueItem[]) => void;
  private batchCompleteCallback?: (batch: QueueItem[], results: unknown[]) => void;

  constructor(config?: Partial<DiscoveryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set batch start callback
   */
  onBatchStart(callback: (batch: QueueItem[]) => void): void {
    this.batchStartCallback = callback;
  }

  /**
   * Set batch complete callback
   */
  onBatchComplete(callback: (batch: QueueItem[], results: unknown[]) => void): void {
    this.batchCompleteCallback = callback;
  }

  /**
   * Process queue in batches
   */
  async processQueue<T>(
    queue: ProfileQueue,
    processor: (item: QueueItem) => Promise<T>
  ): Promise<T[]> {
    const allResults: T[] = [];
    let batchNumber = 0;
    
    while (!queue.isEmpty) {
      batchNumber++;
      const batch = queue.getBatch(this.config.batchSize);
      
      if (batch.length === 0) break;
      
      logger.info(`Processing batch ${batchNumber}: ${batch.length} profiles`);
      this.batchStartCallback?.(batch);
      
      // Process batch concurrently
      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          try {
            const result = await processor(item);
            queue.markProcessed(item.url);
            return result;
          } catch (error) {
            queue.requeue(item.url, true);
            throw error;
          }
        })
      );
      
      // Collect successful results
      const successful: T[] = [];
      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          successful.push((r as PromiseFulfilledResult<T>).value);
        }
      }
      
      allResults.push(...successful);
      
      // Log failures
      const failures = batchResults.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        logger.warn(`Batch ${batchNumber}: ${failures.length} failures`);
      }
      
      this.batchCompleteCallback?.(batch, successful);
      
      // Pause between batches (unless queue is empty)
      if (!queue.isEmpty) {
        logger.info(`Pausing ${this.config.batchPauseMs}ms between batches...`);
        await new Promise(resolve => setTimeout(resolve, this.config.batchPauseMs));
      }
    }
    
    logger.info(`Batch processing complete: ${allResults.length} results from ${batchNumber} batches`);
    return allResults;
  }
}

// ============================================================================
// Profile Discovery Service
// ============================================================================

/**
 * Main profile discovery service
 * Orchestrates URL collection, filtering, deduplication, and queue management
 */
export class ProfileDiscovery {
  private page: Page;
  private config: DiscoveryConfig;
  private queue: ProfileQueue;
  private dedupService: DeduplicationService;
  private batchProcessor: BatchProcessor;
  private stats: DiscoveryStats;

  constructor(page: Page, config?: Partial<DiscoveryConfig>) {
    this.page = page;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queue = new ProfileQueue(this.config);
    this.dedupService = new DeduplicationService(this.config);
    this.batchProcessor = new BatchProcessor(this.config);
    
    this.stats = {
      totalDiscovered: 0,
      uniqueUrls: 0,
      existingInDb: 0,
      newUrls: 0,
      alumniMatches: 0,
      nonAlumniFiltered: 0,
    };
  }

  /**
   * Discover profiles from search URL
   */
  async discoverFromSearch(searchUrl: string, limit?: number): Promise<FilteredResult[]> {
    const actualLimit = limit || this.config.maxProfilesPerSearch;
    
    logger.info(`Starting profile discovery from: ${searchUrl}`);
    
    // Collect URLs
    const searchResults = await collectProfileUrls(this.page, searchUrl, actualLimit);
    this.stats.totalDiscovered = searchResults.length;
    
    // Extract URLs for deduplication
    const urls = searchResults.map(r => r.profileUrl);
    const { unique, duplicates } = await this.dedupService.filterDuplicates(urls);
    
    this.stats.uniqueUrls = unique.length;
    this.stats.existingInDb = duplicates.length;
    
    // Filter to unique results
    const uniqueResults = searchResults.filter(r => unique.includes(r.profileUrl));
    
    // Filter by angkatan
    const filtered = await filterByAngkatan(uniqueResults, this.config.yearRange, this.page);
    
    this.stats.alumniMatches = filtered.filter(f => f.isAlumni).length;
    this.stats.nonAlumniFiltered = filtered.filter(f => !f.isAlumni).length;
    
    // Add to queue
    await this.queue.addUrls(filtered);
    
    this.stats.newUrls = this.queue.size;
    
    logger.info(`Discovery complete: ${this.getStatsString()}`);
    return filtered;
  }

  /**
   * Get next batch of profiles to scrape
   */
  getNextBatch(size?: number): QueueItem[] {
    return this.queue.getBatch(size || this.config.batchSize);
  }

  /**
   * Mark profile as processed
   */
  markProcessed(url: string): void {
    this.queue.markProcessed(url);
    this.dedupService.markSeen(url);
  }

  /**
   * Requeue profile for retry
   */
  requeue(url: string): void {
    this.queue.requeue(url);
  }

  /**
   * Get discovery statistics
   */
  getStats(): DiscoveryStats {
    return { ...this.stats };
  }

  /**
   * Get formatted stats string
   */
  getStatsString(): string {
    return [
      `Discovered: ${this.stats.totalDiscovered}`,
      `Unique: ${this.stats.uniqueUrls}`,
      `Existing: ${this.stats.existingInDb}`,
      `Alumni: ${this.stats.alumniMatches}`,
      `Non-alumni: ${this.stats.nonAlumniFiltered}`,
      `Queue: ${this.queue.size}`,
    ].join(' | ');
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): ReturnType<ProfileQueue['getStats']> {
    return this.queue.getStats();
  }

  /**
   * Save queue state
   */
  async saveQueue(filepath: string): Promise<void> {
    await this.queue.saveToFile(filepath);
  }

  /**
   * Load queue state
   */
  async loadQueue(filepath: string): Promise<void> {
    await this.queue.loadFromFile(filepath);
  }

  /**
   * Check if discovery is complete
   */
  get isComplete(): boolean {
    return this.queue.isEmpty;
  }

  /**
   * Get queue size
   */
  get queueSize(): number {
    return this.queue.size;
  }

  /**
   * Process remaining queue in batches
   */
  async processQueue<T>(processor: (item: QueueItem) => Promise<T>): Promise<T[]> {
    return this.batchProcessor.processQueue(this.queue, processor);
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.queue.clear();
    this.dedupService.clearCache();
    this.stats = {
      totalDiscovered: 0,
      uniqueUrls: 0,
      existingInDb: 0,
      newUrls: 0,
      alumniMatches: 0,
      nonAlumniFiltered: 0,
    };
    logger.info('Profile discovery state cleared');
  }
}

// ============================================================================
// Export
// ============================================================================

// Types are exported via 'export interface' declarations above
