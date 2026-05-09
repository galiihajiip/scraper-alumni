/**
 * Education History Extraction
 * 
 * Extracts education data from LinkedIn profiles to get angkatan,
 * graduation year, and IPK (GPA) information.
 * 
 * Features:
 * - Education section scraping with section expansion
 * - UPN identification with fuzzy matching
 * - IPK/GPA extraction with multiple format parsing
 * - Multiple degrees handling (S1, S2 prioritization)
 * - Missing data estimation and flagging
 * 
 * @module scraper/extraction/education
 */

import type { Page } from 'playwright';
import { logger } from '@/utils/logger';
import { randomDelay } from '@/scraper/rate-limiter';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Education entry extracted from LinkedIn
 */
export interface EducationEntry {
  /** School/University name */
  schoolName: string;
  /** Degree type (Bachelor, Master, etc.) */
  degree?: string;
  /** Field of study (Teknik Informatika, etc.) */
  fieldOfStudy?: string;
  /** Start year */
  startYear?: number;
  /** End year (graduation year) */
  endYear?: number;
  /** Grade/IPK/GPA */
  grade?: string;
  /** Description/activities */
  description?: string;
  /** Whether this is UPN */
  isUPN: boolean;
  /** Whether data was estimated */
  isEstimated: boolean;
  /** Estimation notes */
  estimationNotes?: string[];
}

/**
 * Parsed IPK/GPA result
 */
export interface ParsedIPK {
  /** Normalized GPA value (4.0 scale) */
  value: number;
  /** Original scale */
  originalScale: number;
  /** Whether value was estimated */
  isEstimated: boolean;
}

/**
 * Extracted education summary for alumni
 */
export interface EducationSummary {
  /** Primary UPN education entry (S1 Informatika preferred) */
  primaryUPN?: EducationEntry;
  /** All UPN entries */
  allUPN: EducationEntry[];
  /** All education entries */
  allEducation: EducationEntry[];
  /** Derived angkatan (from primary UPN entry) */
  angkatan?: number;
  /** Normalized IPK */
  ipk?: number;
  /** Graduation year */
  tahunLulus?: number;
}

/**
 * Extraction configuration
 */
export interface EducationExtractionConfig {
  /** Timeout for element selection */
  elementTimeout: number;
  /** Whether to expand education section */
  expandSection: boolean;
  /** Fuzzy match threshold for UPN detection (0-1) */
  upnMatchThreshold: number;
  /** Default degree duration in years */
  defaultDegreeDuration: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: EducationExtractionConfig = {
  elementTimeout: 5000,
  expandSection: true,
  upnMatchThreshold: 0.7,
  defaultDegreeDuration: 4,
};

// ============================================================================
// Selectors
// ============================================================================

const EDUCATION_SELECTORS = {
  // Section containers
  section: '.education-section, #education-section, .pv-education-section',
  sectionContainer: '.pv-profile-section, .core-section-container',
  
  // Show all button
  showAllButton: [
    '.education-section .pv-profile-section__see-all',
    '.education-section .artdeco-button:has-text("Show all")',
    '.education-section [data-testid="show-all-education"]',
    'button:has-text("Show all education")',
  ],
  
  // Individual education entries
  entry: [
    '.pv-education-entity',
    '.education__item',
    '[data-testid="education-item"]',
    '.core-section-container:has(.education) .artdeco-entity-lockup',
  ],
  
  // Entry fields
  schoolName: [
    '.pv-entity__school-name',
    '.education__school',
    '[data-testid="school-name"]',
    '.artdeco-entity-lockup__title',
    'h3',
  ],
  degree: [
    '.pv-entity__degree-name',
    '.education__degree',
    '[data-testid="degree-name"]',
    '.artdeco-entity-lockup__subtitle span:first-child',
  ],
  fieldOfStudy: [
    '.pv-entity__fos',
    '.education__field-of-study',
    '[data-testid="field-of-study"]',
    '.artdeco-entity-lockup__subtitle span:nth-child(2)',
  ],
  dateRange: [
    '.pv-entity__dates',
    '.education__date',
    '[data-testid="education-date"]',
    '.artdeco-entity-lockup__metadata',
  ],
  grade: [
    '.pv-entity__grade',
    '.education__grade',
    '[data-testid="education-grade"]',
    '.artdeco-entity-lockup__metadata span:contains("GPA")',
  ],
  description: [
    '.pv-entity__description',
    '.education__description',
    '[data-testid="education-description"]',
    '.inline-show-more-text',
  ],
};

// ============================================================================
// Core Extraction
// ============================================================================

/**
 * Extract education history from LinkedIn profile
 * 
 * @param page - Playwright page instance
 * @param config - Extraction configuration
 * @returns Array of education entries
 */
export async function extractEducation(
  page: Page,
  config?: Partial<EducationExtractionConfig>
): Promise<EducationEntry[]> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const entries: EducationEntry[] = [];
  
  logger.info('Extracting education history...');
  
  try {
    // Check if education section exists
    const sectionExists = await page.locator(EDUCATION_SELECTORS.section).count() > 0;
    if (!sectionExists) {
      logger.warn('Education section not found');
      return entries;
    }
    
    // Expand section if needed
    if (opts.expandSection) {
      await expandEducationSection(page);
    }
    
    // Get all education entries
    for (const entrySelector of EDUCATION_SELECTORS.entry) {
      const entryElements = await page.locator(entrySelector).all();
      
      for (const element of entryElements) {
        try {
          const entry = await extractEducationEntry(element, opts);
          if (entry) {
            entries.push(entry);
          }
        } catch (error) {
          logger.debug('Failed to extract education entry:', error);
          continue;
        }
      }
      
      // If we found entries with this selector, stop trying others
      if (entries.length > 0) break;
    }
    
    logger.info(`Extracted ${entries.length} education entries`);
    return entries;
    
  } catch (error) {
    logger.error('Failed to extract education:', error);
    return entries;
  }
}

/**
 * Extract single education entry
 */
async function extractEducationEntry(
  element: ReturnType<Page['locator']>,
  config: EducationExtractionConfig
): Promise<EducationEntry | null> {
  try {
    // Extract school name
    const schoolName = await extractField(element, EDUCATION_SELECTORS.schoolName);
    if (!schoolName) return null;
    
    // Extract degree
    const degree = await extractField(element, EDUCATION_SELECTORS.degree);
    
    // Extract field of study
    const fieldOfStudy = await extractField(element, EDUCATION_SELECTORS.fieldOfStudy);
    
    // Extract date range
    const dateRange = await extractField(element, EDUCATION_SELECTORS.dateRange);
    const { startYear, endYear } = parseDateRange(dateRange);
    
    // Extract grade
    const grade = await extractField(element, EDUCATION_SELECTORS.grade);
    
    // Extract description
    const description = await extractField(element, EDUCATION_SELECTORS.description);
    
    // Determine if UPN
    const isUPN = isUPNEducation(schoolName, config.upnMatchThreshold);
    
    // Build entry
    const entry: EducationEntry = {
      schoolName: cleanText(schoolName),
      degree: degree ? cleanText(degree) : undefined,
      fieldOfStudy: fieldOfStudy ? cleanText(fieldOfStudy) : undefined,
      startYear,
      endYear,
      grade: grade ? cleanText(grade) : undefined,
      description: description ? cleanText(description) : undefined,
      isUPN,
      isEstimated: false,
    };
    
    // Estimate missing data
    const estimatedEntry = estimateMissingData(entry, config);
    
    return estimatedEntry;
    
  } catch (error) {
    logger.debug('Error extracting education entry:', error);
    return null;
  }
}

/**
 * Extract field using multiple selectors
 */
async function extractField(
  element: ReturnType<Page['locator']>,
  selectors: string[]
): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const child = element.locator(selector).first();
      const visible = await child.isVisible().catch(() => false);
      
      if (visible) {
        const text = await child.textContent({ timeout: 1000 });
        if (text && text.trim()) {
          return text.trim();
        }
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

/**
 * Expand education section by clicking "Show all"
 */
async function expandEducationSection(page: Page): Promise<void> {
  for (const selector of EDUCATION_SELECTORS.showAllButton) {
    try {
      const button = page.locator(selector).first();
      const visible = await button.isVisible().catch(() => false);
      
      if (visible) {
        await button.click();
        await randomDelay(1000, 2000);
        logger.debug('Expanded education section');
        return;
      }
    } catch {
      continue;
    }
  }
}

// ============================================================================
// UPN Identification
// ============================================================================

/**
 * Check if education entry is from UPN using fuzzy matching
 * 
 * @param schoolName - School name to check
 * @param threshold - Similarity threshold (0-1)
 * @returns True if identified as UPN
 */
export function isUPNEducation(schoolName: string, threshold: number = 0.7): boolean {
  const normalized = schoolName.toLowerCase();
  
  // Direct keyword matching
  const upnKeywords = [
    'upn',
    'pembangunan nasional',
    'pembangunan',
    'veteran',
    'veteran jawa timur',
    'veteran jatim',
    'veteran east java',
  ];
  
  // Check for exact keyword matches
  for (const keyword of upnKeywords) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }
  
  // Fuzzy matching for variations
  const upnVariations = [
    'universitas pembangunan nasional veteran jawa timur',
    'universitas pembangunan nasional veteran',
    'upn veteran jawa timur',
    'upn veteran jatim',
    'upn jatim',
    'upn jawa timur',
  ];
  
  for (const variation of upnVariations) {
    const similarity = calculateSimilarity(normalized, variation);
    if (similarity >= threshold) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0 && len2 === 0) return 1;
  if (len1 === 0 || len2 === 0) return 0;
  
  // Levenshtein distance
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  
  return 1 - distance / maxLen;
}

/**
 * Extract angkatan from education entry
 * 
 * @param entry - Education entry
 * @returns Angkatan (start year) or undefined
 */
export function extractAngkatan(entry: EducationEntry): number | undefined {
  // Use start year if available
  if (entry.startYear) {
    return entry.startYear;
  }
  
  // Try to extract from description
  if (entry.description) {
    // Look for patterns like "Angkatan 2019" or "Class of 2019"
    const angkatanMatch = entry.description.match(/(?:angkatan|class of|batch)\s*(20\d{2})/i);
    if (angkatanMatch) {
      return parseInt(angkatanMatch[1], 10);
    }
  }
  
  // Try to derive from end year
  if (entry.endYear) {
    return entry.endYear - 4; // Assume 4-year program
  }
  
  return undefined;
}

// ============================================================================
// IPK/GPA Extraction
// ============================================================================

/**
 * Parse IPK/GPA from various formats
 * 
 * @param gradeString - Raw grade string
 * @returns Parsed IPK or null
 */
export function parseIPK(gradeString?: string): ParsedIPK | null {
  if (!gradeString) return null;
  
  const normalized = gradeString.toLowerCase().trim();
  
  // Pattern: "3.85/4.00" or "3.85 / 4.00"
  const slashMatch = normalized.match(/(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)/);
  if (slashMatch) {
    const value = parseFloat(slashMatch[1]);
    const scale = parseFloat(slashMatch[2]);
    
    if (!isNaN(value) && !isNaN(scale) && scale > 0) {
      return {
        value: normalizeToScale4(value, scale),
        originalScale: scale,
        isEstimated: false,
      };
    }
  }
  
  // Pattern: "GPA: 3.85" or "IPK: 3.85"
  const gpaMatch = normalized.match(/(?:gpa|ipk|nilai)\s*[:\s]\s*(\d+\.?\d*)/i);
  if (gpaMatch) {
    const value = parseFloat(gpaMatch[1]);
    
    if (!isNaN(value)) {
      // Assume 4.0 scale for GPA
      return {
        value,
        originalScale: 4.0,
        isEstimated: false,
      };
    }
  }
  
  // Pattern: "85/100" (percentage)
  const percentMatch = normalized.match(/(\d+)\s*\/\s*100/);
  if (percentMatch) {
    const percentage = parseInt(percentMatch[1], 10);
    
    if (!isNaN(percentage)) {
      // Convert percentage to 4.0 scale
      const value = (percentage / 100) * 4.0;
      return {
        value: parseFloat(value.toFixed(2)),
        originalScale: 100,
        isEstimated: false,
      };
    }
  }
  
  // Honors estimation
  if (normalized.includes('summa cum laude')) {
    return { value: 3.9, originalScale: 4.0, isEstimated: true };
  }
  if (normalized.includes('magna cum laude')) {
    return { value: 3.75, originalScale: 4.0, isEstimated: true };
  }
  if (normalized.includes('cum laude')) {
    return { value: 3.5, originalScale: 4.0, isEstimated: true };
  }
  
  return null;
}

/**
 * Normalize GPA to 4.0 scale
 */
function normalizeToScale4(value: number, originalScale: number): number {
  if (originalScale === 4.0) return value;
  if (originalScale === 100) return parseFloat(((value / 100) * 4.0).toFixed(2));
  if (originalScale === 10) return parseFloat(((value / 10) * 4.0).toFixed(2));
  if (originalScale === 5) return parseFloat(((value / 5) * 4.0).toFixed(2));
  
  // Unknown scale, assume linear
  return parseFloat(((value / originalScale) * 4.0).toFixed(2));
}

// ============================================================================
// Date Range Parsing
// ============================================================================

/**
 * Parse date range string to start and end years
 */
function parseDateRange(dateRange?: string | null): { startYear?: number; endYear?: number } {
  if (!dateRange) return {};
  
  const normalized = dateRange.toLowerCase();
  const result: { startYear?: number; endYear?: number } = {};
  
  // Pattern: "2019 - 2023" or "2019 – 2023"
  const rangeMatch = normalized.match(/(20\d{2})\s*[–-]\s*(20\d{2}|present|now)/);
  if (rangeMatch) {
    result.startYear = parseInt(rangeMatch[1], 10);
    if (rangeMatch[2] !== 'present' && rangeMatch[2] !== 'now') {
      result.endYear = parseInt(rangeMatch[2], 10);
    }
    return result;
  }
  
  // Pattern: "2023" (single year, assume end year)
  const singleYearMatch = normalized.match(/(20\d{2})/);
  if (singleYearMatch) {
    result.endYear = parseInt(singleYearMatch[1], 10);
  }
  
  return result;
}

// ============================================================================
// Missing Data Estimation
// ============================================================================

/**
 * Estimate missing data for education entry
 */
function estimateMissingData(
  entry: EducationEntry,
  config: EducationExtractionConfig
): EducationEntry {
  const notes: string[] = [];
  let isEstimated = entry.isEstimated;
  
  // Estimate end year from start year
  if (entry.startYear && !entry.endYear) {
    entry.endYear = entry.startYear + config.defaultDegreeDuration;
    notes.push(`End year estimated from start year (${config.defaultDegreeDuration}-year program)`);
    isEstimated = true;
  }
  
  // Estimate start year from end year
  if (entry.endYear && !entry.startYear) {
    entry.startYear = entry.endYear - config.defaultDegreeDuration;
    notes.push(`Start year estimated from end year (${config.defaultDegreeDuration}-year program)`);
    isEstimated = true;
  }
  
  entry.isEstimated = isEstimated;
  if (notes.length > 0) {
    entry.estimationNotes = notes;
  }
  
  return entry;
}

// ============================================================================
// Education Summary
// ============================================================================

/**
 * Create education summary from extracted entries
 * 
 * @param entries - All education entries
 * @returns Education summary with prioritized UPN data
 */
export function createEducationSummary(entries: EducationEntry[]): EducationSummary {
  // Filter UPN entries
  const upnEntries = entries.filter(e => e.isUPN);
  
  // Find primary UPN entry (prioritize S1 Informatika)
  let primaryUPN: EducationEntry | undefined;
  
  if (upnEntries.length > 0) {
    // First, look for S1/Sarjana Informatika
    primaryUPN = upnEntries.find(e => {
      const field = e.fieldOfStudy?.toLowerCase() || '';
      const degree = e.degree?.toLowerCase() || '';
      return (field.includes('informatika') || field.includes('computer')) &&
             (degree.includes('sarjana') || degree.includes('s1') || degree.includes('bachelor'));
    });
    
    // If not found, look for any Informatika
    if (!primaryUPN) {
      primaryUPN = upnEntries.find(e => {
        const field = e.fieldOfStudy?.toLowerCase() || '';
        return field.includes('informatika') || field.includes('computer');
      });
    }
    
    // If still not found, use first UPN entry
    if (!primaryUPN) {
      primaryUPN = upnEntries[0];
    }
  }
  
  // Extract angkatan, IPK, and graduation year from primary entry
  const angkatan = primaryUPN ? extractAngkatan(primaryUPN) : undefined;
  const tahunLulus = primaryUPN?.endYear;
  const ipk = primaryUPN?.grade ? parseIPK(primaryUPN.grade)?.value : undefined;
  
  return {
    primaryUPN,
    allUPN: upnEntries,
    allEducation: entries,
    angkatan,
    ipk,
    tahunLulus,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clean and normalize text
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

/**
 * Get degree level priority (for sorting)
 * Higher = more important for primary education
 */
export function getDegreePriority(degree?: string): number {
  if (!degree) return 0;
  
  const normalized = degree.toLowerCase();
  
  // S1/Bachelor highest priority for our use case
  if (normalized.includes('sarjana') || normalized.includes('s1') || normalized.includes('bachelor')) {
    return 100;
  }
  
  // D4/Diploma
  if (normalized.includes('d4') || normalized.includes('diploma')) {
    return 90;
  }
  
  // D2
  if (normalized.includes('d2')) {
    return 80;
  }
  
  // S2/Master
  if (normalized.includes('magister') || normalized.includes('s2') || normalized.includes('master')) {
    return 70;
  }
  
  // S3/PhD
  if (normalized.includes('doktor') || normalized.includes('s3') || normalized.includes('phd') || normalized.includes('doctor')) {
    return 60;
  }
  
  return 0;
}

/**
 * Check if field of study is IT/Computer related
 */
export function isITField(fieldOfStudy?: string): boolean {
  if (!fieldOfStudy) return false;
  
  const itKeywords = [
    'informatika',
    'computer',
    'computing',
    'information technology',
    'teknik komputer',
    'sistem informasi',
    'software',
    'programming',
    'ilmu komputer',
  ];
  
  const normalized = fieldOfStudy.toLowerCase();
  return itKeywords.some(keyword => normalized.includes(keyword));
}

// ============================================================================
// Export
// ============================================================================

// Types and functions are exported via 'export' declarations above
