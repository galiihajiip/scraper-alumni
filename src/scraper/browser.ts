/**
 * Playwright Browser Setup with Stealth Configuration
 * 
 * Configures Playwright with anti-detection measures to avoid LinkedIn bot detection.
 */

import { chromium, Browser, BrowserContext } from 'playwright';
import { config } from '@/config';
import { logger } from '@/utils/logger';

// Common desktop user agents for rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
];

// Common viewport sizes
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
];

/**
 * Get random user agent
 */
export function getRandomUserAgent(): string {
  if (config.stealth.userAgents && config.stealth.userAgents.length > 0) {
    const index = Math.floor(Math.random() * config.stealth.userAgents.length);
    return config.stealth.userAgents[index];
  }
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index];
}

/**
 * Get random viewport
 */
export function getRandomViewport(): { width: number; height: number } {
  const index = Math.floor(Math.random() * VIEWPORTS.length);
  return VIEWPORTS[index];
}

/**
 * Create new browser instance with stealth configuration
 */
export async function createBrowser(): Promise<Browser> {
  logger.info('Creating stealth browser instance...');

  const browser = await chromium.launch({
    headless: config.playwright.headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  });

  logger.info('Browser created successfully');
  return browser;
}

/**
 * Create browser context with stealth settings
 */
export async function createContext(
  browser: Browser,
  sessionData?: { cookies?: Array<Record<string, unknown>>; userAgent?: string }
): Promise<BrowserContext> {
  const userAgent = sessionData?.userAgent || getRandomUserAgent();
  const viewport = getRandomViewport();

  logger.debug('Creating browser context with user agent:', userAgent.substring(0, 50) + '...');

  const context = await browser.newContext({
    userAgent,
    viewport,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    locale: 'en-US',
    timezoneId: 'Asia/Jakarta',
    permissions: ['notifications'],
    // Block unnecessary resources
    bypassCSP: true,
  });

  // Add stealth scripts to evade detection
  await addStealthScripts(context);

  // Restore session cookies if provided
  if (sessionData?.cookies && sessionData.cookies.length > 0) {
    await context.addCookies(sessionData.cookies as any);
  }

  return context;
}

/**
 * Add stealth scripts to context to evade bot detection
 */
async function addStealthScripts(context: BrowserContext): Promise<void> {
  if (!config.stealth.enableExtraStealth) {
    return;
  }

  await context.addInitScript(() => {
    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          description: 'Portable Document Format',
          filename: 'internal-pdf-viewer',
          length: 1,
          name: 'Chrome PDF Plugin',
        },
      ],
    });

    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Remove automation-related properties
    delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

    // Mock chrome runtime
    (window as any).chrome = {
      runtime: {},
    };
  });
}

/**
 * Close browser gracefully
 */
export async function closeBrowser(browser: Browser): Promise<void> {
  logger.info('Closing browser...');
  await browser.close();
  logger.info('Browser closed');
}
