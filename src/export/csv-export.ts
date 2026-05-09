/**
 * CSV Export Handler
 * 
 * Export alumni data to CSV format with configurable filters
 */

import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { getPrismaClient } from '@/database/client';
import { logger } from '@/utils/logger';
import type { SpesialisasiRole } from '@/types/enums';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Export filters
 */
export interface ExportFilters {
  /** Minimum angkatan year */
  angkatanMin?: number;
  /** Maximum angkatan year */
  angkatanMax?: number;
  /** Filter by specializations */
  spesialisasi?: SpesialisasiRole[];
  /** Filter by tech stack skills */
  techStack?: string[];
  /** Filter by current company */
  currentCompany?: string;
  /** Only include alumni with IPK */
  hasIPK?: boolean;
  /** Search by name */
  namaLengkap?: string;
}

/**
 * Export options
 */
export interface ExportOptions {
  /** Filters to apply */
  filters?: ExportFilters;
  /** Custom output path */
  outputPath?: string;
  /** Use streaming for large datasets */
  streaming?: boolean;
  /** Batch size for streaming */
  batchSize?: number;
}

/**
 * Export result
 */
export interface ExportResult {
  /** Output file path */
  filePath: string;
  /** Number of records exported */
  recordCount: number;
  /** Export timestamp */
  timestamp: Date;
  /** Applied filters */
  filters: ExportFilters;
}

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
export async function exportToCSV(options: ExportOptions = {}): Promise<ExportResult> {
  const { filters = {}, outputPath, streaming = false, batchSize = 100 } = options;
  
  if (streaming) {
    return exportToCSVStreaming(options, batchSize);
  }
  
  logger.info('Starting CSV export...', { filters, streaming });

  // Ensure output directory exists
  const outputDir = path.resolve(process.cwd(), 'data', 'exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = outputPath || `alumni-upn-${timestamp}.csv`;
  const filepath = path.join(outputDir, filename);

  // Build query
  const { query } = buildExportQuery(filters);
  
  // Query data
  const alumni = await prisma.alumni.findMany({
    where: query,
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
  const records: FlattenedAlumni[] = alumni.map((a: typeof alumni[0]) => {
    const currentJob = a.pekerjaan.find((p: typeof a.pekerjaan[0]) => p.isCurrent);
    
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
        .map((p: typeof a.pekerjaan[0]) => `${p.posisi} at ${p.perusahaan} (${formatDate(p.tanggalMulai)} - ${p.tanggalSelesai ? formatDate(p.tanggalSelesai) : 'Present'})`)
        .join('; '),
      techStack: a.techStacks.map((ts: typeof a.techStacks[0]) => `${ts.techStack.nama}${ts.level ? ` (${ts.level})` : ''}`).join(', '),
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
  const csvContent = await generateCsvContent(csvWriter, records, filepath);
  fs.writeFileSync(filepath, BOM + csvContent, { encoding: 'utf8' });

  logger.info(`CSV export complete: ${filepath} (${alumni.length} records)`);
  
  return {
    filePath: filepath,
    recordCount: alumni.length,
    timestamp: new Date(),
    filters: filters || {},
  };
}

/**
 * Build Prisma query from export filters
 */
export function buildExportQuery(filters: ExportFilters): { query: Record<string, unknown>; params: Record<string, unknown> } {
  const query: Record<string, unknown> = {};
  const params: Record<string, unknown> = {};

  // Angkatan range filter
  if (filters.angkatanMin !== undefined || filters.angkatanMax !== undefined) {
    query.angkatan = {};
    if (filters.angkatanMin !== undefined) {
      (query.angkatan as Record<string, unknown>).gte = filters.angkatanMin;
    }
    if (filters.angkatanMax !== undefined) {
      (query.angkatan as Record<string, unknown>).lte = filters.angkatanMax;
    }
  }

  // Specialization filter
  if (filters.spesialisasi && filters.spesialisasi.length > 0) {
    query.spesialisasi = {
      in: filters.spesialisasi,
    };
  }

  // Has IPK filter
  if (filters.hasIPK) {
    query.ipk = {
      not: null,
    };
  }

  // Name search filter
  if (filters.namaLengkap) {
    query.namaLengkap = {
      contains: filters.namaLengkap,
      mode: 'insensitive',
    };
  }

  // Store additional params for post-filtering
  params.techStack = filters.techStack;
  params.currentCompany = filters.currentCompany;

  return { query, params };
}

// Alias for backward compatibility
const buildWhereClause = buildExportQuery;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  csvWriter: { writeRecords: (records: FlattenedAlumni[]) => Promise<void> },
  records: FlattenedAlumni[],
  filepath: string
): Promise<string> {
  // This is a workaround since csv-writer doesn't expose raw content
  // We'll write to temp file and read it
  await csvWriter.writeRecords(records);
  return fs.readFileSync(filepath, 'utf8');
}

// ============================================================================
// Streaming Export (for large datasets)
// ============================================================================

/**
 * Export large dataset to CSV using streaming
 * 
 * @param options - Export options
 * @param batchSize - Number of records per batch
 * @returns Export result
 */
export async function exportToCSVStreaming(
  options: ExportOptions = {},
  batchSize: number = 100
): Promise<ExportResult> {
  const { filters = {}, outputPath } = options;
  
  logger.info('Starting streaming CSV export...', filters);

  // Ensure output directory exists
  const outputDir = path.resolve(process.cwd(), 'data', 'exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = outputPath || `alumni-upn-${timestamp}.csv`;
  const filepath = path.join(outputDir, filename);

  const prisma = getPrismaClient();

  // Build query
  const { query } = buildExportQuery(filters);

  // Create write stream with UTF-8 BOM
  const writeStream = fs.createWriteStream(filepath, { encoding: 'utf8' });
  writeStream.write('\uFEFF'); // UTF-8 BOM

  // Write headers
  const headers = [
    'ID', 'Nama Lengkap', 'Angkatan', 'Tahun Lulus', 'IPK',
    'LinkedIn URL', 'Foto Profil', 'Spesialisasi',
    'Pekerjaan Saat Ini', 'Perusahaan Saat Ini',
    'Riwayat Pekerjaan', 'Tech Stack', 'Estimasi Gaji',
    'Dibuat Pada', 'Terakhir Diupdate'
  ].join(',');
  writeStream.write(headers + '\n');

  // Stream records in batches
  let skip = 0;
  let totalCount = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await prisma.alumni.findMany({
      where: query,
      include: {
        pekerjaan: true,
        techStacks: {
          include: {
            techStack: true,
          },
        },
      },
      skip,
      take: batchSize,
      orderBy: { angkatan: 'desc' },
    });

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    // Process and write batch
    for (const alumni of batch) {
      const record = flattenAlumniForCSV(alumni);
      const csvLine = Object.values(record)
        .map(value => escapeCSV(String(value)))
        .join(',');
      writeStream.write(csvLine + '\n');
    }

    totalCount += batch.length;
    skip += batchSize;

    logger.debug(`Exported ${totalCount} records...`);
  }

  // Close stream
  writeStream.end();
  
  // Wait for stream to finish
  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  logger.info(`Streaming CSV export complete: ${filepath} (${totalCount} records)`);

  return {
    filePath: filepath,
    recordCount: totalCount,
    timestamp: new Date(),
    filters: filters || {},
  };
}

/**
 * Flatten alumni data for CSV
 */
function flattenAlumniForCSV(alumni: {
  id: string;
  namaLengkap: string;
  angkatan: number | null;
  tahunLulus: number | null;
  ipk: number | null;
  linkedInUrl: string;
  fotoProfil: string | null;
  spesialisasi: string | null;
  pekerjaan: Array<{
    posisi: string;
    perusahaan: string;
    isCurrent: boolean;
    tanggalMulai: Date;
    tanggalSelesai: Date | null;
  }>;
  techStacks: Array<{
    techStack: {
      nama: string;
      kategori: string;
    };
    level: string | null;
  }>;
  createdAt: Date;
  lastScrapedAt: Date | null;
}): FlattenedAlumni {
  const currentJob = alumni.pekerjaan.find(p => p.isCurrent);

  return {
    id: alumni.id,
    namaLengkap: alumni.namaLengkap,
    angkatan: alumni.angkatan ?? '',
    tahunLulus: alumni.tahunLulus ?? '',
    ipk: alumni.ipk ?? '',
    linkedInUrl: alumni.linkedInUrl,
    fotoProfil: alumni.fotoProfil ?? '',
    spesialisasi: alumni.spesialisasi ?? '',
    pekerjaanSaatIni: currentJob 
      ? `${currentJob.posisi} at ${currentJob.perusahaan}` 
      : '',
    perusahaanSaatIni: currentJob?.perusahaan ?? '',
    riwayatPekerjaan: alumni.pekerjaan
      .map(p => `${p.posisi} at ${p.perusahaan} (${formatDate(p.tanggalMulai)} - ${p.tanggalSelesai ? formatDate(p.tanggalSelesai) : 'Present'})`)
      .join('; '),
    techStack: alumni.techStacks
      .map(ts => `${ts.techStack.nama}${ts.level ? ` (${ts.level})` : ''}`)
      .join(', '),
    gajiEstimasi: '', // TODO: Implement salary estimation
    createdAt: alumni.createdAt.toISOString(),
    lastScrapedAt: alumni.lastScrapedAt?.toISOString() ?? '',
  };
}

/**
 * Escape CSV field value
 */
function escapeCSV(value: string): string {
  // If value contains comma, quote, or newline, wrap in quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    // Double up quotes
    value = value.replace(/"/g, '""');
    return `"${value}"`;
  }
  return value;
}
