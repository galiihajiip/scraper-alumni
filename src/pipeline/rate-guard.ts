/**
 * Rate Limit Guard & Ban Prevention
 * 
 * Monitoring system to detect ban warning signs and automatically
 * slow down or pause scraping to prevent account restrictions.
 * 
 * Features:
 * - HTTP response monitoring
 * - Adaptive throttling with progressive slowdown
 * - Daily/hourly quota tracking
 * - Recovery detection
 * - Multi-account coordination
 * 
 * @module pipeline/rate-guard
 */

import type { Page, Response } from 'playwright';
import { logger } from '@/utils/logger';
import { randomDelay } from '@/scraper/rate-limiter';
import { globalCircuitBreaker } from '@/scraper/retry-handler';
import { detectSecurityChallenge } from '@/scraper/navigation/verifier';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Rate guard operating mode
 */
export type GuardMode = 'normal' | 'cautious' | 'safe' | 'paused';

/**
 * Rate guard configuration
 */
export interface RateGuardConfig {
  /** Daily profile quota */
  dailyQuota: number;
  /** Hourly profile quota */
  hourlyQuota: number;
  /** Response time threshold for cautious mode (ms) */
  responseTimeThreshold: number;
  /** Error rate threshold for cautious mode (0-1) */
  errorRateThreshold: number;
  /** Consecutive errors before safe mode */
  consecutiveErrorThreshold: number;
  /** Cooldown period in ms before recovery test */
  cooldownPeriod: number;
  /** Minimum delay in safe mode (ms) */
  safeModeMinDelay: number;
  /** Maximum delay in safe mode (ms) */
  safeModeMaxDelay: number;
}

/**
 * Request metrics for monitoring
 */
export interface RequestMetrics {
  /** Timestamp */
  timestamp: Date;
  /** Response status code */
  statusCode: number;
  /** Response time in ms */
  responseTime: number;
  /** Whether request succeeded */
  success: boolean;
  /** Error type if failed */
  errorType?: string;
  /** URL requested */
  url: string;
}

/**
 * Quota tracking
 */
export interface QuotaStatus {
  /** Profiles scraped today */
  dailyCount: number;
  /** Profiles scraped this hour */
  hourlyCount: number;
  /** Remaining daily quota */
  dailyRemaining: number;
  /** Remaining hourly quota */
  hourlyRemaining: number;
  /** Whether daily quota exceeded */
  dailyExceeded: boolean;
  /** Whether hourly quota exceeded */
  hourlyExceeded: boolean;
}

/**
 * Guard status summary
 */
export interface GuardStatus {
  /** Current operating mode */
  mode: GuardMode;
  /** Current delay range */
  delayRange: { min: number; max: number };
  /** Recent error rate (last 20 requests) */
  errorRate: number;
  /** Average response time (last 20 requests) */
  avgResponseTime: number;
  /** Consecutive errors count */
  consecutiveErrors: number;
  /** Quota status */
  quota: QuotaStatus;
  /** Whether account appears restricted */
  isRestricted: boolean;
  /** Time until recovery test */
  timeUntilRecovery?: number;
}

/**
 * Event hooks for rate guard
 */
export interface RateGuardHooks {
  /** Called when mode changes */
  onModeChange?: (oldMode: GuardMode, newMode: GuardMode) => void;
  /** Called when paused */
  onPause?: (reason: string) => void;
  /** Called when resumed */
  onResume?: () => void;
  /** Called when quota exceeded */
  onQuotaExceeded?: (quotaType: 'daily' | 'hourly') => void;
  /** Called when recovery detected */
  onRecovery?: () => void;
  /** Called when account restriction detected */
  onRestriction?: () => void;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: RateGuardConfig = {
  dailyQuota: 200,
  hourlyQuota: 50,
  responseTimeThreshold: 5000, // 5 seconds
  errorRateThreshold: 0.3, // 30%
  consecutiveErrorThreshold: 5,
  cooldownPeriod: 300000, // 5 minutes
  safeModeMinDelay: 30000, // 30 seconds
  safeModeMaxDelay: 120000, // 2 minutes
};

// ============================================================================
// Rate Guard Class
// ============================================================================

/**
 * Rate Guard for monitoring and preventing bans
 */
export class RateGuard {
  private config: RateGuardConfig;
  private mode: GuardMode = 'normal';
  private metrics: RequestMetrics[] = [];
  private consecutiveErrors = 0;
  private dailyCount = 0;
  private hourlyCount = 0;
  private lastResetDate: string;
  private lastResetHour: number;
  private pausedUntil?: Date;
  private hooks: RateGuardHooks;
  private isMonitoring = false;
  private page?: Page;

  constructor(config?: Partial<RateGuardConfig>, hooks?: RateGuardHooks) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hooks = hooks || {};
    
    const now = new Date();
    this.lastResetDate = now.toDateString();
    this.lastResetHour = now.getHours();
    
    this.resetCountersIfNeeded();
  }

  /**
   * Start monitoring a page
   */
  startMonitoring(page: Page): void {
    if (this.isMonitoring) {
      return;
    }
    
    this.page = page;
    this.isMonitoring = true;
    
    // Listen to all responses
    page.on('response', (response) => {
      this.handleResponse(response);
    });
    
    logger.info('Rate guard monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    this.page = undefined;
    logger.info('Rate guard monitoring stopped');
  }

  /**
   * Record a request attempt (manual tracking)
   */
  recordRequest(metrics: RequestMetrics): void {
    this.addMetric(metrics);
    this.updateMode();
  }

  /**
   * Record a profile scraped (for quota tracking)
   */
  recordProfileScraped(): void {
    this.resetCountersIfNeeded();
    this.dailyCount++;
    this.hourlyCount++;
    
    logger.debug(`Quota: ${this.dailyCount}/${this.config.dailyQuota} daily, ${this.hourlyCount}/${this.config.hourlyQuota} hourly`);
    
    // Check quotas
    if (this.dailyCount >= this.config.dailyQuota) {
      this.pause('Daily quota exceeded');
      this.hooks.onQuotaExceeded?.('daily');
    } else if (this.hourlyCount >= this.config.hourlyQuota) {
      this.pause('Hourly quota exceeded');
      this.hooks.onQuotaExceeded?.('hourly');
    }
  }

  /**
   * Get current delay range based on mode
   */
  getDelayRange(): { min: number; max: number } {
    switch (this.mode) {
      case 'normal':
        return { min: 2000, max: 5000 };
      case 'cautious':
        return { min: 5000, max: 15000 };
      case 'safe':
        return { 
          min: this.config.safeModeMinDelay, 
          max: this.config.safeModeMaxDelay 
        };
      case 'paused':
        return { min: 0, max: 0 };
      default:
        return { min: 2000, max: 5000 };
    }
  }

  /**
   * Wait for the appropriate delay
   */
  async wait(): Promise<void> {
    if (this.mode === 'paused') {
      await this.waitForResume();
      return;
    }
    
    const range = this.getDelayRange();
    const delay = Math.random() * (range.max - range.min) + range.min;
    
    logger.debug(`Rate guard delay: ${Math.round(delay)}ms (${this.mode} mode)`);
    await randomDelay(delay, delay);
  }

  /**
   * Pause scraping
   */
  pause(reason: string): void {
    if (this.mode === 'paused') return;
    
    const oldMode = this.mode;
    this.mode = 'paused';
    this.pausedUntil = new Date(Date.now() + this.config.cooldownPeriod);
    
    logger.warn(`Rate guard PAUSED: ${reason}. Will attempt recovery at ${this.pausedUntil.toISOString()}`);
    
    this.hooks.onModeChange?.(oldMode, 'paused');
    this.hooks.onPause?.(reason);
  }

  /**
   * Resume scraping
   */
  resume(): void {
    if (this.mode !== 'paused') return;
    
    const oldMode = this.mode;
    this.mode = 'normal';
    this.pausedUntil = undefined;
    this.consecutiveErrors = 0;
    
    logger.info('Rate guard RESUMED: Back to normal mode');
    
    this.hooks.onModeChange?.(oldMode, 'normal');
    this.hooks.onResume?.();
  }

  /**
   * Get current status
   */
  getStatus(): GuardStatus {
    const recentMetrics = this.getRecentMetrics(20);
    const errorRate = this.calculateErrorRate(recentMetrics);
    const avgResponseTime = this.calculateAvgResponseTime(recentMetrics);
    
    return {
      mode: this.mode,
      delayRange: this.getDelayRange(),
      errorRate,
      avgResponseTime,
      consecutiveErrors: this.consecutiveErrors,
      quota: this.getQuotaStatus(),
      isRestricted: this.mode === 'safe' || this.mode === 'paused',
      timeUntilRecovery: this.pausedUntil 
        ? Math.max(0, this.pausedUntil.getTime() - Date.now())
        : undefined,
    };
  }

  /**
   * Check if can proceed with request
   */
  canProceed(): { allowed: boolean; reason?: string } {
    this.resetCountersIfNeeded();
    
    if (this.mode === 'paused') {
      if (this.pausedUntil && new Date() < this.pausedUntil) {
        return { 
          allowed: false, 
          reason: `Paused until ${this.pausedUntil.toISOString()}` 
        };
      }
      // Time to test recovery
      this.testRecovery();
      return { allowed: false, reason: 'Testing recovery' };
    }
    
    if (this.dailyCount >= this.config.dailyQuota) {
      return { allowed: false, reason: 'Daily quota exceeded' };
    }
    
    if (this.hourlyCount >= this.config.hourlyQuota) {
      return { allowed: false, reason: 'Hourly quota exceeded' };
    }
    
    return { allowed: true };
  }

  /**
   * Handle HTTP response
   */
  private handleResponse(response: Response): void {
    const status = response.status();
    const url = response.url();
    
    // Track response time
    const timing = response.request().timing();
    const responseTime = timing?.responseEnd - timing?.startTime || 0;
    
    const metrics: RequestMetrics = {
      timestamp: new Date(),
      statusCode: status,
      responseTime,
      success: status >= 200 && status < 300,
      url,
    };
    
    // Add error type for specific status codes
    if (status === 429) {
      metrics.errorType = 'rate_limit';
    } else if (status === 403) {
      metrics.errorType = 'forbidden';
    } else if (status === 401) {
      metrics.errorType = 'unauthorized';
    }
    
    this.addMetric(metrics);
    this.updateMode();
  }

  /**
   * Add metric to history
   */
  private addMetric(metric: RequestMetrics): void {
    this.metrics.push(metric);
    
    // Keep only last 100 metrics
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }
    
    // Track consecutive errors
    if (!metric.success) {
      this.consecutiveErrors++;
    } else {
      this.consecutiveErrors = 0;
    }
  }

  /**
   * Update operating mode based on metrics
   */
  private updateMode(): void {
    if (this.mode === 'paused') return;
    
    const recentMetrics = this.getRecentMetrics(20);
    const errorRate = this.calculateErrorRate(recentMetrics);
    const avgResponseTime = this.calculateAvgResponseTime(recentMetrics);
    
    const oldMode = this.mode;
    
    // Check for severe issues
    if (this.consecutiveErrors >= this.config.consecutiveErrorThreshold) {
      this.mode = 'safe';
      logger.warn(`Entering SAFE mode: ${this.consecutiveErrors} consecutive errors`);
    }
    // Check for moderate issues
    else if (errorRate > this.config.errorRateThreshold || 
             avgResponseTime > this.config.responseTimeThreshold) {
      if (this.mode === 'normal') {
        this.mode = 'cautious';
        logger.warn(`Entering CAUTIOUS mode: error rate ${(errorRate * 100).toFixed(1)}%, avg response ${avgResponseTime.toFixed(0)}ms`);
      } else if (this.mode === 'cautious') {
        this.mode = 'safe';
        logger.warn(`Entering SAFE mode from cautious: error rate ${(errorRate * 100).toFixed(1)}%`);
      }
    }
    // Recovery path
    else if (errorRate < 0.1 && avgResponseTime < 3000) {
      if (this.mode === 'safe') {
        this.mode = 'cautious';
        logger.info('Improving to CAUTIOUS mode');
      } else if (this.mode === 'cautious' && this.consecutiveErrors === 0) {
        this.mode = 'normal';
        logger.info('Restored to NORMAL mode');
      }
    }
    
    if (oldMode !== this.mode) {
      this.hooks.onModeChange?.(oldMode, this.mode);
    }
  }

  /**
   * Test recovery after cooldown
   */
  private async testRecovery(): Promise<void> {
    logger.info('Testing recovery with single request...');
    
    try {
      // Make a test request
      if (this.page) {
        await this.page.goto('https://www.linkedin.com', { 
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        
        // Check for challenges
        const challenge = await detectSecurityChallenge(this.page);
        if (challenge) {
          logger.error('Recovery test failed: Security challenge detected');
          this.hooks.onRestriction?.();
          return;
        }
        
        // Check if we can access feed
        const isLoggedIn = await this.page.locator('.feed-identity-module').count() > 0;
        if (isLoggedIn) {
          logger.info('Recovery test successful!');
          this.resume();
          this.hooks.onRecovery?.();
        } else {
          logger.error('Recovery test failed: Not logged in');
          this.hooks.onRestriction?.();
        }
      }
    } catch (error) {
      logger.error('Recovery test failed:', error);
      this.pausedUntil = new Date(Date.now() + this.config.cooldownPeriod);
    }
  }

  /**
   * Wait for resume
   */
  private async waitForResume(): Promise<void> {
    while (this.mode === 'paused') {
      if (this.pausedUntil && new Date() >= this.pausedUntil) {
        await this.testRecovery();
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
    }
  }

  /**
   * Reset counters if day/hour changed
   */
  private resetCountersIfNeeded(): void {
    const now = new Date();
    
    // Check if day changed
    if (now.toDateString() !== this.lastResetDate) {
      this.dailyCount = 0;
      this.lastResetDate = now.toDateString();
      logger.info('Daily quota reset');
    }
    
    // Check if hour changed
    if (now.getHours() !== this.lastResetHour) {
      this.hourlyCount = 0;
      this.lastResetHour = now.getHours();
      logger.info('Hourly quota reset');
    }
  }

  /**
   * Get recent metrics
   */
  private getRecentMetrics(count: number): RequestMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * Calculate error rate from metrics
   */
  private calculateErrorRate(metrics: RequestMetrics[]): number {
    if (metrics.length === 0) return 0;
    const errors = metrics.filter(m => !m.success).length;
    return errors / metrics.length;
  }

  /**
   * Calculate average response time
   */
  private calculateAvgResponseTime(metrics: RequestMetrics[]): number {
    if (metrics.length === 0) return 0;
    const total = metrics.reduce((sum, m) => sum + m.responseTime, 0);
    return total / metrics.length;
  }

  /**
   * Get quota status
   */
  private getQuotaStatus(): QuotaStatus {
    this.resetCountersIfNeeded();
    
    return {
      dailyCount: this.dailyCount,
      hourlyCount: this.hourlyCount,
      dailyRemaining: Math.max(0, this.config.dailyQuota - this.dailyCount),
      hourlyRemaining: Math.max(0, this.config.hourlyQuota - this.hourlyCount),
      dailyExceeded: this.dailyCount >= this.config.dailyQuota,
      hourlyExceeded: this.hourlyCount >= this.config.hourlyQuota,
    };
  }
}

// ============================================================================
// Multi-Account Coordination
// ============================================================================

/**
 * Account pool for rotation when rate limited
 */
export class AccountPool {
  private accounts: Map<string, RateGuard> = new Map();
  private currentAccount?: string;

  /**
   * Add account to pool
   */
  addAccount(accountId: string, guard: RateGuard): void {
    this.accounts.set(accountId, guard);
    
    // Set up restriction hook to auto-switch
    const originalHook = guard['hooks'].onRestriction;
    guard['hooks'].onRestriction = () => {
      originalHook?.();
      this.switchToNextAccount(accountId);
    };
    
    if (!this.currentAccount) {
      this.currentAccount = accountId;
    }
  }

  /**
   * Get current active account
   */
  getCurrentAccount(): { id: string; guard: RateGuard } | null {
    if (!this.currentAccount) return null;
    const guard = this.accounts.get(this.currentAccount);
    if (!guard) return null;
    return { id: this.currentAccount, guard };
  }

  /**
   * Switch to next available account
   */
  private switchToNextAccount(excludedId: string): void {
    const available = Array.from(this.accounts.entries())
      .filter(([id, guard]) => id !== excludedId && guard.getStatus().mode !== 'paused')
      .map(([id]) => id);
    
    if (available.length > 0) {
      this.currentAccount = available[0];
      logger.info(`Switched to account: ${this.currentAccount}`);
    } else {
      logger.error('No available accounts in pool!');
      // Pause all
      for (const guard of this.accounts.values()) {
        guard.pause('All accounts exhausted');
      }
    }
  }

  /**
   * Get status of all accounts
   */
  getAllStatuses(): Array<{ id: string; status: GuardStatus }> {
    return Array.from(this.accounts.entries()).map(([id, guard]) => ({
      id,
      status: guard.getStatus(),
    }));
  }
}

// ============================================================================
// Global Rate Guard Instance
// ============================================================================

/**
 * Shared rate guard instance
 */
export const globalRateGuard = new RateGuard();

// ============================================================================
// Export
// ============================================================================

// Classes and types are exported via 'export' declarations above
