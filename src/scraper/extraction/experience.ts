/**
 * Experience & Career Timeline Extraction
 * 
 * Extracts complete work history from LinkedIn profiles including
 * positions, companies, employment types, and timeline information.
 * 
 * Features:
 * - Experience section scraping with expansion
 * - Company grouping handling (flatten positions)
 * - Date parsing (English and Indonesian formats)
 * - Current position identification
 * - Career progression analysis
 * 
 * @module scraper/extraction/experience
 */

import type { Page } from 'playwright';
import { logger } from '@/utils/logger';
import { randomDelay } from '@/scraper/rate-limiter';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Work experience entry
 */
export interface ExperienceEntry {
  /** Job title */
  title: string;
  /** Company name */
  companyName: string;
  /** Employment type (Full-time, Contract, etc.) */
  employmentType?: string;
  /** Work location */
  location?: string;
  /** Whether this is current position */
  isCurrent: boolean;
  /** Start date */
  startDate: Date;
  /** End date (null if current) */
  endDate?: Date;
  /** Duration string for validation */
  duration?: string;
  /** Job description */
  description?: string;
  /** Company LinkedIn URL */
  companyUrl?: string;
  /** Position order (0 = most recent) */
  order: number;
}

/**
 * Career summary derived from experience
 */
export interface CareerSummary {
  /** All experience entries sorted by date */
  allPositions: ExperienceEntry[];
  /** Current position if any */
  currentPosition?: ExperienceEntry;
  /** Current company name */
  currentCompany?: string;
  /** Previous positions */
  previousPositions: ExperienceEntry[];
  /** Total years of experience */
  totalYearsExperience: number;
  /** Number of companies worked at */
  numberOfCompanies: number;
  /** Number of position changes */
  numberOfPositions: number;
  /** Career progression (Junior → Senior → Lead, etc.) */
  careerProgression: CareerProgressionItem[];
}

/**
 * Career progression item
 */
export interface CareerProgressionItem {
  /** Year of change */
  year: number;
  /** Type of change */
  type: 'promotion' | 'company_switch' | 'role_change';
  /** From position/company */
  from: string;
  /** To position/company */
  to: string;
  /** Description */
  description: string;
}

/**
 * Extraction configuration
 */
export interface ExperienceExtractionConfig {
  /** Timeout for element selection */
  elementTimeout: number;
  /** Whether to expand experience section */
  expandSection: boolean;
  /** Maximum entries to extract (0 = unlimited) */
  maxEntries: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ExperienceExtractionConfig = {
  elementTimeout: 5000,
  expandSection: true,
  maxEntries: 0,
};

// ============================================================================
// Selectors
// ============================================================================

const EXPERIENCE_SELECTORS = {
  // Section containers
  section: '.experience-section, #experience-section, .pv-experience-section',
  
  // Show all button
  showAllButton: [
    '.experience-section .pv-profile-section__see-all',
    '.experience-section .artdeco-button:has-text("Show all")',
    '.experience-section [data-testid="show-all-experiences"]',
    'button:has-text("Show all experience")',
  ],
  
  // Company groups (LinkedIn groups multiple positions under one company)
  companyGroup: [
    '.pv-entity__position-group',
    '.experience-group',
    '[data-testid="experience-item"]',
    '.artdeco-list__item',
  ],
  
  // Company info (within group)
  companyName: [
    '.pv-entity__company-name',
    '.experience-group-header__company',
    '[data-testid="company-name"]',
    '.artdeco-entity-lockup__title',
    'h3',
    'a[data-control-name="background_details_company"]',
  ],
  companyUrl: [
    'a[data-control-name="background_details_company"]',
    '.pv-entity__company-name a',
    'a[href*="/company/"]',
  ],
  
  // Position entries (within company group)
  position: [
    '.pv-entity__position-details',
    '.experience-item__details',
    '[data-testid="position-details"]',
    '.artdeco-entity-lockup__content',
  ],
  
  // Position fields
  title: [
    '.pv-entity__position-title',
    '.experience-item__title',
    '[data-testid="position-title"]',
    '.artdeco-entity-lockup__subtitle span:first-child',
    'h3 span',
    '.t-bold',
  ],
  employmentType: [
    '.pv-entity__position-type',
    '.experience-item__employment-type',
    '[data-testid="employment-type"]',
    'span:has-text("Full-time"), span:has-text("Part-time"), span:has-text("Contract")',
  ],
  location: [
    '.pv-entity__location',
    '.experience-item__location',
    '[data-testid="experience-location"]',
    '.artdeco-entity-lockup__metadata',
  ],
  dateRange: [
    '.pv-entity__date-range',
    '.experience-item__date-range',
    '[data-testid="experience-date-range"]',
    '.artdeco-entity-lockup__metadata',
    'span:has-text("20")',
  ],
  duration: [
    '.pv-entity__duration',
    '.experience-item__duration',
    '[data-testid="experience-duration"]',
    'span:has-text("yr"), span:has-text("mo")',
  ],
  description: [
    '.pv-entity__description',
    '.experience-item__description',
    '[data-testid="experience-description"]',
    '.inline-show-more-text',
    '.show-more-less-text',
  ],
  
  // Single position format (not grouped)
  singlePosition: [
    '.pv-position-entity',
    '.experience-item',
    '[data-testid="experience-item-single"]',
  ],
};

// Month mappings for date parsing
const MONTH_MAP: Record<string, number> = {
  // English
  'jan': 0, 'january': 0,
  'feb': 1, 'february': 1,
  'mar': 2, 'march': 2,
  'apr': 3, 'april': 3,
  'may': 4,
  'jun': 5, 'june': 5,
  'jul': 6, 'july': 6,
  'aug': 7, 'august': 7,
  'sep': 8, 'sept': 8, 'september': 8,
  'oct': 9, 'october': 9,
  'nov': 10, 'november': 10,
  'dec': 11, 'december': 11,
  // Indonesian (only non-overlapping keys)
  'januari': 0,
  'februari': 1,
  'maret': 2,
  'mei': 4,
  'juni': 5,
  'juli': 6,
  'agustus': 7, 'agu': 7,
  'oktober': 9, 'okt': 9,
  'desember': 11, 'des': 11,
};

// ============================================================================
// Core Extraction
// ============================================================================

/**
 * Extract work experience from LinkedIn profile
 * 
 * @param page - Playwright page instance
 * @param config - Extraction configuration
 * @returns Array of experience entries
 */
export async function extractExperience(
  page: Page,
  config?: Partial<ExperienceExtractionConfig>
): Promise<ExperienceEntry[]> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const entries: ExperienceEntry[] = [];
  
  logger.info('Extracting work experience...');
  
  try {
    // Check if experience section exists
    const sectionExists = await page.locator(EXPERIENCE_SELECTORS.section).count() > 0;
    if (!sectionExists) {
      logger.warn('Experience section not found');
      return entries;
    }
    
    // Expand section if needed
    if (opts.expandSection) {
      await expandExperienceSection(page);
    }
    
    // Try grouped format first (multiple positions under company)
    for (const groupSelector of EXPERIENCE_SELECTORS.companyGroup) {
      const groups = await page.locator(groupSelector).all();
      
      for (const group of groups) {
        try {
          const groupEntries = await extractCompanyGroup(group);
          entries.push(...groupEntries);
          
          // Check max entries limit
          if (opts.maxEntries > 0 && entries.length >= opts.maxEntries) {
            entries.splice(opts.maxEntries);
            break;
          }
        } catch (error) {
          logger.debug('Failed to extract company group:', error);
          continue;
        }
      }
      
      if (entries.length > 0) break;
    }
    
    // If no entries from grouped format, try single position format
    if (entries.length === 0) {
      for (const singleSelector of EXPERIENCE_SELECTORS.singlePosition) {
        const singles = await page.locator(singleSelector).all();
        
        for (const single of singles) {
          try {
            const entry = await extractSinglePosition(single);
            if (entry) {
              entries.push(entry);
              
              if (opts.maxEntries > 0 && entries.length >= opts.maxEntries) {
                entries.splice(opts.maxEntries);
                break;
              }
            }
          } catch (error) {
            logger.debug('Failed to extract single position:', error);
            continue;
          }
        }
        
        if (entries.length > 0) break;
      }
    }
    
    // Sort by start date (most recent first)
    entries.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    
    // Assign order
    entries.forEach((entry, index) => {
      entry.order = index;
    });
    
    logger.info(`Extracted ${entries.length} experience entries`);
    return entries;
    
  } catch (error) {
    logger.error('Failed to extract experience:', error);
    return entries;
  }
}

/**
 * Extract positions from a company group
 */
async function extractCompanyGroup(
  group: ReturnType<Page['locator']>
): Promise<ExperienceEntry[]> {
  const entries: ExperienceEntry[] = [];
  
  // Extract company name
  const companyName = await extractField(group, EXPERIENCE_SELECTORS.companyName);
  if (!companyName) return entries;
  
  // Clean company name (remove " · Full-time" etc.)
  const cleanCompanyName = companyName.split(' · ')[0].trim();
  
  // Extract company URL
  const companyUrl = await extractAttribute(group, EXPERIENCE_SELECTORS.companyUrl, 'href') ?? undefined;
  
  // Extract employment type from company name suffix
  const employmentType = extractEmploymentType(companyName);
  
  // Extract all positions within this company
  const positions = await group.locator(EXPERIENCE_SELECTORS.position[0]).all();
  
  for (const position of positions) {
    try {
      const entry = await extractPositionDetails(
        position,
        cleanCompanyName,
        employmentType,
        companyUrl
      );
      if (entry) {
        entries.push(entry);
      }
    } catch (error) {
      logger.debug('Failed to extract position:', error);
      continue;
    }
  }
  
  return entries;
}

/**
 * Extract single position (non-grouped format)
 */
async function extractSinglePosition(
  element: ReturnType<Page['locator']>
): Promise<ExperienceEntry | null> {
  // Extract title
  const title = await extractField(element, EXPERIENCE_SELECTORS.title);
  if (!title) return null;
  
  // Extract company name (might be in different location)
  let companyName = await extractField(element, EXPERIENCE_SELECTORS.companyName);
  if (!companyName) {
    // Try to extract from subtitle
    const subtitle = await extractField(element, ['.pv-entity__secondary-title', '.t-14']);
    if (subtitle) {
      companyName = subtitle.split(' · ')[0].trim();
    }
  }
  
  if (!companyName) return null;
  
  const cleanCompanyName = companyName.split(' · ')[0].trim();
  const employmentType = extractEmploymentType(companyName);
  
  return extractPositionDetails(element, cleanCompanyName, employmentType);
}

/**
 * Extract position details
 */
async function extractPositionDetails(
  element: ReturnType<Page['locator']>,
  companyName: string,
  employmentType?: string,
  companyUrl?: string | null
): Promise<ExperienceEntry | null> {
  // Extract title
  const title = await extractField(element, EXPERIENCE_SELECTORS.title);
  if (!title) return null;
  
  // Extract location
  const location = await extractField(element, EXPERIENCE_SELECTORS.location);
  
  // Extract date range
  const dateRange = await extractField(element, EXPERIENCE_SELECTORS.dateRange);
  const { startDate, endDate, isCurrent } = parseDateRange(dateRange || '');
  
  if (!startDate) {
    logger.debug('Could not parse start date for position');
    return null;
  }
  
  // Extract duration
  const duration = await extractField(element, EXPERIENCE_SELECTORS.duration);
  
  // Extract description
  const description = await extractField(element, EXPERIENCE_SELECTORS.description);
  
  // Extract specific employment type if not from company
  let specificEmploymentType = employmentType;
  if (!specificEmploymentType) {
    const extractedType = await extractField(element, EXPERIENCE_SELECTORS.employmentType);
    specificEmploymentType = extractedType ?? undefined;
  }
  
  return {
    title: cleanText(title),
    companyName: cleanText(companyName),
    employmentType: specificEmploymentType ? cleanText(specificEmploymentType) : undefined,
    location: location ? cleanText(location) : undefined,
    isCurrent,
    startDate,
    endDate,
    duration: duration ? cleanText(duration) : undefined,
    description: description ? cleanText(description) : undefined,
    companyUrl: companyUrl || undefined,
    order: 0,
  };
}

/**
 * Expand experience section
 */
async function expandExperienceSection(page: Page): Promise<void> {
  for (const selector of EXPERIENCE_SELECTORS.showAllButton) {
    try {
      const button = page.locator(selector).first();
      const visible = await button.isVisible().catch(() => false);
      
      if (visible) {
        await button.click();
        await randomDelay(1000, 2000);
        logger.debug('Expanded experience section');
        return;
      }
    } catch {
      continue;
    }
  }
}

// ============================================================================
// Date Parsing
// ============================================================================

/**
 * Parse LinkedIn date string
 * 
 * @param dateString - Date string from LinkedIn (e.g., "Jan 2020 - Present")
 * @returns Parsed dates and current status
 */
export function parseDateRange(dateString: string): {
  startDate: Date | null;
  endDate?: Date;
  isCurrent: boolean;
} {
  const normalized = dateString.toLowerCase().trim();
  
  // Check for current position indicators
  const currentIndicators = ['present', 'now', 'sekarang', 'current', 'saat ini'];
  const isCurrent = currentIndicators.some(ind => normalized.includes(ind));
  
  // Extract date range parts
  const parts = normalized.split(/[-–—]/).map(p => p.trim());
  
  let startDate: Date | null = null;
  let endDate: Date | undefined;
  
  // Parse start date
  if (parts[0]) {
    startDate = parseLinkedInDate(parts[0]);
  }
  
  // Parse end date
  if (parts[1] && !isCurrent) {
    endDate = parseLinkedInDate(parts[1]) || undefined;
  }
  
  return { startDate, endDate, isCurrent };
}

/**
 * Parse individual LinkedIn date
 */
export function parseLinkedInDate(dateString: string): Date | null {
  const normalized = dateString.toLowerCase().trim();
  
  // Pattern: "Jan 2020" or "January 2020"
  const monthYearMatch = normalized.match(/([a-z]+)\s+(\d{4})/);
  if (monthYearMatch) {
    const monthName = monthYearMatch[1];
    const year = parseInt(monthYearMatch[2], 10);
    const month = MONTH_MAP[monthName];
    
    if (month !== undefined && !isNaN(year)) {
      return new Date(year, month, 1);
    }
  }
  
  // Pattern: Just year "2020"
  const yearMatch = normalized.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (!isNaN(year)) {
      return new Date(year, 0, 1);
    }
  }
  
  return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract text field using multiple selectors
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
 * Extract attribute using multiple selectors
 */
async function extractAttribute(
  element: ReturnType<Page['locator']>,
  selectors: string[],
  attribute: string
): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const child = element.locator(selector).first();
      const visible = await child.isVisible().catch(() => false);
      
      if (visible) {
        const value = await child.getAttribute(attribute, { timeout: 1000 });
        if (value && value.trim()) {
          return value.trim();
        }
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

/**
 * Extract employment type from company name string
 */
function extractEmploymentType(companyName: string): string | undefined {
  const match = companyName.match(/·\s*(.+)$/);
  if (match) {
    const type = match[1].trim();
    // Validate it's an employment type
    const validTypes = ['full-time', 'part-time', 'contract', 'internship', 'freelance', 'self-employed'];
    if (validTypes.some(t => type.toLowerCase().includes(t))) {
      return type;
    }
  }
  return undefined;
}

/**
 * Clean text content
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

// ============================================================================
// Career Summary & Analysis
// ============================================================================

/**
 * Create career summary from experience entries
 * 
 * @param entries - Experience entries
 * @returns Career summary
 */
export function createCareerSummary(entries: ExperienceEntry[]): CareerSummary {
  // Sort by start date (most recent first)
  const sorted = [...entries].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  
  // Identify current position
  const currentPosition = sorted.find(e => e.isCurrent);
  
  // Get previous positions
  const previousPositions = sorted.filter(e => !e.isCurrent);
  
  // Calculate total years of experience
  const totalYearsExperience = calculateTotalYears(sorted);
  
  // Count unique companies
  const uniqueCompanies = new Set(sorted.map(e => e.companyName.toLowerCase()));
  
  // Analyze career progression
  const careerProgression = analyzeCareerProgression(sorted);
  
  return {
    allPositions: sorted,
    currentPosition,
    currentCompany: currentPosition?.companyName,
    previousPositions,
    totalYearsExperience,
    numberOfCompanies: uniqueCompanies.size,
    numberOfPositions: sorted.length,
    careerProgression,
  };
}

/**
 * Calculate total years of experience
 */
function calculateTotalYears(entries: ExperienceEntry[]): number {
  if (entries.length === 0) return 0;
  
  // Find earliest start date
  const earliestDate = entries.reduce((min, entry) => 
    entry.startDate < min ? entry.startDate : min,
    entries[0].startDate
  );
  
  // Find latest end date (or now for current)
  const latestDate = entries.reduce((max, entry) => {
    const endDate = entry.endDate || new Date();
    return endDate > max ? endDate : max;
  }, entries[0].endDate || new Date());
  
  // Calculate years
  const diffTime = Math.abs(latestDate.getTime() - earliestDate.getTime());
  const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
  
  return Math.round(diffYears * 10) / 10; // Round to 1 decimal
}

/**
 * Analyze career progression
 */
function analyzeCareerProgression(entries: ExperienceEntry[]): CareerProgressionItem[] {
  const progression: CareerProgressionItem[] = [];
  
  for (let i = 0; i < entries.length - 1; i++) {
    const current = entries[i];
    const next = entries[i + 1]; // next in array = earlier in time
    
    const year = current.startDate.getFullYear();
    
    // Check for company switch
    if (current.companyName.toLowerCase() !== next.companyName.toLowerCase()) {
      progression.push({
        year,
        type: 'company_switch',
        from: `${next.title} at ${next.companyName}`,
        to: `${current.title} at ${current.companyName}`,
        description: `Moved from ${next.companyName} to ${current.companyName}`,
      });
    }
    // Check for promotion (same company, different title)
    else if (current.title.toLowerCase() !== next.title.toLowerCase()) {
      progression.push({
        year,
        type: 'promotion',
        from: next.title,
        to: current.title,
        description: `Promoted from ${next.title} to ${current.title} at ${current.companyName}`,
      });
    }
    // Role change
    else {
      progression.push({
        year,
        type: 'role_change',
        from: next.title,
        to: current.title,
        description: `Role changed at ${current.companyName}`,
      });
    }
  }
  
  return progression;
}

/**
 * Get seniority level from title
 */
export function getSeniorityLevel(title: string): 'entry' | 'junior' | 'mid' | 'senior' | 'lead' | 'executive' {
  const normalized = title.toLowerCase();
  
  // Executive levels
  if (/(?:cto|ceo|cfo|cio|chief|vp|vice president|head of|director)/.test(normalized)) {
    return 'executive';
  }
  
  // Lead/Principal levels
  if (/(?:lead|principal|staff|architect|manager)/.test(normalized)) {
    return 'lead';
  }
  
  // Senior levels
  if (/(?:senior|sr\.?|spec|specialist|advanced)/.test(normalized)) {
    return 'senior';
  }
  
  // Junior levels
  if (/(?:junior|jr\.?|associate|entry|intern|trainee|fresh graduate)/.test(normalized)) {
    return 'junior';
  }
  
  // Mid level (default for most positions)
  return 'mid';
}

/**
 * Check if position is current
 */
export function isCurrentPosition(entry: ExperienceEntry): boolean {
  return entry.isCurrent || !entry.endDate;
}

/**
 * Get duration in months
 */
export function getDurationInMonths(entry: ExperienceEntry): number {
  const endDate = entry.endDate || new Date();
  const diffTime = endDate.getTime() - entry.startDate.getTime();
  const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44);
  return Math.round(diffMonths);
}

// ============================================================================
// Export
// ============================================================================

// Types and functions are exported via 'export' declarations above
