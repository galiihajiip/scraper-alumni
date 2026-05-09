/**
 * Profile Overview Extraction
 * 
 * Extracts basic profile data from LinkedIn profile header:
 * name, headline, location, photo URL, connection degree, and about section.
 * 
 * Features:
 * - Multiple selector strategies with fallback system
 * - Name parsing and cleaning
 * - About section expansion and extraction
 * - Error handling for private/incomplete profiles
 * 
 * @module scraper/extraction/overview
 */

import type { Page } from 'playwright';
import { logger } from '@/utils/logger';
import { randomDelay } from '@/scraper/rate-limiter';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Profile overview data structure
 */
export interface ProfileOverview {
  /** Full name of the profile owner */
  fullName: string;
  /** Professional headline/title */
  headline: string;
  /** Geographic location */
  location: string;
  /** Profile photo URL (if public) */
  profilePhotoUrl?: string;
  /** Connection degree (1st, 2nd, 3rd+) */
  connectionDegree?: string;
  /** About section text */
  about?: string;
  /** Profile URL */
  profileUrl: string;
  /** Whether profile has limited view */
  isLimitedView: boolean;
}

/**
 * Extraction configuration
 */
export interface ExtractionConfig {
  /** Timeout for element selection in ms */
  elementTimeout: number;
  /** Whether to expand about section */
  expandAbout: boolean;
  /** Maximum about text length */
  maxAboutLength: number;
}

/**
 * Selector group for fallback strategy
 */
interface SelectorGroup {
  /** Primary selector */
  primary: string;
  /** Fallback selectors in order of preference */
  fallbacks: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ExtractionConfig = {
  elementTimeout: 5000,
  expandAbout: true,
  maxAboutLength: 5000,
};

// ============================================================================
// Selector Definitions
// ============================================================================

/**
 * Profile element selectors with fallbacks
 */
const SELECTORS: Record<string, SelectorGroup> = {
  fullName: {
    primary: 'h1.text-heading-xlarge',
    fallbacks: [
      '.pv-top-card__name',
      '.profile-card__name',
      '[data-testid="profile-name"]',
      '.top-card-layout__entity-info h1',
      '.artdeco-entity-lockup__title',
      'h1[data-testid="profile-top-card-name"]',
      'h1.profile-topcard__name',
    ],
  },
  headline: {
    primary: '.text-body-medium',
    fallbacks: [
      '.pv-top-card__headline',
      '.profile-card__headline',
      '[data-testid="profile-headline"]',
      '.top-card-layout__headline',
      '.artdeco-entity-lockup__subtitle',
      '.profile-topcard__content h2',
      '.pv-top-card--list .text-body-small',
    ],
  },
  location: {
    primary: '.pv-top-card__distance-badge + span',
    fallbacks: [
      '.pv-top-card__location',
      '.profile-card__location',
      '[data-testid="profile-location"]',
      '.top-card-layout__location',
      '.artdeco-entity-lockup__metadata',
      '.profile-topcard__location',
      '.pv-top-card__distance-badge ~ .text-body-small',
    ],
  },
  profilePhoto: {
    primary: '.pv-top-card__photo img',
    fallbacks: [
      '.profile-card__image img',
      '[data-testid="profile-photo"] img',
      '.top-card-layout__entity-image img',
      '.artdeco-entity-lockup__image img',
      '.presence-entity__image',
      '.ivm-view-attr__img--centered',
      '.pv-top-card__photo-wrapper img',
      '.profile-topcard__photo img',
    ],
  },
  connectionDegree: {
    primary: '.pv-top-card__distance-badge .dist-indicator',
    fallbacks: [
      '.pv-top-card__distance-badge span',
      '.profile-card__distance-badge',
      '[data-testid="distance-badge"]',
      '.top-card-layout__distance-badge',
      '.dist-indicator',
      '.profile-topcard__distance-badge',
      '.artdeco-entity-lockup__distance-badge',
    ],
  },
  about: {
    primary: '.pv-about__summary-text',
    fallbacks: [
      '.pv-about-section .inline-show-more-text',
      '[data-testid="about-section"] .text-body-medium',
      '.about-section .text-body-medium',
      '.core-section-container:has-text("About") .text-body-medium',
      '#about span[aria-hidden="true"]',
      '.pv-profile-section__summary-text',
    ],
  },
  aboutShowMore: {
    primary: '.pv-about__summary-text .inline-show-more-text__button',
    fallbacks: [
      '.pv-about-section [data-testid="about-show-more"]',
      '.about-section .inline-show-more-text__button',
      '.core-section-container:has-text("About") button:has-text("...more")',
      '#about button:has-text("...more")',
      '.pv-profile-section__summary .inline-show-more-text__button',
    ],
  },
};

// ============================================================================
// Core Extraction Functions
// ============================================================================

/**
 * Extract profile overview from LinkedIn page
 * 
 * @param page - Playwright page instance
 * @param config - Extraction configuration
 * @returns Profile overview data or null if extraction failed
 */
export async function extractProfileOverview(
  page: Page,
  config?: Partial<ExtractionConfig>
): Promise<ProfileOverview | null> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  
  logger.info('Extracting profile overview...');
  
  try {
    // Wait for main profile content to load
    await page.waitForSelector(SELECTORS.fullName.primary, { timeout: opts.elementTimeout })
      .catch(() => {
        logger.warn('Primary name selector not found, trying fallbacks...');
      });
    
    // Extract basic fields
    const fullName = await extractTextWithFallback(page, SELECTORS.fullName);
    const headline = await extractTextWithFallback(page, SELECTORS.headline);
    const location = await extractTextWithFallback(page, SELECTORS.location);
    const profilePhotoUrl = await extractImageWithFallback(page, SELECTORS.profilePhoto);
    const connectionDegree = await extractConnectionDegree(page, SELECTORS.connectionDegree);
    
    // Check if we have minimal required data
    if (!fullName && !headline) {
      logger.error('Unable to extract basic profile data - may be private or loading');
      return null;
    }
    
    // Extract about section
    let about: string | undefined;
    if (opts.expandAbout) {
      const aboutText = await extractAboutSection(page, opts);
      about = aboutText ?? undefined;
    }
    
    // Determine if limited view
    const isLimitedView = await detectLimitedView(page);
    
    // Build result
    const overview: ProfileOverview = {
      fullName: cleanName(fullName || 'Unknown'),
      headline: cleanText(headline || ''),
      location: cleanText(location || ''),
      profilePhotoUrl: profilePhotoUrl ?? undefined,
      connectionDegree: connectionDegree ?? undefined,
      about: about ?? undefined,
      profileUrl: page.url(),
      isLimitedView,
    };
    
    logger.info(`Profile overview extracted: ${overview.fullName}`);
    return overview;
    
  } catch (error) {
    logger.error('Failed to extract profile overview:', error);
    return null;
  }
}

/**
 * Extract text content using selector with fallback strategy
 */
async function extractTextWithFallback(
  page: Page,
  selectorGroup: SelectorGroup
): Promise<string | null> {
  const allSelectors = [selectorGroup.primary, ...selectorGroup.fallbacks];
  
  for (const selector of allSelectors) {
    try {
      const element = page.locator(selector).first();
      const visible = await element.isVisible().catch(() => false);
      
      if (visible) {
        const text = await element.textContent({ timeout: 1000 });
        if (text && text.trim()) {
          return text.trim();
        }
      }
    } catch {
      // Try next selector
      continue;
    }
  }
  
  return null;
}

/**
 * Extract image URL using selector with fallback strategy
 */
async function extractImageWithFallback(
  page: Page,
  selectorGroup: SelectorGroup
): Promise<string | null> {
  const allSelectors = [selectorGroup.primary, ...selectorGroup.fallbacks];
  
  for (const selector of allSelectors) {
    try {
      const element = page.locator(selector).first();
      const visible = await element.isVisible().catch(() => false);
      
      if (visible) {
        const src = await element.getAttribute('src', { timeout: 1000 });
        if (src && src.trim()) {
          return src.trim();
        }
      }
    } catch {
      // Try next selector
      continue;
    }
  }
  
  return null;
}

/**
 * Extract connection degree text
 */
async function extractConnectionDegree(
  page: Page,
  selectorGroup: SelectorGroup
): Promise<string | null> {
  const text = await extractTextWithFallback(page, selectorGroup);
  
  if (text) {
    // Normalize connection degree
    const normalized = text.toLowerCase().trim();
    if (normalized.includes('1st')) return '1st';
    if (normalized.includes('2nd')) return '2nd';
    if (normalized.includes('3rd')) return '3rd';
    if (normalized.includes('3rd+')) return '3rd+';
    
    // Handle numeric formats
    const match = normalized.match(/(\d)(?:st|nd|rd|th)/);
    if (match) {
      const degree = parseInt(match[1], 10);
      if (degree === 1) return '1st';
      if (degree === 2) return '2nd';
      if (degree >= 3) return '3rd+';
    }
  }
  
  return null;
}

// ============================================================================
// About Section Extraction
// ============================================================================

/**
 * Extract about section with expansion
 */
async function extractAboutSection(
  page: Page,
  config: ExtractionConfig
): Promise<string | null> {
  try {
    // First, try to find and click "...more" button to expand full text
    const moreButtonSelectors = [
      ...SELECTORS.aboutShowMore.fallbacks,
      SELECTORS.aboutShowMore.primary,
    ];
    
    for (const selector of moreButtonSelectors) {
      try {
        const button = page.locator(selector).first();
        const visible = await button.isVisible().catch(() => false);
        
        if (visible) {
          await button.click();
          await randomDelay(500, 1000); // Wait for expansion
          break;
        }
      } catch {
        continue;
      }
    }
    
    // Now extract the full text
    const aboutText = await extractTextWithFallback(page, SELECTORS.about);
    
    if (aboutText) {
      // Limit length
      return aboutText.slice(0, config.maxAboutLength);
    }
    
    return null;
    
  } catch (error) {
    logger.debug('Failed to extract about section:', error);
    return null;
  }
}

// ============================================================================
// Name Parsing
// ============================================================================

/**
 * Clean and normalize extracted name
 */
function cleanName(name: string): string {
  if (!name) return 'Unknown';
  
  return name
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    // Remove common prefixes/suffixes that might be scraped
    .replace(/^(View\s+|Visit\s+)/i, '')
    .replace(/\s+(profile|on LinkedIn)$/i, '')
    // Trim
    .trim()
    // Title case (optional, could keep as-is)
    .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

/**
 * Clean general text content
 */
function cleanText(text: string): string {
  if (!text) return '';
  
  return text
    // Replace multiple spaces/newlines with single space
    .replace(/\s+/g, ' ')
    // Remove zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Trim
    .trim();
}

/**
 * Parse name components from full name
 */
export function parseNameComponents(fullName: string): {
  firstName: string;
  lastName: string;
  middleName?: string;
  titles?: string[];
} {
  const cleaned = cleanName(fullName);
  const parts = cleaned.split(' ');
  
  // Common titles to identify
  const titles = ['S.Kom.', 'S.T.', 'M.T.', 'M.Kom.', 'Ph.D.', 'Dr.', 'Ir.', 'Prof.', 'MBA', 'B.Sc.', 'M.Sc.'];
  const foundTitles: string[] = [];
  const nameParts: string[] = [];
  
  for (const part of parts) {
    if (titles.some(t => part.toLowerCase().includes(t.toLowerCase()))) {
      foundTitles.push(part);
    } else {
      nameParts.push(part);
    }
  }
  
  return {
    firstName: nameParts[0] || '',
    lastName: nameParts[nameParts.length - 1] || '',
    middleName: nameParts.slice(1, -1).join(' ') || undefined,
    titles: foundTitles.length > 0 ? foundTitles : undefined,
  };
}

// ============================================================================
// Limited View Detection
// ============================================================================

/**
 * Detect if profile has limited/private view
 */
async function detectLimitedView(page: Page): Promise<boolean> {
  const limitedIndicators = [
    '.private-profile',
    '.profile-private',
    '[data-testid="private-profile"]',
    '.pv-profile-section--limited',
    'text="This profile is private"',
    'text="Limited profile"',
    '.artdeco-inline-feedback--locked',
  ];
  
  for (const selector of limitedIndicators) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) return true;
    } catch {
      continue;
    }
  }
  
  // Check for missing key sections
  const hasName = await page.locator(SELECTORS.fullName.primary).count() > 0 ||
                  await page.locator(SELECTORS.fullName.fallbacks[0]).count() > 0;
  
  const hasExperience = await page.locator('.experience-section, .pv-experience-section').count() > 0;
  
  // If we have name but no experience section, might be limited
  if (hasName && !hasExperience) {
    return true;
  }
  
  return false;
}

// ============================================================================
// Additional Extraction Helpers
// ============================================================================

/**
 * Extract public profile URL from page
 * 
 * @param page - Playwright page instance
 * @returns Public profile URL or current URL
 */
export async function extractPublicProfileUrl(page: Page): Promise<string> {
  try {
    // Try to find canonical URL or public URL element
    const selectors = [
      'link[rel="canonical"]',
      '[data-testid="public-profile-url"]',
      '.public-profile-url',
    ];
    
    for (const selector of selectors) {
      const element = page.locator(selector).first();
      const visible = await element.isVisible().catch(() => false);
      
      if (visible) {
        const href = await element.getAttribute('href');
        if (href) return href;
        const text = await element.textContent();
        if (text) return text.trim();
      }
    }
  } catch {
    // Fall through to current URL
  }
  
  // Return current URL, cleaned
  return page.url().split('?')[0];
}

/**
 * Check if profile is currently being edited
 */
export async function isProfileBeingEdited(page: Page): Promise<boolean> {
  const editingIndicators = [
    '.profile-editing',
    '[data-testid="profile-editing"]',
    'text="Edit your profile"',
    '.pv-top-card__edit-button',
    '.artdeco-button:has-text("Edit")',
  ];
  
  for (const selector of editingIndicators) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) return true;
    } catch {
      continue;
    }
  }
  
  return false;
}

/**
 * Extract profile completeness score
 * 
 * @param page - Playwright page instance
 * @returns Completeness score (0-100) or null
 */
export async function extractProfileCompleteness(page: Page): Promise<number | null> {
  try {
    const completenessSelectors = [
      '[data-testid="profile-completeness"]',
      '.profile-completeness',
      '.artdeco-completeness-meter',
    ];
    
    for (const selector of completenessSelectors) {
      const element = page.locator(selector).first();
      const visible = await element.isVisible().catch(() => false);
      
      if (visible) {
        const text = await element.textContent();
        const match = text?.match(/(\d+)%/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
    }
  } catch {
    // Ignore errors
  }
  
  return null;
}

// ============================================================================
// Export
// ============================================================================

// Types and helper functions are exported via 'export' declarations above
