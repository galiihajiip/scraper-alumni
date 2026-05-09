/**
 * Alumni Repository
 * 
 * Data access layer for Alumni entity with CRUD operations
 * and upsert functionality for scraping results.
 */

import { getPrismaClient } from '../client';
import type { AlumniData, Pekerjaan, TechStack } from '@/types';
import { logger } from '@/utils/logger';

const prisma = getPrismaClient();

export interface AlumniWithRelations {
  id: string;
  namaLengkap: string;
  angkatan: number | null;
  tahunLulus: number | null;
  ipk: number | null;
  linkedInUrl: string;
  fotoProfil: string | null;
  spesialisasi: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastScrapedAt: Date | null;
  pekerjaan: Array<{
    id: string;
    posisi: string;
    perusahaan: string;
    isCurrent: boolean;
    tanggalMulai: Date | null;
    tanggalSelesai: Date | null;
    lokasi: string | null;
    deskripsi: string | null;
  }>;
  techStacks: Array<{
    techStack: {
      id: string;
      nama: string;
      kategori: string;
    };
    level: string | null;
  }>;
}

/**
 * Upsert alumni data (create or update existing)
 */
export async function upsertAlumni(data: AlumniData): Promise<AlumniWithRelations> {
  const result = await prisma.$transaction(async (tx) => {
    // Upsert alumni
    const alumni = await tx.alumni.upsert({
      where: { linkedInUrl: data.linkedInUrl },
      update: {
        namaLengkap: data.namaLengkap,
        angkatan: data.angkatan,
        tahunLulus: data.tahunLulus,
        ipk: data.ipk,
        fotoProfil: data.fotoProfil,
        spesialisasi: data.spesialisasi,
        lastScrapedAt: new Date(),
      },
      create: {
        namaLengkap: data.namaLengkap,
        angkatan: data.angkatan,
        tahunLulus: data.tahunLulus,
        ipk: data.ipk,
        linkedInUrl: data.linkedInUrl,
        fotoProfil: data.fotoProfil,
        spesialisasi: data.spesialisasi,
        lastScrapedAt: new Date(),
      },
    });

    // Delete old pekerjaan records (for sync)
    await tx.pekerjaan.deleteMany({
      where: { alumniId: alumni.id },
    });

    // Insert new pekerjaan records
    if (data.riwayatPekerjaan && data.riwayatPekerjaan.length > 0) {
      await tx.pekerjaan.createMany({
        data: data.riwayatPekerjaan.map(p => ({
          alumniId: alumni.id,
          posisi: p.posisi,
          perusahaan: p.perusahaan,
          isCurrent: p.isCurrent,
          tanggalMulai: p.tanggalMulai,
          tanggalSelesai: p.tanggalSelesai,
          lokasi: p.lokasi,
          deskripsi: p.deskripsi,
        })),
      });
    }

    // Handle tech stacks (upsert tech stack, then create junction records)
    if (data.techStack && data.techStack.length > 0) {
      for (const tech of data.techStack) {
        // Upsert tech stack
        const techStackRecord = await tx.techStack.upsert({
          where: { nama: tech.nama },
          update: {},
          create: {
            nama: tech.nama,
            kategori: tech.kategori,
          },
        });

        // Upsert junction record
        await tx.alumniTechStack.upsert({
          where: {
            alumniId_techStackId: {
              alumniId: alumni.id,
              techStackId: techStackRecord.id,
            },
          },
          update: {
            level: tech.level,
          },
          create: {
            alumniId: alumni.id,
            techStackId: techStackRecord.id,
            level: tech.level,
          },
        });
      }
    }

    // Return complete alumni data
    return tx.alumni.findUnique({
      where: { id: alumni.id },
      include: {
        pekerjaan: true,
        techStacks: {
          include: {
            techStack: true,
          },
        },
      },
    });
  });

  logger.info(`Alumni upserted: ${result?.namaLengkap} (${result?.linkedInUrl})`);
  
  return result as AlumniWithRelations;
}

/**
 * Find alumni by LinkedIn URL
 */
export async function findByLinkedInUrl(url: string): Promise<AlumniWithRelations | null> {
  return prisma.alumni.findUnique({
    where: { linkedInUrl: url },
    include: {
      pekerjaan: true,
      techStacks: {
        include: {
          techStack: true,
        },
      },
    },
  }) as Promise<AlumniWithRelations | null>;
}

/**
 * Check if alumni exists
 */
export async function existsByLinkedInUrl(url: string): Promise<boolean> {
  const count = await prisma.alumni.count({
    where: { linkedInUrl: url },
  });
  return count > 0;
}

/**
 * Get all alumni with pagination
 */
export async function getAll(options: {
  skip?: number;
  take?: number;
  angkatanMin?: number;
  angkatanMax?: number;
  spesialisasi?: string;
} = {}): Promise<AlumniWithRelations[]> {
  const { skip = 0, take = 100, angkatanMin, angkatanMax, spesialisasi } = options;

  return prisma.alumni.findMany({
    skip,
    take,
    where: {
      angkatan: {
        gte: angkatanMin,
        lte: angkatanMax,
      },
      spesialisasi: spesialisasi || undefined,
    },
    include: {
      pekerjaan: true,
      techStacks: {
        include: {
          techStack: true,
        },
      },
    },
    orderBy: {
      angkatan: 'desc',
    },
  }) as Promise<AlumniWithRelations[]>;
}

/**
 * Count total alumni
 */
export async function count(options: {
  angkatanMin?: number;
  angkatanMax?: number;
  spesialisasi?: string;
} = {}): Promise<number> {
  const { angkatanMin, angkatanMax, spesialisasi } = options;

  return prisma.alumni.count({
    where: {
      angkatan: {
        gte: angkatanMin,
        lte: angkatanMax,
      },
      spesialisasi: spesialisasi || undefined,
    },
  });
}

/**
 * Get statistics for dashboard
 */
export async function getStats(): Promise<{
  total: number;
  byAngkatan: Array<{ angkatan: number; count: number }>;
  bySpesialisasi: Array<{ spesialisasi: string; count: number }>;
}> {
  const [total, byAngkatan, bySpesialisasi] = await Promise.all([
    prisma.alumni.count(),
    prisma.alumni.groupBy({
      by: ['angkatan'],
      where: { angkatan: { not: null } },
      _count: { angkatan: true },
      orderBy: { angkatan: 'desc' },
    }),
    prisma.alumni.groupBy({
      by: ['spesialisasi'],
      where: { spesialisasi: { not: null } },
      _count: { spesialisasi: true },
      orderBy: { _count: { spesialisasi: 'desc' } },
    }),
  ]);

  return {
    total,
    byAngkatan: byAngkatan.map(g => ({
      angkatan: g.angkatan as number,
      count: g._count.angkatan,
    })),
    bySpesialisasi: bySpesialisasi.map(g => ({
      spesialisasi: g.spesialisasi as string,
      count: g._count.spesialisasi,
    })),
  };
}
