/**
 * LinkedIn Authentication & Session Management
 * 
 * Handles login flow, session persistence, and session restoration.
 * This module ensures we don't need to login every time we run the scraper.
 * 
 * Features:
 * - Automated login with credential validation
 * - Session persistence to database
 * - Session reuse and rotation for multiple accounts
 * - Auto-refresh for sessions nearing expiry
 * - Challenge detection (2FA, CAPTCHA, email verification)
 * - Secure handling of sensitive data (no password logging)
 * 
 * @module auth/linkedin
 */

/// <reference lib="dom" />

import type { BrowserContext, Page } from 'playwright';
import type { LinkedInCredentials, SessionData } from '@/types';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import * as sessionRepo from '@/database/repositories/session.repository';

// Session lock tracking for rotation
const lockedSessionIds = new Set<string>();

// Minimum time before expiry to trigger auto-refresh (1 hour)
const SESSION_REFRESH_THRESHOLD_MS = 60 * 60 * 1000;

// Selectors for LinkedIn login page
const LOGIN_SELECTORS = {
  emailInput: 'input[name="session_key"]',
  passwordInput: 'input[name="session_password"]',
  submitButton: 'button[type="submit"]',
  // Success indicators
  feedIndicator: '[data-testid="feed-tab-icon"]',
  profileNav: '[data-testid="global-nav-profile"]',
  profileMenu: '.global-nav__me-wrapper',
  searchBar: '[data-testid="global-nav-search"]',
  // Challenge indicators
  twoFAChallenge: '[data-challenge-type="TWO_FA"]',
  captchaChallenge: '.captcha-challenge',
  emailVerify: '[data-testid="email-pin-challenge"]',
  phoneVerify: '[data-challenge-type="PHONE"]',
  // Error indicators
  errorMessage: '[role="alert"]',
  invalidCredentials: '.error-text',
  accountLocked: '.account-locked-message',
  // Login page confirmation
  loginPageHeader: '.login__form header',
};

/**
 * Login error types for specific error handling
 */
export enum LoginErrorType {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  TWOFA_REQUIRED = 'TWOFA_REQUIRED',
  CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom login error with type information
 */
export class LoginError extends Error {
  public readonly type: LoginErrorType;
  public readonly retryable: boolean;

  constructor(message: string, type: LoginErrorType, retryable = false) {
    super(message);
    this.name = 'LoginError';
    this.type = type;
    this.retryable = retryable;
  }
}

/**
 * Perform LinkedIn login with credentials
 * Includes challenge detection and detailed error handling
 * 
 * @param context - Browser context
 * @param credentials - LinkedIn credentials (defaults to env vars)
 * @returns Promise<SessionData> - Session data for persistence
 * @throws {LoginError} - Specific error types for different failure modes
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
    
    // Navigate to login page
    await page.goto('https://www.linkedin.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Verify we're on the login page
    const isLoginPage = await page.locator(LOGIN_SELECTORS.emailInput).count() > 0 ||
                        await page.locator(LOGIN_SELECTORS.loginPageHeader).count() > 0;
    
    if (!isLoginPage) {
      // Might already be logged in (cookie restored)
      const isAlreadyLoggedIn = await validateSession(page);
      if (isAlreadyLoggedIn) {
        logger.info('Already logged in via restored session');
        return await extractSessionData(context, page);
      }
    }

    // Wait for login form
    await page.waitForSelector(LOGIN_SELECTORS.emailInput, { timeout: 10000 });

    // Check for any pre-login errors
    const preLoginError = await detectPreLoginError(page);
    if (preLoginError) {
      throw new LoginError(preLoginError.message, preLoginError.type, false);
    }

    // Fill credentials with human-like typing
    logger.info(`Logging in as: ${maskEmail(credentials.email)}`);
    
    await humanLikeType(page, LOGIN_SELECTORS.emailInput, credentials.email);
    await randomDelay(500, 1500);
    
    // Don't log password - security best practice
    await humanLikeType(page, LOGIN_SELECTORS.passwordInput, credentials.password);
    await randomDelay(300, 800);

    // Submit login
    logger.info('Submitting login...');
    await page.click(LOGIN_SELECTORS.submitButton);

    // Wait for navigation
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
      // Navigation timeout might indicate slow connection or challenge
      logger.debug('Navigation load state timeout, continuing...');
    });

    // Check for various error states
    const errorState = await detectLoginError(page);
    if (errorState) {
      throw new LoginError(errorState.message, errorState.type, errorState.retryable);
    }

    // Check for challenges
    const challengeType = await detectSecurityChallenge(page);
    
    if (challengeType) {
      logger.warn(`Security challenge detected: ${challengeType}`);
      
      if (challengeType === 'captcha') {
        throw new LoginError(
          'CAPTCHA challenge detected. Please login manually and export session.',
          LoginErrorType.CAPTCHA_REQUIRED,
          false
        );
      }
      
      logger.warn('Please manually complete the challenge in the browser...');
      logger.info('Waiting up to 2 minutes for manual challenge completion...');
      
      // Wait for user to complete challenge
      await waitForLoginSuccess(page, 120000); // 2 minutes timeout
    } else {
      // Wait for normal login success
      await waitForLoginSuccess(page, 30000);
    }

    // Verify login success
    const isLoggedIn = await validateSession(page);
    if (!isLoggedIn) {
      throw new LoginError(
        'Unable to verify login success. Page state unknown.',
        LoginErrorType.UNKNOWN,
        false
      );
    }

    logger.info('Login successful!');

    // Extract session data
    const sessionData = await extractSessionData(context, page);
    
    // Save to database
    await saveSessionToDatabase(sessionData);
    
    return sessionData;
  } catch (error) {
    if (error instanceof LoginError) {
      throw error;
    }
    
    logger.error('Login failed:', error);
    throw new LoginError(
      `LinkedIn login failed: ${(error as Error).message}`,
      LoginErrorType.UNKNOWN,
      false
    );
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
 * Get active session from database (for session rotation)
 * Returns a random available session and locks it for use
 * 
 * @returns Session ID and data, or null if no available sessions
 */
export async function getAvailableSession(): Promise<{ id: string; data: SessionData } | null> {
  try {
    // Get all active sessions from database
    const sessions = await sessionRepo.getSessionsByPlatform('linkedin', false);
    
    // Filter out locked sessions and expired ones
    const now = new Date();
    const availableSessions = sessions.filter(s => {
      if (lockedSessionIds.has(s.id)) return false;
      if (s.expiresAt < now) return false;
      return true;
    });
    
    if (availableSessions.length === 0) {
      return null;
    }
    
    // Random selection for rotation
    const selected = availableSessions[Math.floor(Math.random() * availableSessions.length)];
    
    // Lock the session
    lockedSessionIds.add(selected.id);
    
    // Parse session data
    const sessionData = selected.sessionData as SessionData;
    
    // Check if session needs refresh (expiring soon)
    const timeToExpiry = selected.expiresAt.getTime() - now.getTime();
    if (timeToExpiry < SESSION_REFRESH_THRESHOLD_MS) {
      logger.info(`Session ${maskSessionId(selected.id)} approaching expiry, will refresh soon`);
    }
    
    return { id: selected.id, data: sessionData };
  } catch (error) {
    logger.error('Error getting available session:', error);
    return null;
  }
}

/**
 * Release a locked session after use
 * 
 * @param sessionId - Session ID to unlock
 */
export function releaseSession(sessionId: string): void {
  lockedSessionIds.delete(sessionId);
  logger.debug(`Session ${maskSessionId(sessionId)} released`);
}

/**
 * Refresh an existing session before it expires
 * 
 * @param context - Browser context
 * @param sessionId - Database session ID
 * @returns boolean - True if refreshed successfully
 */
export async function refreshSession(
  context: BrowserContext,
  sessionId: string
): Promise<boolean> {
  const page = await context.newPage();
  
  try {
    logger.info(`Refreshing session ${maskSessionId(sessionId)}...`);
    
    // Navigate to LinkedIn to verify session is still valid
    await page.goto('https://www.linkedin.com/feed', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    
    // Check if still logged in
    const isValid = await validateSession(page);
    
    if (!isValid) {
      logger.warn('Session no longer valid, needs re-login');
      return false;
    }
    
    // Extract new session data
    const sessionData = await extractSessionData(context, page);
    
    // Extend expiration
    const newExpiry = new Date(Date.now() + config.stealth.sessionMaxAge * 60 * 60 * 1000);
    await sessionRepo.extendSession(sessionId, newExpiry);
    
    logger.info('Session refreshed successfully');
    return true;
  } catch (error) {
    logger.error('Session refresh failed:', error);
    return false;
  } finally {
    await page.close();
  }
}

/**
 * Save session to database
 * 
 * @param sessionData - Session data to save
 */
async function saveSessionToDatabase(sessionData: SessionData): Promise<void> {
  try {
    // Calculate expiration
    const expiresAt = new Date(Date.now() + config.stealth.sessionMaxAge * 60 * 60 * 1000);
    
    // Create or update session
    await sessionRepo.createSession('linkedin', sessionData, expiresAt);
    
    logger.info('Session saved to database');
  } catch (error) {
    logger.error('Failed to save session to database:', error);
    // Don't throw - session can still be used for current run
  }
}

/**
 * Detect pre-login errors (page load issues)
 */
async function detectPreLoginError(page: Page): Promise<{ message: string; type: LoginErrorType } | null> {
  try {
    // Check for network/connection error messages
    const errorSelectors = [
      '.network-error',
      '.connection-error',
      '[data-testid="connection-error"]',
    ];
    
    for (const selector of errorSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        return {
          message: 'Network connection error on login page',
          type: LoginErrorType.NETWORK_ERROR,
        };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect login error states after submission
 */
async function detectLoginError(page: Page): Promise<{ message: string; type: LoginErrorType; retryable: boolean } | null> {
  try {
    // Wait a moment for error messages to appear
    await page.waitForTimeout(1000);
    
    // Check for invalid credentials
    const invalidCreds = await page.locator(LOGIN_SELECTORS.invalidCredentials).count();
    if (invalidCreds > 0) {
      const errorText = await page.locator(LOGIN_SELECTORS.invalidCredentials).textContent();
      return {
        message: errorText || 'Invalid credentials provided',
        type: LoginErrorType.INVALID_CREDENTIALS,
        retryable: false,
      };
    }
    
    // Check for generic error messages
    const errorMessage = await page.locator(LOGIN_SELECTORS.errorMessage).count();
    if (errorMessage > 0) {
      const text = await page.locator(LOGIN_SELECTORS.errorMessage).textContent();
      const message = text || 'Login error occurred';
      
      // Detect specific error types from message content
      if (message.toLowerCase().includes('suspended')) {
        return {
          message,
          type: LoginErrorType.ACCOUNT_SUSPENDED,
          retryable: false,
        };
      }
      if (message.toLowerCase().includes('locked') || message.toLowerCase().includes('restricted')) {
        return {
          message,
          type: LoginErrorType.ACCOUNT_LOCKED,
          retryable: false,
        };
      }
    }
    
    // Check for account locked message
    const accountLocked = await page.locator(LOGIN_SELECTORS.accountLocked).count();
    if (accountLocked > 0) {
      return {
        message: 'Account has been temporarily locked',
        type: LoginErrorType.ACCOUNT_LOCKED,
        retryable: false,
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Type text into input with human-like delays
 * 
 * @param page - Page instance
 * @param selector - Input selector
 * @param text - Text to type
 */
async function humanLikeType(page: Page, selector: string, text: string): Promise<void> {
  const input = page.locator(selector);
  await input.focus();
  
  // Clear existing content
  await input.fill('');
  await randomDelay(100, 300);
  
  // Type with variable speed
  for (const char of text) {
    await input.type(char, { delay: Math.random() * 50 + 30 });
    
    // Occasional longer pause (like thinking)
    if (Math.random() < 0.1) {
      await randomDelay(200, 500);
    }
  }
}

/**
 * Mask email for secure logging
 * 
 * @param email - Email to mask
 * @returns Masked email (e.g., j***@example.com)
 */
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `***@${domain}`;
  }
  return `${localPart[0]}${'*'.repeat(localPart.length - 2)}${localPart[localPart.length - 1]}@${domain}`;
}

/**
 * Mask session ID for logging
 * 
 * @param sessionId - Session ID to mask
 * @returns Shortened session ID
 */
function maskSessionId(sessionId: string): string {
  return sessionId.substring(0, 8) + '...';
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
