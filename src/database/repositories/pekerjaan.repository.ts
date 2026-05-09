/**
 * Pekerjaan Repository
 * 
 * Data access layer for Pekerjaan entity with CRUD operations.
 * Manages work experience data for alumni.
 */

import { getPrismaClient } from '../client';
import type { Pekerjaan } from '@/types';
import { handlePrismaError } from '../errors';

const prisma = getPrismaClient();

/**
 * Create a new pekerjaan record
 * @param data - Pekerjaan data to create
 * @param alumniId - Parent alumni ID
 * @returns Created pekerjaan record
 */
export async function createPekerjaan(
  data: Omit<Pekerjaan, 'id'>,
  alumniId: string
): Promise<Pekerjaan & { id: string; alumniId: string }> {
  try {
    const result = await prisma.pekerjaan.create({
      data: {
        alumniId,
        posisi: data.posisi,
        perusahaan: data.perusahaan,
        isCurrent: data.isCurrent,
        tanggalMulai: data.tanggalMulai,
        tanggalSelesai: data.tanggalSelesai,
        lokasi: data.lokasi,
        deskripsi: data.deskripsi,
      },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Create multiple pekerjaan records in batch
 * @param dataArray - Array of pekerjaan data
 * @param alumniId - Parent alumni ID
 * @returns Count of created records
 */
export async function createManyPekerjaan(
  dataArray: Omit<Pekerjaan, 'id'>[],
  alumniId: string
): Promise<number> {
  try {
    const result = await prisma.pekerjaan.createMany({
      data: dataArray.map(data => ({
        alumniId,
        posisi: data.posisi,
        perusahaan: data.perusahaan,
        isCurrent: data.isCurrent,
        tanggalMulai: data.tanggalMulai,
        tanggalSelesai: data.tanggalSelesai,
        lokasi: data.lokasi,
        deskripsi: data.deskripsi,
      })),
    });
    return result.count;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Find pekerjaan by ID
 * @param id - Pekerjaan ID
 * @returns Pekerjaan record or null
 */
export async function findPekerjaanById(
  id: string
): Promise<(Pekerjaan & { id: string; alumniId: string }) | null> {
  try {
    const result = await prisma.pekerjaan.findUnique({
      where: { id },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get all pekerjaan for an alumni
 * @param alumniId - Alumni ID
 * @returns Array of pekerjaan records
 */
export async function getPekerjaanByAlumniId(
  alumniId: string
): Promise<(Pekerjaan & { id: string; alumniId: string })[]> {
  try {
    const results = await prisma.pekerjaan.findMany({
      where: { alumniId },
      orderBy: [
        { isCurrent: 'desc' },
        { tanggalMulai: 'desc' },
      ],
    });
    return results;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get current pekerjaan for an alumni
 * @param alumniId - Alumni ID
 * @returns Current pekerjaan or null
 */
export async function getCurrentPekerjaan(
  alumniId: string
): Promise<(Pekerjaan & { id: string; alumniId: string }) | null> {
  try {
    const result = await prisma.pekerjaan.findFirst({
      where: { 
        alumniId,
        isCurrent: true,
      },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Update pekerjaan record
 * @param id - Pekerjaan ID
 * @param data - Partial data to update
 * @returns Updated pekerjaan record
 */
export async function updatePekerjaan(
  id: string,
  data: Partial<Omit<Pekerjaan, 'id'>>
): Promise<Pekerjaan & { id: string; alumniId: string }> {
  try {
    const result = await prisma.pekerjaan.update({
      where: { id },
      data: {
        ...(data.posisi !== undefined && { posisi: data.posisi }),
        ...(data.perusahaan !== undefined && { perusahaan: data.perusahaan }),
        ...(data.isCurrent !== undefined && { isCurrent: data.isCurrent }),
        ...(data.tanggalMulai !== undefined && { tanggalMulai: data.tanggalMulai }),
        ...(data.tanggalSelesai !== undefined && { tanggalSelesai: data.tanggalSelesai }),
        ...(data.lokasi !== undefined && { lokasi: data.lokasi }),
        ...(data.deskripsi !== undefined && { deskripsi: data.deskripsi }),
      },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Delete pekerjaan record
 * @param id - Pekerjaan ID
 * @returns Deleted pekerjaan record
 */
export async function deletePekerjaan(
  id: string
): Promise<Pekerjaan & { id: string; alumniId: string }> {
  try {
    const result = await prisma.pekerjaan.delete({
      where: { id },
    });
    return result;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Delete all pekerjaan for an alumni
 * @param alumniId - Alumni ID
 * @returns Count of deleted records
 */
export async function deleteAllPekerjaanByAlumniId(
  alumniId: string
): Promise<number> {
  try {
    const result = await prisma.pekerjaan.deleteMany({
      where: { alumniId },
    });
    return result.count;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Count pekerjaan records
 * @param filters - Optional filters
 * @returns Count of records
 */
export async function countPekerjaan(filters?: {
  alumniId?: string;
  isCurrent?: boolean;
  perusahaan?: string;
}): Promise<number> {
  try {
    const count = await prisma.pekerjaan.count({
      where: {
        ...(filters?.alumniId && { alumniId: filters.alumniId }),
        ...(filters?.isCurrent !== undefined && { isCurrent: filters.isCurrent }),
        ...(filters?.perusahaan && { perusahaan: { contains: filters.perusahaan, mode: 'insensitive' } }),
      },
    });
    return count;
  } catch (error) {
    handlePrismaError(error);
  }
}

/**
 * Get popular companies (most alumni working there)
 * @param limit - Number of results
 * @returns Array of companies with count
 */
export async function getPopularCompanies(
  limit: number = 20
): Promise<Array<{ perusahaan: string; count: number }>> {
  try {
    const results = await prisma.pekerjaan.groupBy({
      by: ['perusahaan'],
      where: { isCurrent: true },
      _count: { perusahaan: true },
      orderBy: { _count: { perusahaan: 'desc' } },
      take: limit,
    });

    return results.map(r => ({
      perusahaan: r.perusahaan,
      count: r._count.perusahaan,
    }));
  } catch (error) {
    handlePrismaError(error);
  }
}
