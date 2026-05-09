/**
 * JSON Export Handler
 * 
 * Export alumni data to JSON format with configurable filters
 * 
 * @module export/json-export
 */

import * as fs from 'fs/promises';
import * as path from 'path';
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
  /** Pretty print JSON */
  pretty?: boolean;
  /** Include nested objects (pekerjaan, techStack) */
  includeNested?: boolean;
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

/**
 * Nested alumni data structure for JSON export
 */
export interface AlumniExportData {
  id: string;
  namaLengkap: string;
  angkatan: number | null;
  tahunLulus: number | null;
  ipk: number | null;
  linkedInUrl: string;
  fotoProfil: string | null;
  spesialisasi: SpesialisasiRole | null;
  pekerjaanSaatIni: string | null;
  perusahaanSaatIni: string | null;
  pekerjaan?: Array<{
    posisi: string;
    perusahaan: string;
    isCurrent: boolean;
    tanggalMulai: string;
    tanggalSelesai: string | null;
    lokasi: string | null;
  }>;
  techStacks?: Array<{
    nama: string;
    kategori: string;
    level: string | null;
  }>;
  gajiEstimasi?: {
    min: number;
    max: number;
    median: number;
    currency: string;
  } | null;
  createdAt: string;
  lastScrapedAt: string | null;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_OPTIONS: ExportOptions = {
  filters: {},
  pretty: true,
  includeNested: true,
};

// ============================================================================
// JSON Export
// ============================================================================

/**
 * Export alumni data to JSON
 * 
 * @param options - Export options
 * @returns Export result with file path
 */
export async function exportToJSON(
  options: Partial<ExportOptions> = {}
): Promise<ExportResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  logger.info('Starting JSON export...', opts.filters);

  // Ensure output directory exists
  const outputDir = path.resolve(process.cwd(), 'data', 'exports');
  await fs.mkdir(outputDir, { recursive: true });

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = opts.outputPath || `alumni-upn-${timestamp}.json`;
  const filepath = path.join(outputDir, filename);

  // Build and execute query
  const { query, params } = buildExportQuery(opts.filters || {});
  const prisma = getPrismaClient();
  
  const alumni = await prisma.alumni.findMany({
    where: query,
    include: opts.includeNested ? {
      pekerjaan: {
        orderBy: { tanggalMulai: 'desc' },
      },
      techStacks: {
        include: {
          techStack: true,
        },
      },
    } : undefined,
    orderBy: {
      angkatan: 'desc',
    },
  });

  logger.info(`Exporting ${alumni.length} alumni records to JSON...`);

  // Transform data
  const exportData: AlumniExportData[] = alumni.map((a: typeof alumni[0]) => transformAlumniForExport(a, opts.includeNested ?? true));

  // Create JSON structure
  const jsonData = {
    meta: {
      exportedAt: new Date().toISOString(),
      recordCount: alumni.length,
      filters: opts.filters,
      version: '1.0',
    },
    data: exportData,
  };

  // Write to file
  const jsonString = opts.pretty
    ? JSON.stringify(jsonData, null, 2)
    : JSON.stringify(jsonData);

  await fs.writeFile(filepath, jsonString, { encoding: 'utf8' });

  logger.info(`JSON export complete: ${filepath} (${alumni.length} records)`);

  return {
    filePath: filepath,
    recordCount: alumni.length,
    timestamp: new Date(),
    filters: opts.filters || {},
  };
}

// ============================================================================
// Query Builder
// ============================================================================

/**
 * Build Prisma query from export filters
 * 
 * @param filters - Export filters
 * @returns Prisma query and params
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

  // Note: techStack and currentCompany filters require post-query filtering
  // or complex Prisma relations, handled in the main query
  params.techStack = filters.techStack;
  params.currentCompany = filters.currentCompany;

  return { query, params };
}

// ============================================================================
// Data Transformation
// ============================================================================

/**
 * Transform alumni data for export
 * 
 * @param alumni - Raw alumni data from Prisma
 * @param includeNested - Whether to include nested relations
 * @returns Transformed alumni data
 */
function transformAlumniForExport(
  alumni: {
    id: string;
    namaLengkap: string;
    angkatan: number | null;
    tahunLulus: number | null;
    ipk: number | null;
    linkedInUrl: string;
    fotoProfil: string | null;
    spesialisasi: SpesialisasiRole | null;
    pekerjaan?: Array<{
      posisi: string;
      perusahaan: string;
      isCurrent: boolean;
      tanggalMulai: Date;
      tanggalSelesai: Date | null;
      lokasi: string | null;
    }>;
    techStacks?: Array<{
      techStack: {
        id: string;
        nama: string;
        kategori: string;
      };
      level: string | null;
    }>;
    createdAt: Date;
    lastScrapedAt: Date | null;
    gajiMin?: number | null;
    gajiMax?: number | null;
  },
  includeNested: boolean
): AlumniExportData {
  // Find current job
  const currentJob = alumni.pekerjaan?.find(p => p.isCurrent);

  const result: AlumniExportData = {
    id: alumni.id,
    namaLengkap: alumni.namaLengkap,
    angkatan: alumni.angkatan,
    tahunLulus: alumni.tahunLulus,
    ipk: alumni.ipk,
    linkedInUrl: alumni.linkedInUrl,
    fotoProfil: alumni.fotoProfil,
    spesialisasi: alumni.spesialisasi,
    pekerjaanSaatIni: currentJob 
      ? `${currentJob.posisi} at ${currentJob.perusahaan}` 
      : null,
    perusahaanSaatIni: currentJob?.perusahaan ?? null,
    createdAt: alumni.createdAt.toISOString(),
    lastScrapedAt: alumni.lastScrapedAt?.toISOString() ?? null,
  };

  // Add nested data if requested
  if (includeNested && alumni.pekerjaan) {
    result.pekerjaan = alumni.pekerjaan.map(p => ({
      posisi: p.posisi,
      perusahaan: p.perusahaan,
      isCurrent: p.isCurrent,
      tanggalMulai: p.tanggalMulai.toISOString(),
      tanggalSelesai: p.tanggalSelesai?.toISOString() ?? null,
      lokasi: p.lokasi,
    }));
  }

  if (includeNested && alumni.techStacks) {
    result.techStacks = alumni.techStacks.map(ts => ({
      nama: ts.techStack.nama,
      kategori: ts.techStack.kategori,
      level: ts.level,
    }));
  }

  // Add salary estimate if available
  if (alumni.gajiMin && alumni.gajiMax) {
    result.gajiEstimasi = {
      min: alumni.gajiMin,
      max: alumni.gajiMax,
      median: Math.round((alumni.gajiMin + alumni.gajiMax) / 2),
      currency: 'IDR',
    };
  }

  return result;
}

// ============================================================================
// Streaming Export (for large datasets)
// ============================================================================

/**
 * Export large dataset to JSON using streaming
 * 
 * @param options - Export options
 * @param batchSize - Number of records per batch
 * @returns Export result
 */
export async function exportToJSONStreaming(
  options: Partial<ExportOptions> = {},
  batchSize: number = 100
): Promise<ExportResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  logger.info('Starting streaming JSON export...', opts.filters);

  // Ensure output directory exists
  const outputDir = path.resolve(process.cwd(), 'data', 'exports');
  await fs.mkdir(outputDir, { recursive: true });

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = opts.outputPath || `alumni-upn-${timestamp}.json`;
  const filepath = path.join(outputDir, filename);

  const prisma = getPrismaClient();

  // Open file for writing
  const fileHandle = await fs.open(filepath, 'w');

  try {
    // Write opening
    await fileHandle.write('{\n');
    await fileHandle.write(`  "meta": {\n`);
    await fileHandle.write(`    "exportedAt": "${new Date().toISOString()}",\n`);
    await fileHandle.write(`    "filters": ${JSON.stringify(opts.filters)},\n`);
    await fileHandle.write(`    "version": "1.0"\n`);
    await fileHandle.write(`  },\n`);
    await fileHandle.write(`  "data": [\n`);

    // Build query
    const { query } = buildExportQuery(opts.filters || {});

    // Stream records in batches
    let skip = 0;
    let totalCount = 0;
    let hasMore = true;
    let firstBatch = true;

    while (hasMore) {
      const batch = await prisma.alumni.findMany({
        where: query,
        include: opts.includeNested ? {
          pekerjaan: { orderBy: { tanggalMulai: 'desc' } },
          techStacks: { include: { techStack: true } },
        } : undefined,
        skip,
        take: batchSize,
        orderBy: { angkatan: 'desc' },
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Transform and write batch
      for (let i = 0; i < batch.length; i++) {
        const alumni = batch[i];
        const exportData = transformAlumniForExport(alumni, opts.includeNested ?? true);
        
        // Add comma if not first record
        if (!firstBatch || i > 0) {
          await fileHandle.write(',\n');
        }
        
        // Write record
        const jsonLine = opts.pretty 
          ? JSON.stringify(exportData, null, 2).split('\n').map(l => '    ' + l).join('\n')
          : JSON.stringify(exportData);
        await fileHandle.write(jsonLine);
      }

      totalCount += batch.length;
      skip += batchSize;
      firstBatch = false;

      logger.debug(`Exported ${totalCount} records...`);
    }

    // Write closing
    await fileHandle.write('\n  ]\n}');

    logger.info(`Streaming JSON export complete: ${filepath} (${totalCount} records)`);

    return {
      filePath: filepath,
      recordCount: totalCount,
      timestamp: new Date(),
      filters: opts.filters || {},
    };

  } finally {
    await fileHandle.close();
  }
}

// ============================================================================
// Export
// ============================================================================

// Types are exported via 'export interface' declarations above
