/**
 * Salary Benchmarks & Market Data
 * 
 * Market salary ranges for various roles and experience levels
 * in the Indonesian tech industry. Used for salary estimation.
 * 
 * @module config/salary-benchmarks
 */

import { SpesialisasiRole } from '@/types/enums';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Salary range definition
 */
export interface SalaryRange {
  /** Minimum salary in IDR */
  min: number;
  /** Maximum salary in IDR */
  max: number;
  /** Median salary in IDR */
  median: number;
  /** Currency code */
  currency: 'IDR';
}

/**
 * Experience level definition
 */
export interface ExperienceLevelDefinition {
  /** Level name */
  level: string;
  /** Years of experience range */
  yearsRange: { min: number; max: number };
  /** Base salary range */
  baseSalary: SalaryRange;
}

/**
 * Location factor for salary adjustment
 */
export interface LocationFactor {
  /** Location name */
  location: string;
  /** Multiplier factor */
  factor: number;
  /** Description */
  description: string;
}

// ============================================================================
// Base Salary Benchmarks by Experience Level
// ============================================================================

/**
 * Base salary ranges by experience level (in IDR)
 */
export const EXPERIENCE_LEVEL_BENCHMARKS: ExperienceLevelDefinition[] = [
  {
    level: 'Entry-level',
    yearsRange: { min: 0, max: 2 },
    baseSalary: {
      min: 5_000_000,
      max: 8_000_000,
      median: 6_500_000,
      currency: 'IDR',
    },
  },
  {
    level: 'Junior',
    yearsRange: { min: 1, max: 3 },
    baseSalary: {
      min: 7_000_000,
      max: 12_000_000,
      median: 9_500_000,
      currency: 'IDR',
    },
  },
  {
    level: 'Mid-level',
    yearsRange: { min: 2, max: 5 },
    baseSalary: {
      min: 10_000_000,
      max: 20_000_000,
      median: 15_000_000,
      currency: 'IDR',
    },
  },
  {
    level: 'Senior',
    yearsRange: { min: 4, max: 8 },
    baseSalary: {
      min: 20_000_000,
      max: 40_000_000,
      median: 30_000_000,
      currency: 'IDR',
    },
  },
  {
    level: 'Lead',
    yearsRange: { min: 6, max: 10 },
    baseSalary: {
      min: 30_000_000,
      max: 60_000_000,
      median: 45_000_000,
      currency: 'IDR',
    },
  },
  {
    level: 'Principal/Staff',
    yearsRange: { min: 8, max: 15 },
    baseSalary: {
      min: 40_000_000,
      max: 80_000_000,
      median: 60_000_000,
      currency: 'IDR',
    },
  },
  {
    level: 'Executive',
    yearsRange: { min: 10, max: 99 },
    baseSalary: {
      min: 60_000_000,
      max: 150_000_000,
      median: 100_000_000,
      currency: 'IDR',
    },
  },
];

// ============================================================================
// Specialization Multipliers
// ============================================================================

/**
 * Salary multipliers based on specialization/role
 * Higher demand roles get higher multipliers
 */
export const SPECIALIZATION_MULTIPLIERS: Record<SpesialisasiRole, number> = {
  [SpesialisasiRole.FRONTEND]: 1.0,
  [SpesialisasiRole.BACKEND]: 1.05,
  [SpesialisasiRole.FULLSTACK]: 1.1,
  [SpesialisasiRole.AI_ENGINEER]: 1.3,
  [SpesialisasiRole.DATA_SCIENTIST]: 1.25,
  [SpesialisasiRole.DEVOPS]: 1.2,
  [SpesialisasiRole.MOBILE]: 1.0,
  [SpesialisasiRole.GAME_DEV]: 1.05,
  [SpesialisasiRole.SECURITY]: 1.25,
  [SpesialisasiRole.QA_ENGINEER]: 0.9,
  [SpesialisasiRole.LAINNYA]: 1.0,
};

// ============================================================================
// Location Factors
// ============================================================================

/**
 * Location-based salary adjustment factors
 */
export const LOCATION_FACTORS: LocationFactor[] = [
  { location: 'Jakarta', factor: 1.25, description: 'Capital city, highest cost of living' },
  { location: 'Jakarta Selatan', factor: 1.25, description: 'Business district' },
  { location: 'Jakarta Pusat', factor: 1.2, description: 'Central Jakarta' },
  { location: 'Jakarta Barat', factor: 1.15, description: 'West Jakarta' },
  { location: 'Jakarta Timur', factor: 1.15, description: 'East Jakarta' },
  { location: 'Jakarta Utara', factor: 1.15, description: 'North Jakarta' },
  { location: 'Bekasi', factor: 1.1, description: 'Jakarta satellite city' },
  { location: 'Depok', factor: 1.1, description: 'Jakarta satellite city' },
  { location: 'Tangerang', factor: 1.15, description: 'Jakarta satellite city' },
  { location: 'Tangerang Selatan', factor: 1.15, description: 'BSD/Serpong area' },
  { location: 'Bogor', factor: 1.05, description: 'Jakarta satellite city' },
  { location: 'Bandung', factor: 1.1, description: 'Tech hub, lower cost than Jakarta' },
  { location: 'Surabaya', factor: 1.0, description: 'Second largest city' },
  { location: 'Malang', factor: 0.95, description: 'Education/tech city' },
  { location: 'Yogyakarta', factor: 0.9, description: 'Education city' },
  { location: 'Semarang', factor: 0.95, description: 'Central Java capital' },
  { location: 'Denpasar', factor: 0.9, description: 'Bali capital' },
  { location: 'Medan', factor: 0.9, description: 'North Sumatra' },
  { location: 'Makassar', factor: 0.85, description: 'Eastern Indonesia' },
  { location: 'Remote', factor: 1.0, description: 'Remote work' },
  { location: 'Indonesia', factor: 1.0, description: 'Default country-wide' },
];

/**
 * Default location factor when location not found
 */
export const DEFAULT_LOCATION_FACTOR = 0.9;

// ============================================================================
// Company Type Factors
// ============================================================================

/**
 * Company type salary adjustments
 */
export const COMPANY_TYPE_FACTORS: Record<string, number> = {
  'startup': 0.95,        // Startups may pay slightly less but offer equity
  'scaleup': 1.0,         // Growing startup
  'enterprise': 1.15,     // Large companies pay more
  'multinational': 1.25, // MNCs pay significantly more
  'consulting': 1.1,      // Consulting firms
  'government': 0.85,   // Government typically pays less
  'education': 0.8,       // Education sector
  'agency': 0.9,        // Digital agencies
  'product': 1.05,        // Product companies
  'remote_first': 1.0,    // Remote-first companies
};

/**
 * Default company type factor
 */
export const DEFAULT_COMPANY_TYPE_FACTOR = 1.0;

// ============================================================================
// Company Size Factors
// ============================================================================

/**
 * Company size salary adjustments
 */
export const COMPANY_SIZE_FACTORS: Record<string, number> = {
  '1-10': 0.9,        // Very small startup
  '11-50': 0.95,      // Small company
  '51-200': 1.0,      // Medium company
  '201-500': 1.05,    // Large company
  '501-1000': 1.1,    // Very large company
  '1000+': 1.15,      // Enterprise
  '10000+': 1.2,      // Mega corp
};

/**
 * Default company size factor
 */
export const DEFAULT_COMPANY_SIZE_FACTOR = 1.0;

// ============================================================================
// Education Level Factors
// ============================================================================

/**
 * Education level salary adjustments
 */
export const EDUCATION_FACTORS: Record<string, number> = {
  'S1': 1.0,           // Bachelor's (baseline)
  'D4': 1.0,           // Diploma 4 equivalent to S1
  'D3': 0.95,          // Diploma 3 slightly lower
  'D2': 0.9,           // Diploma 2
  'S2': 1.1,           // Master's degree
  'S3': 1.2,           // PhD
};

/**
 * Default education factor
 */
export const DEFAULT_EDUCATION_FACTOR = 1.0;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get experience level definition by years of experience
 * 
 * @param years - Years of experience
 * @returns Experience level definition or null
 */
export function getExperienceLevel(years: number): ExperienceLevelDefinition | null {
  for (const level of EXPERIENCE_LEVEL_BENCHMARKS) {
    if (years >= level.yearsRange.min && years <= level.yearsRange.max) {
      return level;
    }
  }
  
  // If above max, return the highest level
  if (years > 15) {
    return EXPERIENCE_LEVEL_BENCHMARKS[EXPERIENCE_LEVEL_BENCHMARKS.length - 1];
  }
  
  return null;
}

/**
 * Get location factor by location name
 * 
 * @param location - Location name
 * @returns Location factor
 */
export function getLocationFactor(location: string): number {
  const normalized = location.toLowerCase().trim();
  
  for (const factor of LOCATION_FACTORS) {
    if (factor.location.toLowerCase() === normalized) {
      return factor.factor;
    }
  }
  
  // Try partial matching
  for (const factor of LOCATION_FACTORS) {
    if (normalized.includes(factor.location.toLowerCase())) {
      return factor.factor;
    }
  }
  
  return DEFAULT_LOCATION_FACTOR;
}

/**
 * Get company type factor
 * 
 * @param companyType - Type of company
 * @returns Company type factor
 */
export function getCompanyTypeFactor(companyType: string): number {
  const normalized = companyType.toLowerCase().trim();
  
  for (const [type, factor] of Object.entries(COMPANY_TYPE_FACTORS)) {
    if (normalized.includes(type.toLowerCase())) {
      return factor;
    }
  }
  
  return DEFAULT_COMPANY_TYPE_FACTOR;
}

/**
 * Get company size factor
 * 
 * @param size - Company size range or employee count
 * @returns Company size factor
 */
export function getCompanySizeFactor(size: string | number): number {
  if (typeof size === 'number') {
    // Convert employee count to range
    if (size <= 10) return COMPANY_SIZE_FACTORS['1-10'];
    if (size <= 50) return COMPANY_SIZE_FACTORS['11-50'];
    if (size <= 200) return COMPANY_SIZE_FACTORS['51-200'];
    if (size <= 500) return COMPANY_SIZE_FACTORS['201-500'];
    if (size <= 1000) return COMPANY_SIZE_FACTORS['501-1000'];
    if (size <= 10000) return COMPANY_SIZE_FACTORS['1000+'];
    return COMPANY_SIZE_FACTORS['10000+'];
  }
  
  const normalized = size.toLowerCase().trim();
  
  for (const [range, factor] of Object.entries(COMPANY_SIZE_FACTORS)) {
    if (normalized.includes(range.toLowerCase())) {
      return factor;
    }
  }
  
  return DEFAULT_COMPANY_SIZE_FACTOR;
}

/**
 * Get specialization multiplier
 * 
 * @param specialization - Role specialization
 * @returns Multiplier factor
 */
export function getSpecializationMultiplier(specialization: SpesialisasiRole): number {
  return SPECIALIZATION_MULTIPLIERS[specialization] || 1.0;
}

/**
 * Format salary to Indonesian Rupiah string
 * 
 * @param amount - Salary amount
 * @returns Formatted string (e.g., "Rp 15.000.000")
 */
export function formatSalary(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format salary in millions (short form)
 * 
 * @param amount - Salary amount
 * @returns Formatted string (e.g., "15 juta")
 */
export function formatSalaryInMillions(amount: number): string {
  const millions = amount / 1_000_000;
  return `${millions.toFixed(1)} juta`;
}

// ============================================================================
// Export
// ============================================================================

// Types are exported via 'export interface' declarations above
