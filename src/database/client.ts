/**
 * Prisma Database Client with Connection Management
 * 
 * Provides singleton PrismaClient instance with connection pooling,
 * retry logic, and graceful shutdown handling.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

// PrismaClient singleton instance
let prisma: PrismaClient | null = null;

// Connection retry configuration
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY = 1000;

/**
 * Get or create PrismaClient singleton instance
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'info' },
      ],
    });

    // Log slow queries (> 1 second)
    prisma.$on('query', (e) => {
      if (e.duration > 1000) {
        logger.warn({
          query: e.query,
          duration: e.duration,
          params: e.params,
        }, `Slow query detected (${e.duration}ms)`);
      }
    });

    // Log errors
    prisma.$on('error', (e) => {
      logger.error({ message: e.message }, 'Database error');
    });
  }

  return prisma;
}

/**
 * Connect to database with retry logic
 */
export async function connectWithRetry(): Promise<void> {
  const client = getPrismaClient();
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      logger.info(`Attempting database connection (attempt ${retries + 1}/${MAX_RETRIES})...`);
      await client.$connect();
      logger.info('Database connected successfully');
      return;
    } catch (error) {
      retries++;
      
      if (retries >= MAX_RETRIES) {
        logger.error('Max database connection retries exceeded');
        throw new Error(`Failed to connect to database: ${(error as Error).message}`);
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        RETRY_BASE_DELAY * Math.pow(2, retries) + Math.random() * 1000,
        30000
      );
      
      logger.warn(`Connection failed, retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Check database health
 */
export async function healthCheck(): Promise<boolean> {
  const client = getPrismaClient();
  
  try {
    // Simple query to verify connection
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Disconnect from database gracefully
 */
export async function disconnect(): Promise<void> {
  if (prisma) {
    logger.info('Disconnecting from database...');
    await prisma.$disconnect();
    prisma = null;
    logger.info('Database disconnected');
  }
}

/**
 * Graceful shutdown handler
 */
export function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception:', error);
    await disconnect();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    logger.error('Unhandled rejection:', reason);
    await disconnect();
    process.exit(1);
  });
}

// Re-export Prisma types
export * from '@prisma/client';
