/**
 * Error Recovery & Retry Logic
 * 
 * Implements robust retry mechanisms with exponential backoff, circuit breaker pattern,
 * and error classification for handling transient failures gracefully.
 * 
 * Features:
 * - Exponential backoff with jitter
 * - Error classification (retryable vs non-retryable)
 * - Circuit breaker pattern for error rate control
 * - Integration with ScrapingLog for tracking
 * - Comprehensive logging
 * 
 * @module scraper/retry-handler
 */

import type { BrowserContext, Page } from 'playwright';
import { ScrapingStatus, ErrorType } from '@/types/enums';
import { logger } from '@/utils/logger';
import * as scrapingLogRepo from '@/database/repositories/scrapingLog.repository';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay in milliseconds */
  baseDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Jitter percentage (0-1) */
  jitter?: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Function called before each retry */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
  /** Function called on final failure */
  onFinalFailure?: (error: Error, attempts: number) => void;
  /** URL being scraped (for logging) */
  url?: string;
  /** Scraping log ID (for status updates) */
  scrapingLogId?: string;
}

/**
 * Retry result wrapper
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
}

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold percentage (0-1) to open circuit */
  failureThreshold: number;
  /** Number of requests to consider for failure rate */
  requestVolumeThreshold: number;
  /** Time in ms to wait before attempting recovery */
  recoveryTimeout: number;
  /** Success threshold in HALF_OPEN to close circuit */
  successThreshold: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: 0.1,
  isRetryable: isRetryableError,
  onRetry: () => {},
  onFinalFailure: () => {},
  url: '',
  scrapingLogId: '',
};

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 0.5,      // 50% failure rate
  requestVolumeThreshold: 10,  // Last 10 requests
  recoveryTimeout: 300000,     // 5 minutes
  successThreshold: 3,          // 3 successes to close
};

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Classify error type for scraping
 */
export function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase();
  
  // Network errors
  if (message.includes('timeout') || message.includes('etimedout')) {
    return ErrorType.TIMEOUT_ERROR;
  }
  if (message.includes('network') || message.includes('enotfound') || message.includes('econnrefused')) {
    return ErrorType.NETWORK_ERROR;
  }
  if (message.includes('429') || message.includes('too many requests') || message.includes('rate limit')) {
    return ErrorType.RATE_LIMITED;
  }
  
  // Auth errors
  if (message.includes('401') || message.includes('403') || message.includes('unauthorized') || message.includes('forbidden')) {
    return ErrorType.AUTH_ERROR;
  }
  
  // Not found
  if (message.includes('404') || message.includes('not found')) {
    return ErrorType.NOT_FOUND;
  }
  
  // Browser errors
  if (message.includes('browser') || message.includes('chromium') || message.includes('context')) {
    return ErrorType.BROWSER_ERROR;
  }
  
  // Parsing errors
  if (message.includes('parse') || message.includes('selector') || message.includes('element')) {
    return ErrorType.PARSING_ERROR;
  }
  
  return ErrorType.UNKNOWN_ERROR;
}

/**
 * Determine if an error is retryable
 * 
 * @param error - Error to check
 * @returns boolean - True if error can be retried
 */
export function isRetryableError(error: Error): boolean {
  const errorType = classifyError(error);
  
  const retryableTypes = [
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT_ERROR,
    ErrorType.RATE_LIMITED,
    ErrorType.BROWSER_ERROR,
    ErrorType.UNKNOWN_ERROR,
  ];
  
  return retryableTypes.includes(errorType);
}

/**
 * Check if error indicates temporary ban
 */
export function isTemporaryBan(error: Error): boolean {
  const message = error.message.toLowerCase();
  return message.includes('429') || 
         message.includes('too many requests') ||
         message.includes('rate limited') ||
         message.includes('temporarily restricted');
}

// ============================================================================
// Exponential Backoff with Jitter
// ============================================================================

/**
 * Calculate delay with exponential backoff and jitter
 * 
 * @param attempt - Current attempt number (0-based)
 * @param baseDelay - Base delay in ms
 * @param maxDelay - Maximum delay in ms
 * @param jitter - Jitter percentage (0-1)
 * @returns Calculated delay in ms
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitter: number
): number {
  // Exponential: baseDelay * 2^attempt
  const exponential = baseDelay * Math.pow(2, attempt);
  
  // Add jitter: ±jitter% of calculated delay
  const jitterAmount = exponential * jitter * (Math.random() * 2 - 1);
  const delay = exponential + jitterAmount;
  
  // Cap at maxDelay
  return Math.min(Math.round(delay), maxDelay);
}

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

/**
 * Circuit breaker for controlling error rates
 * Prevents cascading failures by pausing requests when error rate is high
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private config: CircuitBreakerConfig;
  private requestHistory: { success: boolean; timestamp: number }[] = [];
  private lastFailureTime: number = 0;
  private halfOpenSuccesses: number = 0;
  private isTestRequest: boolean = false;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Check if request should be allowed
   */
  canExecute(): boolean {
    this.updateState();
    return this.state !== CircuitState.OPEN;
  }

  /**
   * Record successful request
   */
  recordSuccess(): void {
    this.addToHistory(true);
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      logger.info(`Circuit breaker: ${this.halfOpenSuccesses}/${this.config.successThreshold} successes in HALF_OPEN`);
      
      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.closeCircuit();
      }
    }
  }

  /**
   * Record failed request
   */
  recordFailure(error: Error): void {
    this.addToHistory(false);
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      logger.warn('Circuit breaker: Failure in HALF_OPEN, reopening circuit');
      this.openCircuit();
    } else if (this.state === CircuitState.CLOSED) {
      this.checkFailureThreshold();
    }
  }

  /**
   * Get current stats
   */
  getStats(): {
    state: CircuitState;
    failureRate: number;
    totalRequests: number;
    timeUntilRecovery: number;
  } {
    this.updateState();
    const failureRate = this.calculateFailureRate();
    const totalRequests = this.requestHistory.length;
    
    let timeUntilRecovery = 0;
    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - this.lastFailureTime;
      timeUntilRecovery = Math.max(0, this.config.recoveryTimeout - elapsed);
    }
    
    return {
      state: this.state,
      failureRate,
      totalRequests,
      timeUntilRecovery,
    };
  }

  /**
   * Force reset circuit to CLOSED
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.requestHistory = [];
    this.halfOpenSuccesses = 0;
    this.isTestRequest = false;
    logger.info('Circuit breaker manually reset to CLOSED');
  }

  /**
   * Update circuit state based on time
   */
  private updateState(): void {
    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.recoveryTimeout) {
        logger.info('Circuit breaker: Recovery timeout reached, entering HALF_OPEN');
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenSuccesses = 0;
        this.isTestRequest = true;
      }
    }
  }

  /**
   * Add result to history
   */
  private addToHistory(success: boolean): void {
    this.requestHistory.push({
      success,
      timestamp: Date.now(),
    });
    
    // Keep only recent history
    const cutoff = Date.now() - 60000; // 1 minute
    this.requestHistory = this.requestHistory.filter(r => r.timestamp > cutoff);
  }

  /**
   * Calculate current failure rate
   */
  private calculateFailureRate(): number {
    if (this.requestHistory.length < this.config.requestVolumeThreshold) {
      return 0;
    }
    
    const failures = this.requestHistory.filter(r => !r.success).length;
    return failures / this.requestHistory.length;
  }

  /**
   * Check if failure threshold reached
   */
  private checkFailureThreshold(): void {
    const failureRate = this.calculateFailureRate();
    
    if (failureRate >= this.config.failureThreshold && 
        this.requestHistory.length >= this.config.requestVolumeThreshold) {
      logger.warn(`Circuit breaker: Failure rate ${(failureRate * 100).toFixed(1)}% exceeded threshold, opening circuit`);
      this.openCircuit();
    }
  }

  /**
   * Open the circuit
   */
  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.lastFailureTime = Date.now();
    this.halfOpenSuccesses = 0;
    logger.warn(`Circuit breaker opened - pausing for ${this.config.recoveryTimeout / 1000}s`);
  }

  /**
   * Close the circuit
   */
  private closeCircuit(): void {
    this.state = CircuitState.CLOSED;
    this.requestHistory = [];
    this.halfOpenSuccesses = 0;
    this.isTestRequest = false;
    logger.info('Circuit breaker closed - resuming normal operation');
  }
}

// ============================================================================
// Retry Implementation
// ============================================================================

/**
 * Execute function with retry logic
 * 
 * @param fn - Function to execute
 * @param options - Retry options
 * @returns Promise with result
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const startTime = Date.now();
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Update scraping log status to RETRYING (if not first attempt)
      if (attempt > 0 && opts.scrapingLogId) {
        await updateScrapingLogStatus(opts.scrapingLogId, ScrapingStatus.RETRYING, attempt);
      }
      
      const result = await fn();
      
      // Success!
      const totalDuration = Date.now() - startTime;
      
      // Update scraping log to SUCCESS
      if (opts.scrapingLogId) {
        await updateScrapingLogStatus(opts.scrapingLogId, ScrapingStatus.SUCCESS, attempt, totalDuration);
      }
      
      if (attempt > 0) {
        logger.info(`Retry succeeded for ${opts.url} on attempt ${attempt + 1}/${opts.maxRetries + 1}`);
      }
      
      return {
        success: true,
        data: result,
        attempts: attempt + 1,
        totalDuration,
      };
      
    } catch (error) {
      lastError = error as Error;
      const errorType = classifyError(lastError);
      
      // Check if retryable
      if (!opts.isRetryable(lastError) || attempt >= opts.maxRetries) {
        // Non-retryable or max retries reached
        const totalDuration = Date.now() - startTime;
        
        // Update scraping log to FAILED
        if (opts.scrapingLogId) {
          await updateScrapingLogStatus(
            opts.scrapingLogId, 
            ScrapingStatus.FAILED, 
            attempt + 1, 
            totalDuration,
            lastError.message
          );
        }
        
        if (attempt >= opts.maxRetries) {
          logger.error(`Max retries (${opts.maxRetries}) exceeded for ${opts.url}: ${lastError.message}`);
          opts.onFinalFailure(lastError, attempt + 1);
        } else {
          logger.error(`Non-retryable error for ${opts.url}: ${errorType} - ${lastError.message}`);
        }
        
        return {
          success: false,
          error: lastError,
          attempts: attempt + 1,
          totalDuration,
        };
      }
      
      // Calculate backoff delay
      const delay = calculateBackoffDelay(
        attempt,
        opts.baseDelay,
        opts.maxDelay,
        opts.jitter
      );
      
      // Log retry attempt
      logger.warn(
        `Retry ${attempt + 1}/${opts.maxRetries} for ${opts.url} ` +
        `after ${delay}ms - Error: ${errorType} - ${lastError.message}`
      );
      
      // Call retry callback
      opts.onRetry(attempt + 1, lastError, delay);
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Should never reach here, but TypeScript needs it
  return {
    success: false,
    error: lastError,
    attempts: opts.maxRetries + 1,
    totalDuration: Date.now() - startTime,
  };
}

/**
 * Update scraping log status
 */
async function updateScrapingLogStatus(
  logId: string,
  status: ScrapingStatus,
  retryCount: number,
  duration?: number,
  errorMessage?: string
): Promise<void> {
  try {
    await scrapingLogRepo.updateScrapingLog(logId, {
      status,
      retryCount,
      ...(duration && { duration }),
      ...(errorMessage && { errorMessage }),
    });
  } catch (error) {
    logger.error('Failed to update scraping log:', error);
  }
}

// ============================================================================
// Retry Decorator
// ============================================================================

/**
 * Decorator for retry logic (for use with class methods)
 * Note: Requires experimentalDecorators in tsconfig
 */
export function Retryable(options: RetryOptions = {}) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: unknown[]) {
      return retryWithBackoff(() => originalMethod.apply(this, args), {
        ...options,
        url: propertyKey,
      });
    };
    
    return descriptor;
  };
}

// ============================================================================
// Wrapper Functions for Scraping
// ============================================================================

/**
 * Wrap a scraping function with retry and circuit breaker
 * 
 * @param fn - Scraping function
 * @param url - URL being scraped
 * @param circuitBreaker - Circuit breaker instance
 * @param retryOptions - Retry options
 * @returns Wrapped function
 */
export function wrapWithRetry<T>(
  fn: () => Promise<T>,
  url: string,
  circuitBreaker?: CircuitBreaker,
  retryOptions: RetryOptions = {}
): () => Promise<RetryResult<T>> {
  return async () => {
    // Check circuit breaker
    if (circuitBreaker && !circuitBreaker.canExecute()) {
      const stats = circuitBreaker.getStats();
      const minutes = Math.ceil(stats.timeUntilRecovery / 60000);
      throw new Error(
        `Circuit breaker is OPEN. Retrying in ${minutes} minutes.`
      );
    }
    
    // Create scraping log entry
    let scrapingLogId: string | undefined;
    try {
      const log = await scrapingLogRepo.createScrapingLog({
        url,
        status: ScrapingStatus.PENDING,
      });
      scrapingLogId = log.id;
    } catch (error) {
      logger.error('Failed to create scraping log:', error);
    }
    
    // Execute with retry
    const result = await retryWithBackoff(fn, {
      ...retryOptions,
      url,
      scrapingLogId,
    });
    
    // Update circuit breaker
    if (circuitBreaker) {
      if (result.success) {
        circuitBreaker.recordSuccess();
      } else {
        circuitBreaker.recordFailure(result.error!);
      }
    }
    
    return result;
  };
}

/**
 * Create default circuit breaker for scraping
 */
export function createDefaultCircuitBreaker(): CircuitBreaker {
  return new CircuitBreaker(DEFAULT_CIRCUIT_CONFIG);
}

// ============================================================================
// Shared Circuit Breaker Instance
// ============================================================================

/**
 * Shared circuit breaker instance for all scraping operations
 */
export const globalCircuitBreaker = new CircuitBreaker(DEFAULT_CIRCUIT_CONFIG);

// ============================================================================
// Export Types
// ============================================================================

export { CircuitState };
