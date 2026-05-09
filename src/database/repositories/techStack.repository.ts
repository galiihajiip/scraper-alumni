/**
 * Tech Stack Repository
 * 
 * Data access layer for TechStack entity with CRUD operations.
 * Manages master list of technologies and their relationships with alumni.
 */

import { getPrismaClient } from '../client';
import type { TechStack, TechStackCategory } from '@/types';
import { SkillLevel } from '@/types/enums';
import { handlePrismaError } from '../errors';

const prisma = getPrismaClient();

/**
 * Create a new tech stack
 * @param nama - Tech name
 * @param kategori - Tech category
 * @returns Created tech stack
 */
export async function createTechStack(
  nama: string,
  kategori: TechStackCategory
): Promise<{ id: string; nama: string; kategori: string; createdAt: Date; updatedAt: Date }> {
  try {
    const result = await prisma.techStack.create({
      data: {
        nama,
        kategori,
      },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Find or create tech stack
 * @param nama - Tech name
 * @param kategori - Tech category
 * @returns Tech stack record
 */
export async function upsertTechStack(
  nama: string,
  kategori: TechStackCategory
): Promise<{ id: string; nama: string; kategori: string; createdAt: Date; updatedAt: Date }> {
  try {
    const result = await prisma.techStack.upsert({
      where: { nama },
      update: {},
      create: {
        nama,
        kategori,
      },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Find tech stack by ID
 * @param id - Tech stack ID
 * @returns Tech stack or null
 */
export async function findTechStackById(
  id: string
): Promise<{ id: string; nama: string; kategori: string; createdAt: Date; updatedAt: Date } | null> {
  try {
    const result = await prisma.techStack.findUnique({
      where: { id },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Find tech stack by name
 * @param nama - Tech name
 * @returns Tech stack or null
 */
export async function findTechStackByName(
  nama: string
): Promise<{ id: string; nama: string; kategori: string; createdAt: Date; updatedAt: Date } | null> {
  try {
    const result = await prisma.techStack.findUnique({
      where: { nama },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get all tech stacks
 * @param kategori - Optional category filter
 * @returns Array of tech stacks
 */
export async function getAllTechStacks(
  kategori?: TechStackCategory
): Promise<{ id: string; nama: string; kategori: string; createdAt: Date; updatedAt: Date }[]> {
  try {
    const results = await prisma.techStack.findMany({
      where: kategori ? { kategori } : undefined,
      orderBy: { nama: 'asc' },
    });
    return results;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Update tech stack
 * @param id - Tech stack ID
 * @param data - Partial data to update
 * @returns Updated tech stack
 */
export async function updateTechStack(
  id: string,
  data: { nama?: string; kategori?: TechStackCategory }
): Promise<{ id: string; nama: string; kategori: string; createdAt: Date; updatedAt: Date }> {
  try {
    const result = await prisma.techStack.update({
      where: { id },
      data: {
        ...(data.nama && { nama: data.nama }),
        ...(data.kategori && { kategori: data.kategori }),
      },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Delete tech stack
 * @param id - Tech stack ID
 * @returns Deleted tech stack
 */
export async function deleteTechStack(
  id: string
): Promise<{ id: string; nama: string; kategori: string; createdAt: Date; updatedAt: Date }> {
  try {
    const result = await prisma.techStack.delete({
      where: { id },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Associate tech stack with alumni
 * @param alumniId - Alumni ID
 * @param techStackId - Tech stack ID
 * @param level - Skill level (optional)
 * @returns Junction record
 */
export async function associateTechStackWithAlumni(
  alumniId: string,
  techStackId: string,
  level?: SkillLevel
): Promise<{ id: string; alumniId: string; techStackId: string; level: string | null; createdAt: Date; updatedAt: Date }> {
  try {
    const result = await prisma.alumniTechStack.upsert({
      where: {
        alumniId_techStackId: {
          alumniId,
          techStackId,
        },
      },
      update: {
        level: level || null,
      },
      create: {
        alumniId,
        techStackId,
        level: level || null,
      },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Remove tech stack association from alumni
 * @param alumniId - Alumni ID
 * @param techStackId - Tech stack ID
 * @returns Deleted junction record
 */
export async function removeTechStackFromAlumni(
  alumniId: string,
  techStackId: string
): Promise<{ id: string; alumniId: string; techStackId: string; level: string | null; createdAt: Date; updatedAt: Date }> {
  try {
    const result = await prisma.alumniTechStack.delete({
      where: {
        alumniId_techStackId: {
          alumniId,
          techStackId,
        },
      },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get tech stacks for an alumni
 * @param alumniId - Alumni ID
 * @returns Array of tech stacks with level
 */
export async function getTechStacksByAlumniId(
  alumniId: string
): Promise<Array<{
  id: string;
  nama: string;
  kategori: string;
  level: string | null;
}>> {
  try {
    const results = await prisma.alumniTechStack.findMany({
      where: { alumniId },
      include: {
        techStack: true,
      },
      orderBy: {
        techStack: {
          nama: 'asc',
        },
      },
    });

    return results.map(r => ({
      id: r.techStack.id,
      nama: r.techStack.nama,
      kategori: r.techStack.kategori,
      level: r.level,
    }));
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get popular tech stacks (most used by alumni)
 * @param limit - Number of results
 * @param kategori - Optional category filter
 * @returns Array of tech stacks with usage count
 */
export async function getPopularTechStacks(
  limit: number = 20,
  kategori?: TechStackCategory
): Promise<Array<{ id: string; nama: string; kategori: string; count: number }>> {
  try {
    const results = await prisma.alumniTechStack.groupBy({
      by: ['techStackId'],
      _count: { techStackId: true },
      orderBy: { _count: { techStackId: 'desc' } },
      take: limit,
    });

    // Get tech stack details
    const techStackIds = results.map(r => r.techStackId);
    const techStacks = await prisma.techStack.findMany({
      where: {
        id: { in: techStackIds },
        ...(kategori && { kategori }),
      },
    });

    return results
      .map(r => {
        const tech = techStacks.find(t => t.id === r.techStackId);
        if (!tech) return null;
        return {
          id: tech.id,
          nama: tech.nama,
          kategori: tech.kategori,
          count: r._count.techStackId,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Search tech stacks by name
 * @param query - Search query
 * @param limit - Number of results
 * @returns Array of matching tech stacks
 */
export async function searchTechStacks(
  query: string,
  limit: number = 10
): Promise<{ id: string; nama: string; kategori: string; createdAt: Date; updatedAt: Date }[]> {
  try {
    const results = await prisma.techStack.findMany({
      where: {
        nama: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: limit,
      orderBy: { nama: 'asc' },
    });
    return results;
  } catch (error) {
    handlePrismaError(error);
  }
}
