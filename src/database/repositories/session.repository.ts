/**
 * Session Repository
 * 
 * Data access layer for Session entity with CRUD operations.
 * Manages browser session data for LinkedIn authentication persistence.
 */

import { getPrismaClient } from '../client';
import type { SessionData } from '@/types';
import { handlePrismaError } from '../errors';

const prisma = getPrismaClient();

export interface SessionEntry {
  id: string;
  platform: string;
  sessionData: unknown;
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new session
 * @param platform - Platform name (e.g., 'linkedin')
 * @param sessionData - Session data object
 * @param expiresAt - Expiration date
 * @returns Created session
 */
export async function createSession(
  platform: string,
  sessionData: SessionData,
  expiresAt: Date
): Promise<SessionEntry> {
  try {
    const result = await prisma.session.create({
      data: {
        platform,
        sessionData: sessionData as Record<string, unknown>,
        isActive: true,
        expiresAt,
      },
    });
    return result as SessionEntry;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Find session by ID
 * @param id - Session ID
 * @returns Session or null
 */
export async function findSessionById(
  id: string
): Promise<SessionEntry | null> {
  try {
    const result = await prisma.session.findUnique({
      where: { id },
    });
    return result as SessionEntry | null;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get active session for a platform
 * @param platform - Platform name
 * @returns Active session or null
 */
export async function getActiveSession(
  platform: string
): Promise<SessionEntry | null> {
  try {
    const result = await prisma.session.findFirst({
      where: {
        platform,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return result as SessionEntry | null;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get all sessions for a platform
 * @param platform - Platform name
 * @param includeInactive - Include inactive sessions
 * @returns Array of sessions
 */
export async function getSessionsByPlatform(
  platform: string,
  includeInactive: boolean = false
): Promise<SessionEntry[]> {
  try {
    const results = await prisma.session.findMany({
      where: {
        platform,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return results as SessionEntry[];
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Update session data
 * @param id - Session ID
 * @param data - Partial data to update
 * @returns Updated session
 */
export async function updateSession(
  id: string,
  data: {
    sessionData?: SessionData;
    isActive?: boolean;
    expiresAt?: Date;
  }
): Promise<SessionEntry> {
  try {
    const result = await prisma.session.update({
      where: { id },
      data: {
        ...(data.sessionData && { sessionData: data.sessionData as Record<string, unknown> }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.expiresAt && { expiresAt: data.expiresAt }),
      },
    });
    return result as SessionEntry;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Deactivate a session
 * @param id - Session ID
 * @returns Updated session
 */
export async function deactivateSession(
  id: string
): Promise<SessionEntry> {
  try {
    const result = await prisma.session.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
    return result as SessionEntry;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Deactivate all sessions for a platform
 * @param platform - Platform name
 * @returns Count of deactivated sessions
 */
export async function deactivateAllSessions(
  platform: string
): Promise<number> {
  try {
    const result = await prisma.session.updateMany({
      where: {
        platform,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
    return result.count;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Delete a session
 * @param id - Session ID
 * @returns Deleted session
 */
export async function deleteSession(
  id: string
): Promise<SessionEntry> {
  try {
    const result = await prisma.session.delete({
      where: { id },
    });
    return result as SessionEntry;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Delete expired sessions
 * @returns Count of deleted sessions
 */
export async function deleteExpiredSessions(): Promise<number> {
  try {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    return result.count;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Delete all inactive sessions
 * @returns Count of deleted sessions
 */
export async function deleteInactiveSessions(): Promise<number> {
  try {
    const result = await prisma.session.deleteMany({
      where: {
        isActive: false,
      },
    });
    return result.count;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Check if a valid active session exists
 * @param platform - Platform name
 * @returns boolean
 */
export async function hasValidSession(
  platform: string
): Promise<boolean> {
  try {
    const count = await prisma.session.count({
      where: {
        platform,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
    return count > 0;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Extend session expiration
 * @param id - Session ID
 * @param newExpiresAt - New expiration date
 * @returns Updated session
 */
export async function extendSession(
  id: string,
  newExpiresAt: Date
): Promise<SessionEntry> {
  try {
    const result = await prisma.session.update({
      where: { id },
      data: {
        expiresAt: newExpiresAt,
        isActive: true,
      },
    });
    return result as SessionEntry;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get session statistics
 * @returns Session statistics
 */
export async function getSessionStats(): Promise<{
  total: number;
  active: number;
  expired: number;
  byPlatform: Record<string, { total: number; active: number }>;
}> {
  try {
    const [total, active, expired, byPlatform] = await Promise.all([
      prisma.session.count(),
      prisma.session.count({ where: { isActive: true } }),
      prisma.session.count({
        where: {
          expiresAt: { lt: new Date() },
        },
      }),
      prisma.session.groupBy({
        by: ['platform'],
        _count: { platform: true },
      }),
    ]);

    const platformStats: Record<string, { total: number; active: number }> = {};
    
    for (const p of byPlatform) {
      const activeCount = await prisma.session.count({
        where: {
          platform: p.platform,
          isActive: true,
        },
      });
      
      platformStats[p.platform] = {
        total: p._count.platform,
        active: activeCount,
      };
    }

    return {
      total,
      active,
      expired,
      byPlatform: platformStats,
    };
  } catch (error) {
    handlePrismaError(error);
  }
}
