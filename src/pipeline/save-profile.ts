/**
 * Data Persistence Pipeline
 * 
 * Pipeline for saving extracted LinkedIn profile data to the database
 * with transaction safety, upsert logic, and conflict resolution.
 * 
 * Features:
 * - Transaction-safe profile saving
 * - Duplicate detection and merging
 * - Data validation
 * - Scraping log integration
 * - Batch operations for performance
 * 
 * @module pipeline/save-profile
 */

import { getPrismaClient } from '@/database/client';
import * as alumniRepo from '@/database/repositories/alumni.repository';
import * as pekerjaanRepo from '@/database/repositories/pekerjaan.repository';
import * as techStackRepo from '@/database/repositories/techStack.repository';
import * as scrapingLogRepo from '@/database/repositories/scrapingLog.repository';
import { logger } from '@/utils/logger';
import { ErrorType, SpesialisasiRole, ScrapingStatus } from '@/types/enums';
import type { PrismaClient } from '@prisma/client';
import type { 
  AlumniData, 
  Pekerjaan, 
  TechStack
} from '@/types';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Result of saving a profile
 */
export interface SaveResult {
  /** Whether save was successful */
  success: boolean;
  /** Alumni ID (existing or new) */
  alumniId?: string;
  /** Operation performed */
  operation: 'created' | 'updated' | 'merged' | 'skipped';
  /** Error message if failed */
  error?: string;
  /** Scraping log ID */
  logId?: string;
  /** Number of work entries saved */
  pekerjaanCount?: number;
  /** Number of tech stacks saved */
  techStackCount?: number;
}

/**
 * Extracted profile data ready for saving
 */
export interface ExtractedProfileData {
  /** Basic alumni info */
  alumni: {
    namaLengkap: string;
    linkedInUrl: string;
    angkatan?: number;
    tahunLulus?: number;
    ipk?: number;
    fotoProfil?: string;
    spesialisasi?: SpesialisasiRole;
  };
  /** Work experience entries */
  pekerjaan: Array<{
    posisi: string;
    perusahaan: string;
    isCurrent: boolean;
    tanggalMulai: Date;
    tanggalSelesai?: Date;
    lokasi?: string;
  }>;
  /** Tech stack entries */
  techStacks: Array<{
    nama: string;
    kategori: string;
    level?: string;
  }>;
  /** Scraping metadata */
  metadata: {
    sourceUrl: string;
    scrapedAt: Date;
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Normalized/validated data */
  normalizedData?: Partial<ExtractedProfileData>;
}

/**
 * Duplicate detection result
 */
export interface DuplicateCheckResult {
  /** Whether a duplicate was found */
  isDuplicate: boolean;
  /** Existing alumni ID if found */
  existingId?: string;
  /** Match type */
  matchType: 'linkedin_url' | 'name_similarity' | 'none';
  /** Similarity score for name match (0-1) */
  similarityScore?: number;
  /** Existing alumni basic data */
  existingData?: { id: string; namaLengkap: string; linkedInUrl: string } | null;
}

/**
 * Save configuration
 */
export interface SaveConfig {
  /** Whether to skip on validation error */
  skipOnValidationError: boolean;
  /** Whether to merge with existing data */
  mergeWithExisting: boolean;
  /** Minimum name similarity for duplicate detection */
  nameSimilarityThreshold: number;
  /** Whether to create scraping log entries */
  createScrapingLog: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SaveConfig = {
  skipOnValidationError: false,
  mergeWithExisting: true,
  nameSimilarityThreshold: 0.85,
  createScrapingLog: true,
};

// ============================================================================
// Main Save Pipeline
// ============================================================================

/**
 * Save extracted profile data to database
 * 
 * @param extractedData - Extracted profile data
 * @param config - Save configuration
 * @returns Save result
 */
export async function saveProfile(
  extractedData: ExtractedProfileData,
  config?: Partial<SaveConfig>
): Promise<SaveResult> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const prisma = getPrismaClient();
  
  logger.info(`Saving profile for: ${extractedData.alumni.namaLengkap}`);
  
  let scrapingLogId: string | undefined;
  
  try {
    // Step 1: Validate data
    const validation = validateAlumniData(extractedData);
    if (!validation.valid) {
      logger.error('Data validation failed:', validation.errors);
      
      if (opts.skipOnValidationError) {
        return {
          success: false,
          operation: 'skipped',
          error: `Validation failed: ${validation.errors.join(', ')}`,
        };
      }
      
      // Continue with warnings
      logger.warn('Continuing despite validation errors');
    }
    
    // Step 2: Create scraping log entry
    if (opts.createScrapingLog) {
      const log = await scrapingLogRepo.createScrapingLog({
        url: extractedData.metadata.sourceUrl,
        status: ScrapingStatus.IN_PROGRESS,
      });
      scrapingLogId = log.id;
    }
    
    // Step 3: Check for duplicates
    const duplicateCheck = await checkForDuplicates(extractedData, opts);
    
    // Step 4: Execute transaction
    const result = await prisma.$transaction(async (tx: PrismaClient) => {
      let alumniId: string;
      let operation: SaveResult['operation'];
      
      if (duplicateCheck.isDuplicate && duplicateCheck.existingId) {
        // Handle existing record
        if (opts.mergeWithExisting) {
          // Merge data
          alumniId = await mergeAlumniData(
            duplicateCheck.existingId,
            extractedData,
            tx
          );
          operation = 'merged';
        } else {
          // Update existing
          alumniId = await updateExistingAlumni(
            duplicateCheck.existingId,
            extractedData,
            tx
          );
          operation = 'updated';
        }
      } else {
        // Create new record
        alumniId = await createNewAlumni(extractedData, tx);
        operation = 'created';
      }
      
      // Sync work experience
      const pekerjaanCount = await syncPekerjaan(alumniId, extractedData.pekerjaan, tx);
      
      // Sync tech stacks
      const techStackCount = await syncTechStacks(alumniId, extractedData.techStacks, tx);
      
      return {
        alumniId,
        operation,
        pekerjaanCount,
        techStackCount,
      };
    }, {
      maxWait: 5000,
      timeout: 10000,
    });
    
    // Step 5: Update scraping log
    if (scrapingLogId) {
      await scrapingLogRepo.updateScrapingLog(scrapingLogId, {
        status: ScrapingStatus.SUCCESS,
      });
    }
    
    logger.info(`Profile saved successfully: ${result.operation} (ID: ${result.alumniId})`);
    
    return {
      success: true,
      alumniId: result.alumniId,
      operation: result.operation,
      logId: scrapingLogId,
      pekerjaanCount: result.pekerjaanCount,
      techStackCount: result.techStackCount,
    };
    
  } catch (error) {
    logger.error('Failed to save profile:', error);
    
    // Update scraping log with error
    if (scrapingLogId) {
      await scrapingLogRepo.updateScrapingLog(scrapingLogId, {
        status: ScrapingStatus.FAILED,
        errorMessage: (error as Error).message,
      });
    }
    
    return {
      success: false,
      operation: 'skipped',
      error: (error as Error).message,
      logId: scrapingLogId,
    };
  }
}

// ============================================================================
// Data Validation
// ============================================================================

/**
 * Validate alumni data before saving
 * 
 * @param data - Data to validate
 * @returns Validation result
 */
export function validateAlumniData(data: ExtractedProfileData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check required fields
  if (!data.alumni.namaLengkap || data.alumni.namaLengkap.trim().length === 0) {
    errors.push('Nama lengkap is required');
  }
  
  if (!data.alumni.linkedInUrl || data.alumni.linkedInUrl.trim().length === 0) {
    errors.push('LinkedIn URL is required');
  }
  
  // Check angkatan or tahunLulus
  if (!data.alumni.angkatan && !data.alumni.tahunLulus) {
    errors.push('Either angkatan or tahunLulus is required');
  }
  
  // Validate angkatan range
  if (data.alumni.angkatan !== undefined) {
    if (data.alumni.angkatan < 2004 || data.alumni.angkatan > 2026) {
      errors.push(`Angkatan ${data.alumni.angkatan} is outside valid range (2004-2026)`);
    }
  }
  
  // Validate tahunLulus range
  if (data.alumni.tahunLulus !== undefined) {
    if (data.alumni.tahunLulus < 2004 || data.alumni.tahunLulus > 2030) {
      errors.push(`Tahun lulus ${data.alumni.tahunLulus} is outside valid range (2004-2030)`);
    }
  }
  
  // Validate IPK
  if (data.alumni.ipk !== undefined) {
    // Scale 4.0
    if (data.alumni.ipk >= 0 && data.alumni.ipk <= 4) {
      // Valid
    } else if (data.alumni.ipk > 4 && data.alumni.ipk <= 100) {
      // Assume percentage, convert to 4.0 scale
      warnings.push(`IPK ${data.alumni.ipk} appears to be percentage, should convert to 4.0 scale`);
    } else {
      errors.push(`IPK ${data.alumni.ipk} is outside valid range (0-4 or 0-100)`);
    }
  }
  
  // Validate LinkedIn URL format
  if (data.alumni.linkedInUrl && !isValidLinkedInUrl(data.alumni.linkedInUrl)) {
    warnings.push('LinkedIn URL format may be invalid');
  }
  
  // Check for empty arrays
  if (data.pekerjaan.length === 0) {
    warnings.push('No work experience entries found');
  }
  
  if (data.techStacks.length === 0) {
    warnings.push('No tech stack entries found');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if LinkedIn URL is valid format
 */
function isValidLinkedInUrl(url: string): boolean {
  const linkedInPattern = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/;
  return linkedInPattern.test(url);
}

// ============================================================================
// Duplicate Detection
// ============================================================================

/**
 * Check for duplicate alumni records
 * 
 * @param data - Data to check
 * @param config - Save configuration
 * @returns Duplicate check result
 */
export async function checkForDuplicates(
  data: ExtractedProfileData,
  config: SaveConfig
): Promise<DuplicateCheckResult> {
  // Check by LinkedIn URL (exact match)
  const existingByUrl = await alumniRepo.findByLinkedInUrl(data.alumni.linkedInUrl);
  if (existingByUrl) {
    logger.info(`Duplicate found by LinkedIn URL: ${data.alumni.linkedInUrl}`);
    return {
      isDuplicate: true,
      existingId: existingByUrl.id,
      matchType: 'linkedin_url',
      existingData: existingByUrl,
    };
  }
  
  // Check by name similarity
  // This would require a search function in the repository
  // For now, we'll do a simplified check
  const existingByName = await findByNameSimilarity(
    data.alumni.namaLengkap,
    config.nameSimilarityThreshold
  );
  
  if (existingByName) {
    const similarity = calculateNameSimilarity(
      data.alumni.namaLengkap,
      existingByName.namaLengkap
    );
    
    logger.info(`Duplicate found by name similarity: ${similarity.toFixed(2)}`);
    return {
      isDuplicate: true,
      existingId: existingByName.id,
      matchType: 'name_similarity',
      similarityScore: similarity,
      existingData: existingByName,
    };
  }
  
  return {
    isDuplicate: false,
    matchType: 'none',
  };
}

/**
 * Find alumni by name similarity
 * Simplified implementation - would be better with full-text search
 */
async function findByNameSimilarity(
  name: string,
  threshold: number
): Promise<{ id: string; namaLengkap: string; linkedInUrl: string } | null> {
  // Get all alumni (this is inefficient for large datasets)
  // In production, use full-text search or database similarity functions
  const allAlumni = await alumniRepo.getAll({ take: 1000 });
  
  for (const alumni of allAlumni) {
    const similarity = calculateNameSimilarity(name, alumni.namaLengkap);
    if (similarity >= threshold) {
      return {
        id: alumni.id,
        namaLengkap: alumni.namaLengkap,
        linkedInUrl: alumni.linkedInUrl,
      };
    }
  }
  
  return null;
}

/**
 * Calculate name similarity using Levenshtein distance
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);
  
  if (normalized1 === normalized2) return 1.0;
  
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  
  return 1 - distance / maxLength;
}

/**
 * Normalize name for comparison
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Calculate Levenshtein distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return matrix[str1.length][str2.length];
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Create new alumni record
 */
async function createNewAlumni(
  data: ExtractedProfileData,
  tx: PrismaClient
): Promise<string> {
  const alumni = await tx.alumni.create({
    data: {
      namaLengkap: data.alumni.namaLengkap,
      linkedInUrl: data.alumni.linkedInUrl,
      angkatan: data.alumni.angkatan,
      tahunLulus: data.alumni.tahunLulus,
      ipk: data.alumni.ipk,
      fotoProfil: data.alumni.fotoProfil,
      spesialisasi: data.alumni.spesialisasi,
      lastScrapedAt: new Date(),
    },
  });
  
  return alumni.id;
}

/**
 * Update existing alumni record
 */
async function updateExistingAlumni(
  existingId: string,
  data: ExtractedProfileData,
  tx: PrismaClient
): Promise<string> {
  const alumni = await tx.alumni.update({
    where: { id: existingId },
    data: {
      namaLengkap: data.alumni.namaLengkap,
      linkedInUrl: data.alumni.linkedInUrl,
      angkatan: data.alumni.angkatan ?? undefined,
      tahunLulus: data.alumni.tahunLulus ?? undefined,
      ipk: data.alumni.ipk ?? undefined,
      fotoProfil: data.alumni.fotoProfil ?? undefined,
      spesialisasi: data.alumni.spesialisasi ?? undefined,
      lastScrapedAt: new Date(),
    },
  });
  
  return alumni.id;
}

/**
 * Merge new data with existing record
 * Keeps most complete/recent data
 */
async function mergeAlumniData(
  existingId: string,
  newData: ExtractedProfileData,
  tx: PrismaClient
): Promise<string> {
  // Get existing data
  const existing = await tx.alumni.findUnique({
    where: { id: existingId },
  });
  
  if (!existing) {
    throw new Error(`Existing alumni not found: ${existingId}`);
  }
  
  // Merge logic: prefer new data for most fields, but keep existing if new is empty
  const merged = {
    namaLengkap: newData.alumni.namaLengkap || existing.namaLengkap,
    linkedInUrl: newData.alumni.linkedInUrl || existing.linkedInUrl,
    angkatan: newData.alumni.angkatan ?? existing.angkatan,
    tahunLulus: newData.alumni.tahunLulus ?? existing.tahunLulus,
    ipk: newData.alumni.ipk ?? existing.ipk,
    fotoProfil: newData.alumni.fotoProfil || existing.fotoProfil,
    spesialisasi: newData.alumni.spesialisasi || existing.spesialisasi,
    lastScrapedAt: new Date(),
  };
  
  const alumni = await tx.alumni.update({
    where: { id: existingId },
    data: merged,
  });
  
  return alumni.id;
}

/**
 * Sync work experience entries
 * Deletes old entries and inserts new ones
 */
async function syncPekerjaan(
  alumniId: string,
  pekerjaanList: ExtractedProfileData['pekerjaan'],
  tx: PrismaClient
): Promise<number> {
  // Delete existing entries
  await tx.pekerjaan.deleteMany({
    where: { alumniId },
  });
  
  // Insert new entries in batch
  if (pekerjaanList.length === 0) {
    return 0;
  }
  
  await tx.pekerjaan.createMany({
    data: pekerjaanList.map(p => ({
      alumniId,
      posisi: p.posisi,
      perusahaan: p.perusahaan,
      isCurrent: p.isCurrent,
      tanggalMulai: p.tanggalMulai,
      tanggalSelesai: p.tanggalSelesai,
      lokasi: p.lokasi,
    })),
  });
  
  return pekerjaanList.length;
}

/**
 * Sync tech stack entries
 * Upserts tech stacks and creates junction records
 */
async function syncTechStacks(
  alumniId: string,
  techStacks: ExtractedProfileData['techStacks'],
  tx: PrismaClient
): Promise<number> {
  // Delete existing junction records
  await tx.alumniTechStack.deleteMany({
    where: { alumniId },
  });
  
  if (techStacks.length === 0) {
    return 0;
  }
  
  let count = 0;
  
  for (const tech of techStacks) {
    // Upsert tech stack
    const techStackRecord = await tx.techStack.upsert({
      where: { nama: tech.nama },
      create: {
        nama: tech.nama,
        kategori: tech.kategori,
      },
      update: {
        kategori: tech.kategori,
      },
    });
    
    // Create junction record
    await tx.alumniTechStack.create({
      data: {
        alumniId,
        techStackId: techStackRecord.id,
        level: tech.level,
      },
    });
    
    count++;
  }
  
  return count;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Save multiple profiles in batch
 * 
 * @param profiles - Array of extracted profiles
 * @param config - Save configuration
 * @returns Array of save results
 */
export async function saveProfilesBatch(
  profiles: ExtractedProfileData[],
  config?: Partial<SaveConfig>
): Promise<SaveResult[]> {
  logger.info(`Starting batch save of ${profiles.length} profiles`);
  
  const results: SaveResult[] = [];
  
  for (const profile of profiles) {
    const result = await saveProfile(profile, config);
    results.push(result);
    
    // Small delay between saves to avoid overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  const successCount = results.filter(r => r.success).length;
  logger.info(`Batch save complete: ${successCount}/${profiles.length} successful`);
  
  return results;
}

// ============================================================================
// Export
// ============================================================================

// Types and functions are exported via 'export' declarations above
