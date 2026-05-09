/**
 * Navigation Safety & Verification
 * 
 * Verifies that navigated pages are the intended targets, not error pages
 * or redirects. Handles security challenges, profile validation, and
 * content stability checks.
 * 
 * Features:
 * - Page load verification by type
 * - Profile page validation
 * - Security challenge detection
 * - Redirect handling
 * - Content stability verification
 * - Composable navigation guards
 * 
 * @module scraper/navigation/verifier
 */

import type { Page, Response } from 'playwright';
import { logger } from '@/utils/logger';
import { randomDelay } from '@/scraper/rate-limiter';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Page types for verification
 */
export type PageType = 'profile' | 'search' | 'login' | 'error' | 'challenge' | 'feed' | 'unavailable';

/**
 * Security challenge types
 */
export type ChallengeType = 'captcha' | 'phone_verify' | 'email_verify' | '2fa' | 'checkpoint' | null;

/**
 * Verification result
 */
export interface VerificationResult {
  /** Whether verification passed */
  success: boolean;
  /** Detected page type */
  detectedType: PageType;
  /** Error message if failed */
  error?: string;
  /** Challenge type if detected */
  challenge?: ChallengeType;
  /** Redirect chain if any */
  redirects?: string[];
}

/**
 * Navigation guard function type
 */
export type NavigationGuard = (page: Page) => Promise<VerificationResult>;

/**
 * Verifier configuration
 */
export interface VerifierConfig {
  /** Timeout for page load verification in ms */
  pageLoadTimeout: number;
  /** Timeout for content stability in ms */
  stabilityTimeout: number;
  /** Maximum redirect chain length */
  maxRedirects: number;
  /** Whether to auto-handle challenges */
  autoHandleChallenges: boolean;
  /** Callback for challenge detection */
  onChallengeDetected?: (challenge: ChallengeType, page: Page) => Promise<void>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: VerifierConfig = {
  pageLoadTimeout: 30000,
  stabilityTimeout: 10000,
  maxRedirects: 5,
  autoHandleChallenges: false,
};

// ============================================================================
// Page Type Detection
// ============================================================================

/**
 * Detect page type based on URL and DOM elements
 * 
 * @param page - Playwright page instance
 * @returns Detected page type
 */
export async function detectPageType(page: Page): Promise<PageType> {
  const url = page.url();
  
  // Check URL patterns first
  if (url.includes('/in/')) {
    return 'profile';
  }
  if (url.includes('/search/')) {
    return 'search';
  }
  if (url.includes('/login') || url.includes('/checkpoint')) {
    return 'login';
  }
  if (url.includes('/feed')) {
    return 'feed';
  }
  
  // Check for error indicators in DOM
  try {
    // Check for 404
    const notFound = await page.locator('.not-found, .error-404, [data-testid="not-found"]').count();
    if (notFound > 0) {
      return 'error';
    }
    
    // Check for "page not available"
    const unavailable = await page.locator(
      '.unavailable-profile, .profile-unavailable, [data-testid="profile-unavailable"]'
    ).count();
    if (unavailable > 0) {
      return 'unavailable';
    }
    
    // Check for security challenge
    const hasChallenge = await detectSecurityChallenge(page);
    if (hasChallenge) {
      return 'challenge';
    }
    
    // Check for profile elements
    const hasProfileElements = await page.locator(
      '.profile-content, .pv-profile-section, .scaffold-layout__main'
    ).count();
    if (hasProfileElements > 0) {
      return 'profile';
    }
    
    // Check for search elements
    const hasSearchElements = await page.locator(
      '.search-results-container, .search-results__cluster'
    ).count();
    if (hasSearchElements > 0) {
      return 'search';
    }
    
  } catch (error) {
    logger.debug('Error detecting page type:', error);
  }
  
  // Default to error if can't determine
  return 'error';
}

/**
 * Verify page loaded with expected type
 * 
 * @param page - Playwright page instance
 * @param expectedType - Expected page type
 * @param config - Verifier configuration
 * @returns Verification result
 */
export async function verifyPageLoaded(
  page: Page,
  expectedType: PageType,
  config?: Partial<VerifierConfig>
): Promise<VerificationResult> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  
  logger.debug(`Verifying page loaded as: ${expectedType}`);
  
  try {
    // Wait for network idle
    await page.waitForLoadState('networkidle', { timeout: opts.pageLoadTimeout });
    
    // Detect actual page type
    const detectedType = await detectPageType(page);
    
    // Check if challenge detected
    if (detectedType === 'challenge') {
      const challenge = await detectSecurityChallenge(page);
      
      if (opts.autoHandleChallenges && opts.onChallengeDetected) {
        await opts.onChallengeDetected(challenge, page);
      }
      
      return {
        success: false,
        detectedType: 'challenge',
        challenge,
        error: `Security challenge detected: ${challenge}`,
      };
    }
    
    // Check if types match
    if (detectedType !== expectedType) {
      return {
        success: false,
        detectedType,
        error: `Expected ${expectedType} but detected ${detectedType}`,
      };
    }
    
    // Additional type-specific validation
    if (expectedType === 'profile') {
      const profileValid = await isValidProfilePage(page);
      if (!profileValid) {
        return {
          success: false,
          detectedType: 'error',
          error: 'Profile page validation failed',
        };
      }
    }
    
    return {
      success: true,
      detectedType,
    };
    
  } catch (error) {
    return {
      success: false,
      detectedType: 'error',
      error: `Verification failed: ${(error as Error).message}`,
    };
  }
}

// ============================================================================
// Profile Page Validation
// ============================================================================

/**
 * Profile validation result
 */
export interface ProfileValidationResult {
  /** Whether profile is valid and accessible */
  valid: boolean;
  /** Reason for invalidity */
  reason?: 'not_found' | 'private' | 'deleted' | 'restricted' | 'loading_error';
  /** Profile name if available */
  name?: string;
  /** Whether profile has limited view */
  limitedView?: boolean;
}

/**
 * Check if current page is a valid profile page
 * 
 * @param page - Playwright page instance
 * @returns Validation result
 */
export async function isValidProfilePage(page: Page): Promise<ProfileValidationResult> {
  try {
    // Check for "Profile not found" or 404
    const notFoundIndicators = [
      '.not-found',
      '.error-404',
      '[data-testid="not-found"]',
      '.profile-not-found',
      'text="This page doesn\'t exist"',
      'text="Page not found"',
    ];
    
    for (const selector of notFoundIndicators) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        logger.warn('Profile not found (404)');
        return { valid: false, reason: 'not_found' };
      }
    }
    
    // Check for "Profile unavailable" (deleted or restricted)
    const unavailableIndicators = [
      '.unavailable-profile',
      '.profile-unavailable',
      '[data-testid="profile-unavailable"]',
      'text="This profile is unavailable"',
      'text="Profile not available"',
    ];
    
    for (const selector of unavailableIndicators) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        logger.warn('Profile unavailable (deleted or restricted)');
        return { valid: false, reason: 'deleted' };
      }
    }
    
    // Check for private/limited view
    const privateIndicators = [
      '.private-profile',
      '.profile-private',
      '[data-testid="private-profile"]',
      'text="This profile is private"',
      'text="Limited profile"',
      '.pv-profile-section--limited',
    ];
    
    let isPrivate = false;
    for (const selector of privateIndicators) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        isPrivate = true;
        break;
      }
    }
    
    // Check for name element (indicates profile loaded)
    const nameSelectors = [
      '.pv-top-card__name',
      '.profile-card__name',
      'h1.text-heading-xlarge',
      '[data-testid="profile-name"]',
      '.top-card-layout__entity-info h1',
    ];
    
    let name: string | undefined;
    let nameFound = false;
    
    for (const selector of nameSelectors) {
      const element = page.locator(selector).first();
      const visible = await element.isVisible().catch(() => false);
      
      if (visible) {
        nameFound = true;
        name = await element.textContent().catch(() => undefined) || undefined;
        if (name) {
          name = name.trim();
        }
        break;
      }
    }
    
    // Check for experience section
    const hasExperience = await page.locator(
      '.experience-section, .pv-experience-section, [data-section="experience"]'
    ).count() > 0;
    
    // Profile is valid if we found name or experience section
    if (nameFound || hasExperience) {
      return {
        valid: true,
        name,
        limitedView: isPrivate,
      };
    }
    
    // If nothing found, might be loading error
    logger.warn('Profile page loaded but no content found');
    return { valid: false, reason: 'loading_error' };
    
  } catch (error) {
    logger.error('Error validating profile page:', error);
    return { valid: false, reason: 'loading_error' };
  }
}

/**
 * Extract profile name from page
 */
export async function extractProfileName(page: Page): Promise<string | null> {
  const nameSelectors = [
    '.pv-top-card__name',
    '.profile-card__name',
    'h1.text-heading-xlarge',
    '[data-testid="profile-name"]',
    '.top-card-layout__entity-info h1',
  ];
  
  for (const selector of nameSelectors) {
    try {
      const element = page.locator(selector).first();
      const visible = await element.isVisible().catch(() => false);
      
      if (visible) {
        const text = await element.textContent();
        if (text) {
          return text.trim();
        }
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

// ============================================================================
// Security Challenge Detection
// ============================================================================

/**
 * Detect security challenge on current page
 * 
 * @param page - Playwright page instance
 * @returns Challenge type or null
 */
export async function detectSecurityChallenge(page: Page): Promise<ChallengeType> {
  try {
    // Check URL first
    const url = page.url();
    
    if (url.includes('/checkpoint/')) {
      return 'checkpoint';
    }
    
    if (url.includes('/uas/login') && url.includes('challengeId=')) {
      return '2fa';
    }
    
    // Check for CAPTCHA
    const captchaSelectors = [
      '.captcha-container',
      '[data-testid="captcha"]',
      'iframe[src*="captcha"]',
      '.g-recaptcha',
      'text="Security verification"',
      'text="Please verify that you\'re not a robot"',
      '.recaptcha-checkbox-border',
    ];
    
    for (const selector of captchaSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        logger.warn('CAPTCHA challenge detected');
        return 'captcha';
      }
    }
    
    // Check for phone verification
    const phoneSelectors = [
      'input[name="phoneNumber"]',
      'input[name="phone"]',
      'text="Phone verification"',
      'text="Verify with phone"',
      '.phone-challenge',
    ];
    
    for (const selector of phoneSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        logger.warn('Phone verification challenge detected');
        return 'phone_verify';
      }
    }
    
    // Check for email verification
    const emailSelectors = [
      'input[name="email"]',
      'text="Email verification"',
      'text="Verify your email"',
      '.email-challenge',
      'text="Check your email"',
    ];
    
    for (const selector of emailSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        logger.warn('Email verification challenge detected');
        return 'email_verify';
      }
    }
    
    // Check for 2FA
    const twoFactorSelectors = [
      'input[name="pin"]',
      'input[name="otp"]',
      'input[name="verification-code"]',
      'text="Two-step verification"',
      'text="Enter your code"',
      '.two-factor-challenge',
    ];
    
    for (const selector of twoFactorSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        logger.warn('2FA challenge detected');
        return '2fa';
      }
    }
    
    return null;
    
  } catch (error) {
    logger.error('Error detecting security challenge:', error);
    return null;
  }
}

/**
 * Handle security challenge by pausing and alerting
 * 
 * @param page - Playwright page instance
 * @param challenge - Type of challenge
 * @param saveState - Whether to save current state
 */
export async function handleSecurityChallenge(
  page: Page,
  challenge: ChallengeType,
  saveState: boolean = true
): Promise<void> {
  logger.error(`SECURITY CHALLENGE: ${challenge} detected on ${page.url()}`);
  
  // Save state for resume
  if (saveState) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');
      
      const state = {
        url: page.url(),
        challenge,
        timestamp: new Date().toISOString(),
        type: 'challenge_pause',
      };
      
      const stateFile = path.join(os.tmpdir(), 'linkedin-challenge-state.json');
      await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
      logger.info('Challenge state saved for resume');
    } catch (error) {
      logger.error('Failed to save state:', error);
    }
  }
  
  // Alert for manual intervention
  const message = `
========================================
SECURITY CHALLENGE DETECTED
========================================
Type: ${challenge}
URL: ${page.url()}
Time: ${new Date().toISOString()}

Please resolve the challenge manually in the browser.
Scraping has been paused and can be resumed after.
========================================
  `;
  
  console.error(message);
  logger.warn(message);
  
  // In a real implementation, this might:
  // - Send notification (email, Slack, etc.)
  // - Keep browser open for manual resolution
  // - Wait for user input
  // - Auto-attempt resolution for simple challenges
  
  // For now, just pause and wait
  logger.info('Waiting 60 seconds for manual challenge resolution...');
  await randomDelay(60000, 60000);
}

// ============================================================================
// Redirect Handling
// ============================================================================

/**
 * Track redirects during navigation
 * 
 * @param page - Playwright page instance
 * @returns Array of URLs in redirect chain
 */
export function trackRedirects(page: Page): string[] {
  const redirects: string[] = [];
  let lastUrl = '';
  
  // Listen for navigation events
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (url !== lastUrl) {
        redirects.push(url);
        lastUrl = url;
        logger.debug(`Redirect detected: ${url}`);
      }
    }
  });
  
  return redirects;
}

/**
 * Get redirect chain from response history
 * 
 * @param responses - Array of responses
 * @returns Array of redirect URLs
 */
export function getRedirectChain(responses: Response[]): string[] {
  const redirects: string[] = [];
  
  for (const response of responses) {
    if (response.status() >= 300 && response.status() < 400) {
      const location = response.headers()['location'];
      if (location) {
        redirects.push(location);
      }
    }
  }
  
  return redirects;
}

/**
 * Detect if redirected to login page
 * 
 * @param page - Playwright page instance
 * @returns True if on login page
 */
export async function isRedirectedToLogin(page: Page): Promise<boolean> {
  const url = page.url();
  
  // Check URL
  if (url.includes('/login') || url.includes('/checkpoint')) {
    return true;
  }
  
  // Check for login form
  const loginForm = await page.locator(
    '#login-form, .login-form, input[name="session_key"]'
  ).count();
  
  return loginForm > 0;
}

/**
 * Detect if on unavailable page
 * 
 * @param page - Playwright page instance
 * @returns True if page is unavailable
 */
export async function isUnavailablePage(page: Page): Promise<boolean> {
  const url = page.url();
  
  // Check URL
  if (url.includes('/unavailable')) {
    return true;
  }
  
  // Check DOM
  const unavailable = await page.locator(
    '.unavailable-profile, .profile-unavailable, [data-testid="profile-unavailable"]'
  ).count();
  
  return unavailable > 0;
}

// ============================================================================
// Content Stability Check
// ============================================================================

/**
 * Wait for page to be fully loaded and stable
 * 
 * @param page - Playwright page instance
 * @param timeout - Maximum wait time in ms
 * @returns True if page became stable
 */
export async function waitForContentStability(
  page: Page,
  timeout: number = 10000
): Promise<boolean> {
  const startTime = Date.now();
  let lastHeight = 0;
  let stableCount = 0;
  
  while (Date.now() - startTime < timeout) {
    // Check for loading indicators
    const loadingCount = await page.locator(
      '.artdeco-loader, .loading-spinner, [role="progressbar"], .skeleton-loader'
    ).count();
    
    if (loadingCount > 0) {
      stableCount = 0;
      await randomDelay(500, 1000);
      continue;
    }
    
    // Check if scroll height is stable
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    
    if (currentHeight === lastHeight) {
      stableCount++;
      if (stableCount >= 3) {
        logger.debug('Page content is stable');
        return true;
      }
    } else {
      stableCount = 0;
      lastHeight = currentHeight;
    }
    
    await randomDelay(500, 1000);
  }
  
  logger.warn('Timeout waiting for content stability');
  return false;
}

/**
 * Check if React/Vue hydration is complete
 * 
 * @param page - Playwright page instance
 * @returns True if hydration complete
 */
export async function isHydrationComplete(page: Page): Promise<boolean> {
  try {
    // Check for common hydration indicators
    const checks = await Promise.all([
      // Check if loading states are gone
      page.locator('.initial-load, .hydrating, [data-hydrating="true"]').count(),
      
      // Check if dynamic content is rendered
      page.locator('[data-rendered="true"], .hydrated').count(),
      
      // Check for specific LinkedIn indicators
      page.locator('.application-outlet, .scaffold-layout').count(),
    ]);
    
    // No loading states and has rendered content
    return checks[0] === 0 && (checks[1] > 0 || checks[2] > 0);
    
  } catch (error) {
    logger.debug('Error checking hydration:', error);
    return false;
  }
}

// ============================================================================
// Navigation Guards
// ============================================================================

/**
 * Composable navigation guard that verifies page before proceeding
 * 
 * @param guard - Guard function to execute
 * @returns Wrapped function that includes guard
 */
export function withGuard<T extends unknown[], R>(
  guard: NavigationGuard,
  fn: (page: Page, ...args: T) => Promise<R>
): (page: Page, ...args: T) => Promise<R> {
  return async (page: Page, ...args: T): Promise<R> => {
    // Run guard
    const result = await guard(page);
    
    if (!result.success) {
      throw new Error(`Navigation guard failed: ${result.error}`);
    }
    
    // Proceed with function
    return fn(page, ...args);
  };
}

/**
 * Create a profile page guard
 * 
 * @param config - Verifier configuration
 * @returns Navigation guard for profile pages
 */
export function createProfileGuard(config?: Partial<VerifierConfig>): NavigationGuard {
  return async (page: Page): Promise<VerificationResult> => {
    return verifyPageLoaded(page, 'profile', config);
  };
}

/**
 * Create a search page guard
 * 
 * @param config - Verifier configuration
 * @returns Navigation guard for search pages
 */
export function createSearchGuard(config?: Partial<VerifierConfig>): NavigationGuard {
  return async (page: Page): Promise<VerificationResult> => {
    return verifyPageLoaded(page, 'search', config);
  };
}

/**
 * Create a no-challenge guard
 * 
 * @param config - Verifier configuration
 * @returns Navigation guard that rejects challenges
 */
export function createNoChallengeGuard(config?: Partial<VerifierConfig>): NavigationGuard {
  return async (page: Page): Promise<VerificationResult> => {
    const challenge = await detectSecurityChallenge(page);
    
    if (challenge) {
      if (config?.autoHandleChallenges) {
        await handleSecurityChallenge(page, challenge);
      }
      
      return {
        success: false,
        detectedType: 'challenge',
        challenge,
        error: `Challenge detected: ${challenge}`,
      };
    }
    
    return {
      success: true,
      detectedType: await detectPageType(page),
    };
  };
}

/**
 * Compose multiple guards into one
 * 
 * @param guards - Array of guards to compose
 * @returns Composed guard
 */
export function composeGuards(...guards: NavigationGuard[]): NavigationGuard {
  return async (page: Page): Promise<VerificationResult> => {
    for (const guard of guards) {
      const result = await guard(page);
      
      if (!result.success) {
        return result;
      }
    }
    
    return {
      success: true,
      detectedType: await detectPageType(page),
    };
  };
}

// ============================================================================
// Export
// ============================================================================

// Types are exported via 'export type' declarations above
