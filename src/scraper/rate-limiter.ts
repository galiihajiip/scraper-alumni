/**
 * Rate Limiting & Human Behavior Simulation
 * 
 * Implements rate limiting, human-like delays, and adaptive throttling
 * to avoid LinkedIn bot detection and rate limiting.
 * 
 * Features:
 * - Natural delay distributions (Gaussian/Normal)
 * - Token bucket rate limiting
 * - Human-like interactions (scrolling, mouse movements)
 * - Adaptive delays based on server response
 * - Daily quota tracking
 * - Jitter to avoid pattern detection
 * 
 * @module scraper/rate-limiter
 */

import type { Page } from 'playwright';
import { config } from '@/config';
import { logger } from '@/utils/logger';

// ============================================================================
// Delay Utilities with Natural Distributions
// ============================================================================

/**
 * Generate random delay with Gaussian (normal) distribution
 * Produces more natural delays centered around the mean
 * 
 * @param min - Minimum delay in milliseconds
 * @param max - Maximum delay in milliseconds
 * @returns Promise that resolves after the delay
 */
export async function randomDelay(min: number, max: number): Promise<void> {
  // Box-Muller transform for Gaussian distribution
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6; // 99.7% within range
  
  let delay: number;
  do {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    delay = Math.round(mean + z0 * stdDev);
  } while (delay < min || delay > max);
  
  // Add jitter (±5%)
  const jitter = delay * (Math.random() * 0.1 - 0.05);
  delay = Math.round(delay + jitter);
  
  logger.debug(`Delay: ${delay}ms (range: ${min}-${max}ms)`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Calculate typing delay for human-like typing simulation
 * 
 * @param text - Text to be typed
 * @returns Total typing time in milliseconds
 */
export function calculateTypingDelay(text: string): number {
  const baseSpeed = 80; // ms per character (average)
  const variance = 40;  // ± variance
  
  let totalDelay = 0;
  
  for (let i = 0; i < text.length; i++) {
    // Base delay with variance
    let charDelay = baseSpeed + (Math.random() * variance * 2 - variance);
    
    // Slower for special characters
    const char = text[i];
    if (!/[a-zA-Z0-9]/.test(char)) {
      charDelay *= 1.5;
    }
    
    // Slower at start (finding keys)
    if (i < 3) {
      charDelay *= 1.3;
    }
    
    // Occasional pause (like thinking)
    if (Math.random() < 0.05) {
      charDelay += 300 + Math.random() * 400;
    }
    
    totalDelay += Math.round(charDelay);
  }
  
  return totalDelay;
}

/**
 * Simulate typing delay asynchronously
 * 
 * @param text - Text being typed
 */
export async function typingDelay(text: string): Promise<void> {
  const delay = calculateTypingDelay(text);
  logger.debug(`Typing delay for ${text.length} chars: ${delay}ms`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Generate random scroll delay
 * Simulates human reading/scrolling behavior
 * 
 * @returns Promise that resolves after delay
 */
export async function scrollDelay(): Promise<void> {
  // Log-normal distribution (humans pause longer occasionally)
  const min = 100;
  const max = 500;
  const mean = 250;
  
  // Log-normal: exp(normal(mean, stdDev))
  const stdDev = 0.5;
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const logNormal = Math.exp(Math.log(mean) + z0 * stdDev);
  
  const delay = Math.max(min, Math.min(max, Math.round(logNormal)));
  
  // Add jitter
  const jitter = Math.round(delay * (Math.random() * 0.1 - 0.05));
  const finalDelay = delay + jitter;
  
  logger.debug(`Scroll delay: ${finalDelay}ms`);
  await new Promise(resolve => setTimeout(resolve, finalDelay));
}

/**
 * Pause for "reading" after page load
 * 
 * @param page - Playwright page instance
 * @param minSeconds - Minimum reading time
 * @param maxSeconds - Maximum reading time
 */
export async function pauseForReading(
  page: Page,
  minSeconds: number = 2,
  maxSeconds: number = 5
): Promise<void> {
  const delay = minSeconds * 1000 + Math.random() * (maxSeconds - minSeconds) * 1000;
  
  // Add human-like behavior during reading
  const scrolls = Math.floor(Math.random() * 3); // 0-2 small scrolls
  
  for (let i = 0; i < scrolls; i++) {
    const scrollAmount = Math.floor(Math.random() * 200) + 50;
    await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount);
    await scrollDelay();
  }
  
  logger.debug(`Reading pause: ${Math.round(delay)}ms with ${scrolls} scrolls`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

// ============================================================================
// Human-like Interactions
// ============================================================================

/**
 * Perform random scroll on page
 * Simulates natural scrolling behavior
 * 
 * @param page - Playwright page instance
 * @param direction - 'up', 'down', or 'random'
 */
export async function randomScroll(
  page: Page,
  direction: 'up' | 'down' | 'random' = 'random'
): Promise<void> {
  const scrollDirection = direction === 'random' 
    ? (Math.random() < 0.7 ? 'down' : 'up') // 70% down (natural)
    : direction;
  
  const distance = Math.floor(Math.random() * 500) + 100;
  const scrollAmount = scrollDirection === 'down' ? distance : -distance;
  
  // Smooth scroll with human-like timing
  await page.mouse.wheel(0, scrollAmount);
  await scrollDelay();
  
  logger.debug(`Random scroll ${scrollDirection}: ${Math.abs(scrollAmount)}px`);
}

/**
 * Simulate random mouse movements
 * 
 * @param page - Playwright page instance
 * @param enabled - Whether mouse emulation is enabled
 */
export async function randomMouseMove(page: Page, enabled: boolean = true): Promise<void> {
  if (!enabled) return;
  
  // Get viewport size
  const viewport = page.viewportSize();
  if (!viewport) return;
  
  // Random coordinates within viewport
  const x = Math.floor(Math.random() * viewport.width * 0.8) + viewport.width * 0.1;
  const y = Math.floor(Math.random() * viewport.height * 0.8) + viewport.height * 0.1;
  
  // Move with bezier-like curve (simplified)
  const steps = 5;
  const currentPos = await page.evaluate(() => ({ x: 0, y: 0 })); // Placeholder
  
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const currentX = Math.round(currentPos.x + (x - currentPos.x) * progress);
    const currentY = Math.round(currentPos.y + (y - currentPos.y) * progress);
    
    await page.mouse.move(currentX, currentY);
    await randomDelay(20, 80); // Small delay between movements
  }
  
  logger.debug(`Mouse moved to (${Math.round(x)}, ${Math.round(y)})`);
}

// ============================================================================
// Rate Limiter Implementation (Token Bucket Algorithm)
// ============================================================================

interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  maxConcurrentRequests: number;
  minDelayMs: number;
  maxDelayMs: number;
}

interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Token bucket rate limiter for controlling request rates
 * Implements adaptive delays and queue management
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private tokens: number;
  private lastRefill: number;
  private activeRequests: number;
  private requestQueue: QueuedRequest<unknown>[];
  private requestTimes: number[];
  private isProcessingQueue: boolean;
  private dailyRequestCount: number;
  private lastRequestDate: string;
  private adaptiveMultiplier: number;

  constructor(rateLimiterConfig?: Partial<RateLimiterConfig>) {
    this.config = {
      maxRequestsPerMinute: rateLimiterConfig?.maxRequestsPerMinute ?? 10,
      maxConcurrentRequests: rateLimiterConfig?.maxConcurrentRequests ?? 2,
      minDelayMs: rateLimiterConfig?.minDelayMs ?? 2000,
      maxDelayMs: rateLimiterConfig?.maxDelayMs ?? 5000,
    };
    
    this.tokens = this.config.maxRequestsPerMinute;
    this.lastRefill = Date.now();
    this.activeRequests = 0;
    this.requestQueue = [];
    this.requestTimes = [];
    this.isProcessingQueue = false;
    this.dailyRequestCount = 0;
    this.lastRequestDate = new Date().toDateString();
    this.adaptiveMultiplier = 1.0;
    
    // Reset daily count if day changed
    this.resetDailyCountIfNeeded();
  }

  /**
   * Get singleton instance
   */
  private static instance: RateLimiter | null = null;
  
  public static getInstance(config?: Partial<RateLimiterConfig>): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter(config);
    }
    return RateLimiter.instance;
  }

  /**
   * Reset instance (for testing)
   */
  public static resetInstance(): void {
    RateLimiter.instance = null;
  }

  /**
   * Reset daily count if day has changed
   */
  private resetDailyCountIfNeeded(): void {
    const today = new Date().toDateString();
    if (today !== this.lastRequestDate) {
      this.dailyRequestCount = 0;
      this.lastRequestDate = today;
      logger.info('Daily request count reset for new day');
    }
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const refillRate = this.config.maxRequestsPerMinute / 60000; // tokens per ms
    const tokensToAdd = timePassed * refillRate;
    
    this.tokens = Math.min(
      this.config.maxRequestsPerMinute,
      this.tokens + tokensToAdd
    );
    this.lastRefill = now;
  }

  /**
   * Check if daily quota exceeded
   */
  public isDailyQuotaExceeded(): boolean {
    this.resetDailyCountIfNeeded();
    return this.dailyRequestCount >= config.scraper.dailyProfileQuota;
  }

  /**
   * Get remaining daily quota
   */
  public getRemainingDailyQuota(): number {
    this.resetDailyCountIfNeeded();
    return Math.max(0, config.scraper.dailyProfileQuota - this.dailyRequestCount);
  }

  /**
   * Get current request stats
   */
  public getStats(): {
    dailyRequests: number;
    dailyQuota: number;
    queueLength: number;
    activeRequests: number;
    adaptiveMultiplier: number;
  } {
    return {
      dailyRequests: this.dailyRequestCount,
      dailyQuota: config.scraper.dailyProfileQuota,
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests,
      adaptiveMultiplier: this.adaptiveMultiplier,
    };
  }

  /**
   * Consume a token and wait if necessary
   */
  private async consumeToken(): Promise<void> {
    this.refillTokens();
    
    while (this.tokens < 1) {
      this.refillTokens();
      if (this.tokens < 1) {
        const waitTime = Math.ceil((1 - this.tokens) * 60000 / this.config.maxRequestsPerMinute);
        logger.debug(`Rate limit: waiting ${waitTime}ms for token`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.tokens--;
  }

  /**
   * Calculate adaptive delay based on recent response times
   */
  private calculateAdaptiveDelay(): number {
    if (this.requestTimes.length < 3) {
      return this.config.minDelayMs;
    }
    
    // Calculate average response time
    const avg = this.requestTimes.reduce((a, b) => a + b, 0) / this.requestTimes.length;
    
    // If server is slow, increase delay
    if (avg > 3000) {
      this.adaptiveMultiplier = Math.min(2.0, this.adaptiveMultiplier * 1.1);
      logger.debug(`Server slow (avg ${Math.round(avg)}ms), increasing delay multiplier to ${this.adaptiveMultiplier.toFixed(2)}`);
    } else if (avg < 1000 && this.adaptiveMultiplier > 1.0) {
      // Server recovered, slowly decrease
      this.adaptiveMultiplier = Math.max(1.0, this.adaptiveMultiplier * 0.95);
    }
    
    return Math.round(this.config.minDelayMs * this.adaptiveMultiplier);
  }

  /**
   * Handle rate limit response (429)
   */
  public async handleRateLimit(): Promise<void> {
    logger.warn('Rate limit (429) detected, applying exponential backoff');
    
    // Exponential backoff
    const baseDelay = 60000; // 1 minute
    const backoffDelay = baseDelay * Math.pow(2, Math.min(this.adaptiveMultiplier - 1, 4));
    
    logger.info(`Backing off for ${Math.round(backoffDelay / 1000)} seconds...`);
    await new Promise(resolve => setTimeout(resolve, backoffDelay));
    
    // Increase adaptive multiplier
    this.adaptiveMultiplier = Math.min(3.0, this.adaptiveMultiplier * 1.5);
    
    // Clear some old request times to allow recovery
    this.requestTimes = this.requestTimes.slice(-5);
  }

  /**
   * Execute a function with rate limiting
   * 
   * @param fn - Function to execute
   * @param trackResponseTime - Whether to track response time for adaptation
   * @returns Promise with function result
   */
  public async execute<T>(
    fn: () => Promise<T>,
    trackResponseTime: boolean = true
  ): Promise<T> {
    // Check daily quota
    if (this.isDailyQuotaExceeded()) {
      throw new Error(`Daily quota exceeded (${config.scraper.dailyProfileQuota} requests)`);
    }

    // Wait for token
    await this.consumeToken();

    // Wait for concurrent slot
    while (this.activeRequests >= this.config.maxConcurrentRequests) {
      logger.debug(`Waiting for concurrent slot (${this.activeRequests}/${this.config.maxConcurrentRequests})`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Calculate adaptive delay
    const adaptiveDelay = this.calculateAdaptiveDelay();
    const maxDelay = this.config.maxDelayMs * this.adaptiveMultiplier;
    const finalDelay = Math.round(adaptiveDelay + Math.random() * (maxDelay - adaptiveDelay));
    
    logger.debug(`Rate limiter delay: ${finalDelay}ms`);
    await new Promise(resolve => setTimeout(resolve, finalDelay));

    // Execute request
    this.activeRequests++;
    const startTime = Date.now();
    
    try {
      const result = await fn();
      
      // Track response time
      if (trackResponseTime) {
        const responseTime = Date.now() - startTime;
        this.requestTimes.push(responseTime);
        
        // Keep only last 10 request times
        if (this.requestTimes.length > 10) {
          this.requestTimes.shift();
        }
      }
      
      // Increment daily count
      this.dailyRequestCount++;
      
      return result;
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  /**
   * Add request to queue
   */
  private enqueue<T>(request: QueuedRequest<T>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.requestQueue.push(request as QueuedRequest<unknown>);
    this.processQueue();
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue[0];
      
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await this.execute(request.execute as () => Promise<any>);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        request.resolve(result as any);
      } catch (error) {
        request.reject(error as Error);
      }
      
      this.requestQueue.shift();
    }

    this.isProcessingQueue = false;
  }

  /**
   * Queue a request for later execution
   * 
   * @param fn - Function to queue
   * @returns Promise that resolves when function is executed
   */
  public addToQueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.enqueue({
        execute: fn,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
  }
}

// ============================================================================
// Pre-configured Rate Limiter Instance
// ============================================================================

/**
 * Shared rate limiter instance
 * Use this across all scraper instances for consistent rate limiting
 */
export const rateLimiter = RateLimiter.getInstance({
  maxRequestsPerMinute: config.scraper.hourlyProfileQuota / 6, // per minute from hourly
  maxConcurrentRequests: config.scraper.concurrentBrowsersLimit,
  minDelayMs: config.scraper.delayMin,
  maxDelayMs: config.scraper.delayMax,
});

// ============================================================================
// Jitter Utilities
// ============================================================================

/**
 * Add jitter to a value
 * 
 * @param value - Base value
 * @param percentage - Jitter percentage (0-1)
 * @returns Value with jitter applied
 */
export function addJitter(value: number, percentage: number = 0.1): number {
  const jitter = value * percentage * (Math.random() * 2 - 1);
  return Math.round(value + jitter);
}

/**
 * Generate random jittered delay
 * 
 * @param baseDelay - Base delay in ms
 * @param jitterPercent - Jitter percentage
 * @returns Jittered delay
 */
export function jitteredDelay(baseDelay: number, jitterPercent: number = 0.15): number {
  return addJitter(baseDelay, jitterPercent);
}

// ============================================================================
// Export Types
// ============================================================================

export { RateLimiterConfig, QueuedRequest };
