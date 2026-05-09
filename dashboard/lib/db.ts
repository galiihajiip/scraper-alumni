// Database utilities for dashboard
// Reuses Prisma client from parent project

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Stats aggregation
export async function getStats() {
  const [
    totalAlumni,
    angkatanStats,
    companyCount,
    techCount,
  ] = await Promise.all([
    prisma.alumni.count(),
    prisma.alumni.groupBy({
      by: ['angkatan'],
      _count: true,
    }),
    prisma.pekerjaan.groupBy({
      by: ['perusahaan'],
    }).then((companies: Array<Record<string, unknown>>) => companies.length),
    prisma.techStack.count(),
  ]);

  return {
    totalAlumni,
    totalAngkatan: angkatanStats.length,
    totalCompanies: companyCount,
    totalTechStacks: techCount,
    angkatanDistribution: angkatanStats,
  };
}

// Get alumni list with pagination
export async function getAlumni(options: {
  skip?: number;
  take?: number;
  angkatan?: number;
  search?: string;
}) {
  const { skip = 0, take = 20, angkatan, search } = options;

  const where: Record<string, unknown> = {};
  
  if (angkatan) {
    where.angkatan = angkatan;
  }
  
  if (search) {
    where.namaLengkap = {
      contains: search,
      mode: 'insensitive',
    };
  }

  const [alumni, total] = await Promise.all([
    prisma.alumni.findMany({
      where,
      skip,
      take,
      include: {
        pekerjaan: {
          where: { isCurrent: true },
          take: 1,
        },
        techStacks: {
          include: {
            techStack: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.alumni.count({ where }),
  ]);

  return { alumni, total, skip, take };
}

// Get specialization distribution
export async function getSpesialisasiStats() {
  return prisma.alumni.groupBy({
    by: ['spesialisasi'],
    _count: true,
  });
}

// Get tech stack popularity
export async function getTechStackStats() {
  return prisma.alumniTechStack.groupBy({
    by: ['techStackId'],
    _count: true,
    orderBy: {
      _count: {
        techStackId: 'desc',
      },
    },
    take: 20,
  });
}
