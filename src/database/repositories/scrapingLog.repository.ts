/**
 * Scraping Log Repository
 * 
 * Data access layer for ScrapingLog entity with CRUD operations.
 * Tracks all scraping attempts for monitoring and debugging.
 */

import { getPrismaClient } from '../client';
import type { ScrapingStatus } from '@/types';
import { handlePrismaError } from '../errors';

const prisma = getPrismaClient();

export interface ScrapingLogEntry {
  id: string;
  url: string;
  status: ScrapingStatus;
  errorMessage: string | null;
  retryCount: number;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScrapingLogInput {
  url: string;
  status: ScrapingStatus;
  errorMessage?: string;
  retryCount?: number;
  duration?: number;
}

/**
 * Create a new scraping log entry
 * @param data - Scraping log data
 * @returns Created log entry
 */
export async function createScrapingLog(
  data: CreateScrapingLogInput
): Promise<ScrapingLogEntry> {
  try {
    const result = await prisma.scrapingLog.create({
      data: {
        url: data.url,
        status: data.status,
        errorMessage: data.errorMessage || null,
        retryCount: data.retryCount || 0,
        duration: data.duration || null,
      },
    });
    return result as ScrapingLogEntry;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Update scraping log entry
 * @param id - Log entry ID
 * @param data - Partial data to update
 * @returns Updated log entry
 */
export async function updateScrapingLog(
  id: string,
  data: Partial<CreateScrapingLogInput>
): Promise<ScrapingLogEntry> {
  try {
    const result = await prisma.scrapingLog.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.errorMessage !== undefined && { errorMessage: data.errorMessage }),
        ...(data.retryCount !== undefined && { retryCount: data.retryCount }),
        ...(data.duration !== undefined && { duration: data.duration }),
      },
    });
    return result as ScrapingLogEntry;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Find log entry by ID
 * @param id - Log entry ID
 * @returns Log entry or null
 */
export async function findScrapingLogById(
  id: string
): Promise<ScrapingLogEntry | null> {
  try {
    const result = await prisma.scrapingLog.findUnique({
      where: { id },
    });
    return result as ScrapingLogEntry | null;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get all scraping logs with pagination
 * @param options - Query options
 * @returns Array of log entries
 */
export async function getScrapingLogs(options: {
  skip?: number;
  take?: number;
  status?: ScrapingStatus;
  url?: string;
  startDate?: Date;
  endDate?: Date;
} = {}): Promise<ScrapingLogEntry[]> {
  const { skip = 0, take = 100, status, url, startDate, endDate } = options;

  try {
    const results = await prisma.scrapingLog.findMany({
      skip,
      take,
      where: {
        ...(status && { status }),
        ...(url && { url: { contains: url, mode: 'insensitive' } }),
        ...(startDate && endDate && {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return results as ScrapingLogEntry[];
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get recent failed logs
 * @param limit - Number of results
 * @returns Array of failed log entries
 */
export async function getRecentFailedLogs(
  limit: number = 50
): Promise<ScrapingLogEntry[]> {
  try {
    const results = await prisma.scrapingLog.findMany({
      where: {
        status: 'FAILED',
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
    return results as ScrapingLogEntry[];
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get scraping statistics
 * @param startDate - Start date for stats
 * @param endDate - End date for stats
 * @returns Statistics object
 */
export async function getScrapingStats(
  startDate?: Date,
  endDate?: Date
): Promise<{
  total: number;
  successful: number;
  failed: number;
  retried: number;
  averageDuration: number;
  byStatus: Record<string, number>;
}> {
  try {
    const dateFilter = startDate && endDate ? {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    } : {};

    const [total, byStatus, avgDuration] = await Promise.all([
      prisma.scrapingLog.count({ where: dateFilter }),
      prisma.scrapingLog.groupBy({
        by: ['status'],
        where: dateFilter,
        _count: { status: true },
      }),
      prisma.scrapingLog.aggregate({
        where: {
          ...dateFilter,
          duration: { not: null },
        },
        _avg: { duration: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    let successful = 0;
    let failed = 0;
    let retried = 0;

    byStatus.forEach(s => {
      const count = s._count.status;
      statusCounts[s.status] = count;
      
      if (s.status === 'SUCCESS') successful += count;
      if (s.status === 'FAILED') failed += count;
      if (s.status === 'RETRYING') retried += count;
    });

    return {
      total,
      successful,
      failed,
      retried,
      averageDuration: Math.round(avgDuration._avg.duration || 0),
      byStatus: statusCounts,
    };
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Delete old log entries
 * @param beforeDate - Delete logs before this date
 * @returns Count of deleted entries
 */
export async function deleteOldScrapingLogs(
  beforeDate: Date
): Promise<number> {
  try {
    const result = await prisma.scrapingLog.deleteMany({
      where: {
        createdAt: {
          lt: beforeDate,
        },
      },
    });
    return result.count;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Check if URL was recently scraped successfully
 * @param url - URL to check
 * @param withinMinutes - Time window in minutes
 * @returns boolean
 */
export async function wasRecentlyScraped(
  url: string,
  withinMinutes: number = 60
): Promise<boolean> {
  try {
    const cutoffTime = new Date(Date.now() - withinMinutes * 60 * 1000);
    
    const count = await prisma.scrapingLog.count({
      where: {
        url,
        status: 'SUCCESS',
        createdAt: {
          gte: cutoffTime,
        },
      },
    });
    
    return count > 0;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get URLs that failed and need retry
 * @param maxRetries - Maximum retry count threshold
 * @param limit - Number of results
 * @returns Array of log entries eligible for retry
 */
export async function getFailedUrlsForRetry(
  maxRetries: number = 3,
  limit: number = 50
): Promise<ScrapingLogEntry[]> {
  try {
    const results = await prisma.scrapingLog.findMany({
      where: {
        status: 'FAILED',
        retryCount: {
          lt: maxRetries,
        },
      },
      take: limit,
      orderBy: {
        createdAt: 'asc',
      },
    });
    return results as ScrapingLogEntry[];
  } catch (error) {
    handlePrismaError(error);
  }
}
