/**
 * Playwright Browser Setup with Stealth Configuration
 * 
 * Configures Playwright with anti-detection measures to avoid LinkedIn bot detection.
 * Includes browser crash detection, auto-restart, and resource blocking capabilities.
 * 
 * @module scraper/browser
 */

/// <reference lib="dom" />

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '@/config';
import { logger } from '@/utils/logger';

// Browser crash tracking
let browserCrashCount = 0;
const MAX_BROWSER_CRASHES = 3;
const BROWSER_CRASH_RESET_MS = 60000; // Reset crash count after 1 minute

// Common desktop user agents for rotation - updated Chrome versions
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
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
 * Default navigation timeout in milliseconds
 */
export const DEFAULT_NAVIGATION_TIMEOUT = 30000;

/**
 * Create new browser instance with stealth configuration
 * Includes crash detection and auto-restart capability
 * 
 * @returns Promise<Browser> - Configured browser instance
 * @throws Error if browser creation fails after max retries
 */
export async function createBrowser(): Promise<Browser> {
  logger.info('Creating stealth browser instance...');

  try {
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
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-component-extensions-with-background-pages',
      ],
      timeout: 60000, // 60 seconds timeout for launch
    });

    // Setup crash detection
    browser.on('disconnected', () => {
      logger.warn('Browser disconnected unexpectedly');
      trackBrowserCrash();
    });

    logger.info('Browser created successfully');
    return browser;
  } catch (error) {
    logger.error('Failed to create browser:', error);
    throw new Error(`Browser creation failed: ${(error as Error).message}`);
  }
}

/**
 * Create browser context with stealth settings and resource blocking
 * 
 * @param browser - Browser instance
 * @param sessionData - Optional session data (cookies, userAgent)
 * @param options - Optional context configuration
 * @returns Promise<BrowserContext> - Configured browser context
 */
export async function createContext(
  browser: Browser,
  sessionData?: { cookies?: Array<Record<string, unknown>>; userAgent?: string },
  options?: {
    blockResources?: boolean;
    navigationTimeout?: number;
  }
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
    bypassCSP: true,
    acceptDownloads: false,
  });

  // Set default timeout
  context.setDefaultNavigationTimeout(options?.navigationTimeout || DEFAULT_NAVIGATION_TIMEOUT);
  context.setDefaultTimeout(options?.navigationTimeout || DEFAULT_NAVIGATION_TIMEOUT);

  // Add stealth scripts to evade detection
  await addStealthScripts(context);

  // Block unnecessary resources if enabled
  if (options?.blockResources !== false) {
    await setupResourceBlocking(context);
  }

  // Restore session cookies if provided
  if (sessionData?.cookies && sessionData.cookies.length > 0) {
    await context.addCookies(sessionData.cookies as any);
  }

  // Setup page crash handler
  context.on('page', (page: Page) => {
    setupPageCrashHandler(page);
  });

  return context;
}

/**
 * Add stealth scripts to context to evade bot detection
 * Includes Canvas/WebGL fingerprint randomization
 * 
 * @param context - Browser context to add scripts to
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
        {
          description: 'Native Client module',
          filename: 'internal-nacl-plugin',
          name: 'Native Client',
        },
      ],
    });

    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'id-ID', 'id'],
    });

    // Mock platform
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
    });

    // Remove automation-related properties
    delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Object;
    delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_JSON;

    // Mock chrome runtime
    (window as any).chrome = {
      runtime: {},
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      },
    };

    // Mock permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = () => {
      return Promise.resolve({
        state: 'granted',
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as unknown as PermissionStatus);
    };

    // Canvas fingerprint randomization
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    // Add slight noise to canvas operations
    const canvasNoise = () => {
      const noise = () => Math.floor(Math.random() * 2) - 1; // -1, 0, or 1
      return noise();
    };

    HTMLCanvasElement.prototype.toDataURL = function(type?: string, quality?: unknown) {
      const context = this.getContext('2d');
      if (context) {
        const imageData = context.getImageData(0, 0, this.width, this.height);
        // Add imperceptible noise
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + canvasNoise()));
        }
        context.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.apply(this, [type, quality as number]);
    };

    // WebGL fingerprint randomization
    const getParameterProxyHandler = {
      apply: function(target: unknown, thisArg: unknown, args: [number]) {
        const param = args[0];
        // UNMASKED_VENDOR_WEBGL
        if (param === 37445) {
          return 'Intel Inc.';
        }
        // UNMASKED_RENDERER_WEBGL
        if (param === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return (target as (...args: [number]) => unknown).apply(thisArg, args);
      },
    };

    // Override WebGL getParameter
    const originalGetContextWebGL = HTMLCanvasElement.prototype.getContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype.getContext as any) = function(
      this: HTMLCanvasElement,
      contextId: string, 
      options?: unknown
    ): unknown {
      const context = (originalGetContextWebGL as any).call(this, contextId, options);
      if (context && (contextId === 'webgl' || contextId === 'experimental-webgl')) {
        const gl = context as WebGLRenderingContext;
        const getParameter = gl.getParameter.bind(gl);
        gl.getParameter = new Proxy(getParameter, getParameterProxyHandler) as typeof gl.getParameter;
      }
      return context;
    };
  });
}

/**
 * Setup resource blocking to save bandwidth
 * Blocks images, stylesheets, fonts, and media by default
 * 
 * @param context - Browser context to configure
 */
async function setupResourceBlocking(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => {
    const resourceType = route.request().resourceType();
    const url = route.request().url();

    // Block unnecessary resources
    const blockedTypes = ['image', 'stylesheet', 'font', 'media', 'other'];
    const blockedUrls = [
      'google-analytics',
      'googletagmanager',
      'facebook',
      'analytics',
      'tracker',
    ];

    const shouldBlock = 
      blockedTypes.includes(resourceType) ||
      blockedUrls.some(blocked => url.toLowerCase().includes(blocked));

    if (shouldBlock) {
      route.abort('blockedbyclient');
    } else {
      route.continue();
    }
  });
}

/**
 * Setup page crash handler
 * 
 * @param page - Page instance to monitor
 */
function setupPageCrashHandler(page: Page): void {
  page.on('crash', () => {
    logger.error('Page crashed unexpectedly');
  });

  page.on('pageerror', (error: Error) => {
    logger.warn('Page JavaScript error:', error.message);
  });

  page.on('requestfailed', (request) => {
    logger.debug('Request failed:', request.url(), request.failure()?.errorText);
  });
}

/**
 * Track browser crashes for auto-restart logic
 */
function trackBrowserCrash(): void {
  browserCrashCount++;
  logger.warn(`Browser crash count: ${browserCrashCount}/${MAX_BROWSER_CRASHES}`);

  // Reset crash count after timeout
  setTimeout(() => {
    browserCrashCount = Math.max(0, browserCrashCount - 1);
  }, BROWSER_CRASH_RESET_MS);
}

/**
 * Check if browser can be restarted
 * @returns boolean - True if under crash limit
 */
export function canRestartBrowser(): boolean {
  return browserCrashCount < MAX_BROWSER_CRASHES;
}

/**
 * Reset browser crash counter
 */
export function resetBrowserCrashCount(): void {
  browserCrashCount = 0;
  logger.info('Browser crash count reset');
}

/**
 * Close browser gracefully
 * Handles cleanup and error handling
 * 
 * @param browser - Browser instance to close
 */
export async function closeBrowser(browser: Browser): Promise<void> {
  logger.info('Closing browser...');
  try {
    // Close all contexts first
    const contexts = browser.contexts();
    for (const context of contexts) {
      await context.close();
    }
    
    // Close browser
    await browser.close();
    logger.info('Browser closed successfully');
  } catch (error) {
    logger.error('Error closing browser:', error);
    // Force kill if graceful close fails
    try {
      const browserWithProcess = browser as Browser & { process: () => { kill: () => void } };
      browserWithProcess.process()?.kill();
    } catch {
      // Ignore kill errors
    }
  }
}

// ============================================================================
// Mock Functions for Unit Testing
// ============================================================================

/**
 * Mock browser for unit testing
 * @returns Mocked Browser instance
 */
export function createMockBrowser(): Browser {
  const mockContexts: BrowserContext[] = [];
  
  return {
    newContext: async () => {
      const mockContext = createMockContext();
      mockContexts.push(mockContext);
      return mockContext;
    },
    contexts: () => mockContexts,
    close: async () => {
      logger.debug('Mock browser closed');
    },
    process: () => ({ kill: () => {} }),
    on: () => {},
    once: () => {},
    addListener: () => {},
    removeListener: () => {},
    off: () => {},
    isConnected: () => true,
    version: () => 'Mock/1.0.0',
  } as unknown as Browser;
}

/**
 * Mock browser context for unit testing
 * @returns Mocked BrowserContext instance
 */
export function createMockContext(): BrowserContext {
  const mockPages: Page[] = [];
  
  return {
    newPage: async () => {
      const mockPage = createMockPage();
      mockPages.push(mockPage);
      return mockPage;
    },
    pages: () => mockPages,
    close: async () => {
      logger.debug('Mock context closed');
    },
    addInitScript: async () => {},
    route: async () => {},
    addCookies: async () => {},
    cookies: async () => [],
    clearCookies: async () => {},
    grantPermissions: async () => {},
    clearPermissions: async () => {},
    setGeolocation: async () => {},
    setExtraHTTPHeaders: async () => {},
    setOffline: async () => {},
    setDefaultNavigationTimeout: () => {},
    setDefaultTimeout: () => {},
    on: () => {},
    once: () => {},
    addListener: () => {},
    removeListener: () => {},
    off: () => {},
    browser: () => createMockBrowser(),
  } as unknown as BrowserContext;
}

/**
 * Mock page for unit testing
 * @returns Mocked Page instance
 */
export function createMockPage(): Page {
  return {
    goto: async () => ({ status: () => 200 }),
    url: () => 'https://example.com',
    title: async () => 'Mock Page',
    content: async () => '<html><body>Mock</body></html>',
    evaluate: async () => {},
    click: async () => {},
    fill: async () => {},
    type: async () => {},
    press: async () => {},
    screenshot: async () => Buffer.from([]),
    pdf: async () => Buffer.from([]),
    close: async () => {},
    isClosed: () => false,
    on: () => {},
    once: () => {},
    addListener: () => {},
    removeListener: () => {},
    off: () => {},
    context: () => createMockContext(),
    browser: () => createMockBrowser(),
  } as unknown as Page;
}
