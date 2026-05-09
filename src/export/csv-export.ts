/**
 * CSV Export Handler
 * 
 * Export alumni data to CSV format with configurable filters
 */

import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { getPrismaClient } from '@/database/client';
import type { ExportFilters, ExportOptions } from '@/types';
import { logger } from '@/utils/logger';

const prisma = getPrismaClient();

interface FlattenedAlumni {
  id: string;
  namaLengkap: string;
  angkatan: number | string;
  tahunLulus: number | string;
  ipk: number | string;
  linkedInUrl: string;
  fotoProfil: string;
  spesialisasi: string;
  pekerjaanSaatIni: string;
  perusahaanSaatIni: string;
  riwayatPekerjaan: string;
  techStack: string;
  gajiEstimasi: string;
  createdAt: string;
  lastScrapedAt: string;
}

/**
 * Export alumni data to CSV
 */
export async function exportToCSV(options: ExportOptions): Promise<string> {
  const { filters = {}, outputPath } = options;
  
  logger.info('Starting CSV export...', filters);

  // Ensure output directory exists
  const outputDir = path.resolve(process.cwd(), 'data', 'exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = outputPath || `alumni-upn-${timestamp}.csv`;
  const filepath = path.join(outputDir, filename);

  // Query data
  const alumni = await prisma.alumni.findMany({
    where: buildWhereClause(filters),
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
  });

  logger.info(`Exporting ${alumni.length} alumni records...`);

  // Flatten data for CSV
  const records: FlattenedAlumni[] = alumni.map(a => {
    const currentJob = a.pekerjaan.find(p => p.isCurrent);
    
    return {
      id: a.id,
      namaLengkap: a.namaLengkap,
      angkatan: a.angkatan ?? '',
      tahunLulus: a.tahunLulus ?? '',
      ipk: a.ipk ?? '',
      linkedInUrl: a.linkedInUrl,
      fotoProfil: a.fotoProfil ?? '',
      spesialisasi: a.spesialisasi ?? '',
      pekerjaanSaatIni: currentJob ? `${currentJob.posisi} at ${currentJob.perusahaan}` : '',
      perusahaanSaatIni: currentJob?.perusahaan ?? '',
      riwayatPekerjaan: a.pekerjaan
        .map(p => `${p.posisi} at ${p.perusahaan} (${formatDate(p.tanggalMulai)} - ${p.tanggalSelesai ? formatDate(p.tanggalSelesai) : 'Present'})`)
        .join('; '),
      techStack: a.techStacks.map(ts => `${ts.techStack.nama}${ts.level ? ` (${ts.level})` : ''}`).join(', '),
      gajiEstimasi: '', // TODO: Implement salary estimation
      createdAt: a.createdAt.toISOString(),
      lastScrapedAt: a.lastScrapedAt?.toISOString() ?? '',
    };
  });

  // Create CSV writer
  const csvWriter = createObjectCsvWriter({
    path: filepath,
    header: [
      { id: 'id', title: 'ID' },
      { id: 'namaLengkap', title: 'Nama Lengkap' },
      { id: 'angkatan', title: 'Angkatan' },
      { id: 'tahunLulus', title: 'Tahun Lulus' },
      { id: 'ipk', title: 'IPK' },
      { id: 'linkedInUrl', title: 'LinkedIn URL' },
      { id: 'fotoProfil', title: 'Foto Profil' },
      { id: 'spesialisasi', title: 'Spesialisasi' },
      { id: 'pekerjaanSaatIni', title: 'Pekerjaan Saat Ini' },
      { id: 'perusahaanSaatIni', title: 'Perusahaan Saat Ini' },
      { id: 'riwayatPekerjaan', title: 'Riwayat Pekerjaan' },
      { id: 'techStack', title: 'Tech Stack' },
      { id: 'gajiEstimasi', title: 'Estimasi Gaji' },
      { id: 'createdAt', title: 'Dibuat Pada' },
      { id: 'lastScrapedAt', title: 'Terakhir Diupdate' },
    ],
    encoding: 'utf8',
    append: false,
  });

  // Write records with UTF-8 BOM for proper encoding
  const BOM = '\uFEFF';
  const csvContent = await generateCsvContent(csvWriter, records);
  fs.writeFileSync(filepath, BOM + csvContent, { encoding: 'utf8' });

  logger.info(`CSV export complete: ${filepath}`);
  return filepath;
}

/**
 * Build Prisma where clause from filters
 */
function buildWhereClause(filters: ExportFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.angkatanMin !== undefined || filters.angkatanMax !== undefined) {
    where.angkatan = {
      gte: filters.angkatanMin,
      lte: filters.angkatanMax,
    };
  }

  if (filters.spesialisasi && filters.spesialisasi.length > 0) {
    where.spesialisasi = {
      in: filters.spesialisasi,
    };
  }

  if (filters.hasIPK) {
    where.ipk = {
      not: null,
    };
  }

  return where;
}

/**
 * Format date for display
 */
function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

/**
 * Generate CSV content (helper function)
 */
async function generateCsvContent(
  csvWriter: any,
  records: FlattenedAlumni[]
): Promise<string> {
  // This is a workaround since csv-writer doesn't expose raw content
  // We'll write to temp file and read it
  await csvWriter.writeRecords(records);
  return fs.readFileSync(csvWriter.path, 'utf8');
}
