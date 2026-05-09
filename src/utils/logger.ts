import pino from 'pino';
import { config } from '@/config';

// Determine if pretty print should be enabled
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create logger instance
export const logger = pino({
  level: config.output.logLevel,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    pid: process.pid,
    env: process.env.NODE_ENV || 'development',
  },
});

// Helper functions for common log patterns
export function logError(error: unknown, context?: Record<string, unknown>): void {
  if (error instanceof Error) {
    logger.error(
      {
        err: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        ...context,
      },
      error.message
    );
  } else {
    logger.error({ error, ...context }, 'Unknown error occurred');
  }
}

export function logProgress(current: number, total: number, item?: string): void {
  const percentage = Math.round((current / total) * 100);
  logger.info(
    {
      progress: {
        current,
        total,
        percentage,
        item,
      },
    },
    `Progress: ${current}/${total} (${percentage}%)${item ? ` - ${item}` : ''}`
  );
}

export function logScrapingAttempt(url: string, status: 'success' | 'error' | 'retry', attempt?: number, error?: string): void {
  logger.info({
    scraping: {
      url,
      status,
      attempt,
      error,
      timestamp: new Date().toISOString(),
    },
  }, `Scraping ${status}: ${url}${error ? ` - ${error}` : ''}`);
}
