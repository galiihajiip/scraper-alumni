/**
 * LinkedIn Authentication & Session Management
 * 
 * Handles login flow, session persistence, and session restoration.
 * This module ensures we don't need to login every time we run the scraper.
 */

import type { BrowserContext, Page } from 'playwright';
import type { LinkedInCredentials, SessionData } from '@/types';
import { config } from '@/config';
import { logger } from '@/utils/logger';

// Selectors for LinkedIn login page
const LOGIN_SELECTORS = {
  emailInput: 'input[name="session_key"]',
  passwordInput: 'input[name="session_password"]',
  submitButton: 'button[type="submit"]',
  // Success indicators
  feedIndicator: '[data-testid="feed-tab-icon"]',
  profileNav: '[data-testid="global-nav-profile"]',
  // Challenge indicators
  twoFAChallenge: '[data-challenge-type="TWO_FA"]',
  captchaChallenge: '.captcha-challenge',
  emailVerify: '[data-testid="email-pin-challenge"]',
};

/**
 * Perform LinkedIn login with credentials
 */
export async function loginLinkedIn(
  context: BrowserContext,
  credentials: LinkedInCredentials = {
    email: config.linkedin.email,
    password: config.linkedin.password,
  }
): Promise<SessionData> {
  const page = await context.newPage();
  
  try {
    logger.info('Navigating to LinkedIn login page...');
    await page.goto('https://www.linkedin.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for login form
    await page.waitForSelector(LOGIN_SELECTORS.emailInput, { timeout: 10000 });

    // Fill credentials with human-like typing
    logger.info('Filling login credentials...');
    await page.fill(LOGIN_SELECTORS.emailInput, credentials.email);
    await randomDelay(500, 1500);
    await page.fill(LOGIN_SELECTORS.passwordInput, credentials.password);
    await randomDelay(300, 800);

    // Submit login
    await page.click(LOGIN_SELECTORS.submitButton);

    // Wait for navigation
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Check for challenges
    const challengeType = await detectSecurityChallenge(page);
    
    if (challengeType) {
      logger.warn(`Security challenge detected: ${challengeType}`);
      logger.warn('Please manually complete the challenge in the browser...');
      
      // Wait for user to complete challenge
      await waitForLoginSuccess(page, 120000); // 2 minutes timeout
    } else {
      // Wait for normal login success
      await waitForLoginSuccess(page, 30000);
    }

    logger.info('Login successful!');

    // Extract session data
    const sessionData = await extractSessionData(context, page);
    
    return sessionData;
  } catch (error) {
    logger.error('Login failed:', error);
    throw new Error(`LinkedIn login failed: ${(error as Error).message}`);
  } finally {
    await page.close();
  }
}

/**
 * Restore session from saved session data
 */
export async function restoreSession(
  context: BrowserContext,
  sessionData: SessionData
): Promise<boolean> {
  try {
    logger.info('Restoring LinkedIn session...');

    // Restore cookies
    if (sessionData.cookies && sessionData.cookies.length > 0) {
      await context.addCookies(sessionData.cookies);
    }

    // Restore localStorage and sessionStorage
    const page = await context.newPage();
    
    if (sessionData.userAgent) {
      await page.setExtraHTTPHeaders({
        'User-Agent': sessionData.userAgent,
      });
    }

    // Navigate to LinkedIn to verify session
    await page.goto('https://www.linkedin.com/feed', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Check if session is valid
    const isValid = await validateSession(page);
    await page.close();

    if (isValid) {
      logger.info('Session restored successfully');
    } else {
      logger.warn('Session restoration failed - needs re-login');
    }

    return isValid;
  } catch (error) {
    logger.error('Session restoration error:', error);
    return false;
  }
}

/**
 * Validate if current session is still valid
 */
export async function validateSession(page: Page): Promise<boolean> {
  try {
    // Check for login indicators
    const hasFeedIndicator = await page.locator(LOGIN_SELECTORS.feedIndicator).count() > 0;
    const hasProfileNav = await page.locator(LOGIN_SELECTORS.profileNav).count() > 0;
    
    // Check for login page indicators (session expired)
    const hasLoginForm = await page.locator(LOGIN_SELECTORS.emailInput).count() > 0;

    return (hasFeedIndicator || hasProfileNav) && !hasLoginForm;
  } catch {
    return false;
  }
}

/**
 * Extract session data from browser context
 */
async function extractSessionData(context: BrowserContext, page: Page): Promise<SessionData> {
  const cookies = await context.cookies();
  
  // Get user agent
  const userAgent = await page.evaluate(() => navigator.userAgent);
  
  // Get viewport
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  return {
    cookies: cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
    })),
    userAgent,
    viewport,
  };
}

/**
 * Detect if there's a security challenge
 */
async function detectSecurityChallenge(page: Page): Promise<string | null> {
  try {
    if (await page.locator(LOGIN_SELECTORS.twoFAChallenge).count() > 0) {
      return 'two_fa';
    }
    if (await page.locator(LOGIN_SELECTORS.captchaChallenge).count() > 0) {
      return 'captcha';
    }
    if (await page.locator(LOGIN_SELECTORS.emailVerify).count() > 0) {
      return 'email_verify';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Wait for login to complete successfully
 */
async function waitForLoginSuccess(page: Page, timeout: number): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const isLoggedIn = await validateSession(page);
    
    if (isLoggedIn) {
      return;
    }
    
    await randomDelay(1000, 2000);
  }
  
  throw new Error('Login timeout - unable to verify successful login');
}

/**
 * Generate random delay between min and max milliseconds
 */
function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}
