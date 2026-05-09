/**
 * Salary Estimation Logic
 * 
 * Implements salary estimation based on role, experience, company,
 * and location using market benchmark data.
 * 
 * Features:
 * - Salary estimation engine
 * - Multiple factor calculations (experience, role, location, company)
 * - Confidence scoring
 * - LinkedIn Premium integration placeholder
 * 
 * @module scraper/extraction/salary
 */

import { logger } from '@/utils/logger';
import { SpesialisasiRole } from '@/types/enums';
import type { CareerSummary, ExperienceEntry } from './experience';
import {
  getExperienceLevel,
  getLocationFactor,
  getCompanyTypeFactor,
  getCompanySizeFactor,
  getSpecializationMultiplier,
  formatSalary,
  type SalaryRange,
} from '@/config/salary-benchmarks';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Salary estimate result
 */
export interface SalaryEstimate {
  /** Minimum estimated salary */
  min: number;
  /** Maximum estimated salary */
  max: number;
  /** Median/expected salary */
  median: number;
  /** Currency code */
  currency: 'IDR';
  /** Confidence level */
  confidence: 'low' | 'medium' | 'high';
  /** Confidence score (0-1) */
  confidenceScore: number;
  /** Whether this is an estimated value */
  isEstimated: true;
  /** Factors used in calculation */
  factors: SalaryFactors;
  /** Human-readable formatted salary */
  formattedRange: string;
}

/**
 * Factors used in salary calculation
 */
export interface SalaryFactors {
  /** Years of experience */
  yearsOfExperience: number;
  /** Experience level name */
  experienceLevel: string;
  /** Specialization/role */
  specialization: SpesialisasiRole;
  /** Location name */
  location: string;
  /** Location factor applied */
  locationFactor: number;
  /** Company type */
  companyType?: string;
  /** Company type factor */
  companyTypeFactor: number;
  /** Company size */
  companySize?: string;
  /** Company size factor */
  companySizeFactor: number;
  /** Specialization multiplier */
  specializationMultiplier: number;
  /** Overall adjustment factor */
  totalFactor: number;
}

/**
 * Profile data for salary estimation
 */
export interface ProfileDataForSalary {
  /** Career summary with experience */
  careerSummary?: CareerSummary;
  /** Current position */
  currentPosition?: ExperienceEntry;
  /** Specialization/role */
  specialization?: SpesialisasiRole;
  /** Location */
  location?: string;
  /** Company name (for type detection) */
  companyName?: string;
  /** Company size if known */
  companySize?: string | number;
  /** Education level */
  educationLevel?: string;
  /** Years of experience (direct) */
  yearsOfExperience?: number;
}

/**
 * LinkedIn Premium salary insights (if available)
 */
export interface LinkedInSalaryInsight {
  /** Job title */
  jobTitle: string;
  /** Location */
  location: string;
  /** Salary range from LinkedIn */
  range: SalaryRange;
  /** Data source */
  source: 'linkedin_premium';
  /** Timestamp */
  timestamp: Date;
}

/**
 * Estimation configuration
 */
export interface SalaryEstimationConfig {
  /** Minimum confidence threshold to return estimate */
  minConfidenceScore: number;
  /** Whether to include company factors */
  includeCompanyFactors: boolean;
  /** Whether to include education factors */
  includeEducationFactors: boolean;
  /** Fallback location if not provided */
  defaultLocation: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SalaryEstimationConfig = {
  minConfidenceScore: 0.3,
  includeCompanyFactors: true,
  includeEducationFactors: false, // Education data often limited
  defaultLocation: 'Indonesia',
};

// ============================================================================
// Salary Estimation Engine
// ============================================================================

/**
 * Estimate salary based on profile data
 * 
 * @param profileData - Profile data for estimation
 * @param config - Estimation configuration
 * @returns Salary estimate or null if insufficient data
 */
export function estimateSalary(
  profileData: ProfileDataForSalary,
  config?: Partial<SalaryEstimationConfig>
): SalaryEstimate | null {
  const opts = { ...DEFAULT_CONFIG, ...config };
  
  logger.info('Estimating salary...');
  
  // Check minimum required data
  if (!hasMinimumData(profileData)) {
    logger.warn('Insufficient data for salary estimation');
    return null;
  }
  
  try {
    // Gather factors
    const factors = calculateFactors(profileData, opts);
    
    // Get base salary from experience level
    const baseSalary = getExperienceLevel(factors.yearsOfExperience)?.baseSalary;
    if (!baseSalary) {
      logger.warn('Could not determine base salary level');
      return null;
    }
    
    // Calculate adjusted salary
    const adjustedMin = Math.round(baseSalary.min * factors.totalFactor);
    const adjustedMax = Math.round(baseSalary.max * factors.totalFactor);
    const adjustedMedian = Math.round(baseSalary.median * factors.totalFactor);
    
    // Calculate confidence
    const { confidence, confidenceScore } = calculateConfidence(factors, profileData);
    
    // Check minimum confidence
    if (confidenceScore < opts.minConfidenceScore) {
      logger.warn(`Confidence too low for salary estimate: ${confidenceScore}`);
      return null;
    }
    
    const estimate: SalaryEstimate = {
      min: adjustedMin,
      max: adjustedMax,
      median: adjustedMedian,
      currency: 'IDR',
      confidence,
      confidenceScore,
      isEstimated: true,
      factors,
      formattedRange: `${formatSalary(adjustedMin)} - ${formatSalary(adjustedMax)}`,
    };
    
    logger.info(`Salary estimated: ${estimate.formattedRange} (${confidence} confidence)`);
    return estimate;
    
  } catch (error) {
    logger.error('Error estimating salary:', error);
    return null;
  }
}

/**
 * Check if profile has minimum required data for estimation
 */
function hasMinimumData(profileData: ProfileDataForSalary): boolean {
  // Need at least years of experience or career summary
  const hasExperience = 
    profileData.yearsOfExperience !== undefined ||
    profileData.careerSummary?.totalYearsExperience !== undefined;
  
  // Need at least location or specialization
  const hasContext = 
    profileData.location !== undefined ||
    profileData.specialization !== undefined ||
    profileData.careerSummary?.currentPosition !== undefined;
  
  return hasExperience && hasContext;
}

/**
 * Calculate all salary factors
 */
function calculateFactors(
  profileData: ProfileDataForSalary,
  config: SalaryEstimationConfig
): SalaryFactors {
  // Years of experience
  const yearsOfExperience = 
    profileData.yearsOfExperience ??
    profileData.careerSummary?.totalYearsExperience ??
    0;
  
  // Experience level
  const experienceLevel = getExperienceLevel(yearsOfExperience)?.level ?? 'Unknown';
  
  // Specialization
  const specialization = profileData.specialization ?? SpesialisasiRole.LAINNYA;
  const specializationMultiplier = getSpecializationMultiplier(specialization);
  
  // Location
  const location = profileData.location ?? config.defaultLocation;
  const locationFactor = getLocationFactor(location);
  
  // Company type (detect from company name if not provided)
  const companyType = detectCompanyType(profileData.companyName);
  const companyTypeFactor = config.includeCompanyFactors
    ? getCompanyTypeFactor(companyType)
    : 1.0;
  
  // Company size
  const companySize = profileData.companySize?.toString();
  const companySizeFactor = config.includeCompanyFactors && profileData.companySize
    ? getCompanySizeFactor(profileData.companySize)
    : 1.0;
  
  // Calculate total factor
  const totalFactor = 
    locationFactor * 
    specializationMultiplier * 
    companyTypeFactor * 
    companySizeFactor;
  
  return {
    yearsOfExperience,
    experienceLevel,
    specialization,
    location,
    locationFactor,
    companyType,
    companyTypeFactor,
    companySize,
    companySizeFactor,
    specializationMultiplier,
    totalFactor,
  };
}

/**
 * Detect company type from company name
 * Simple heuristic-based detection
 */
function detectCompanyType(companyName?: string): string {
  if (!companyName) return 'unknown';
  
  const normalized = companyName.toLowerCase();
  
  // MNC indicators
  if (/\b(pt|tbk|inc|corp|ltd|gmbh|s\.a\.?|plc)\b/.test(normalized)) {
    return 'multinational';
  }
  
  // Startup indicators
  if (/\b(startup|labs?|ventures?|digital|tech|app|\.io|ai)\b/.test(normalized)) {
    return 'startup';
  }
  
  // Consulting
  if (/\b(consulting|consultant|advisory|solutions?)\b/.test(normalized)) {
    return 'consulting';
  }
  
  // Government
  if (/\b(gov|government|kementerian|dinas|badan|pusat)\b/.test(normalized)) {
    return 'government';
  }
  
  // Education
  if (/\b(univ|university|institut|sekolah|academy|campus)\b/.test(normalized)) {
    return 'education';
  }
  
  return 'enterprise'; // Default assumption
}

/**
 * Calculate confidence level and score
 */
function calculateConfidence(
  factors: SalaryFactors,
  profileData: ProfileDataForSalary
): { confidence: 'low' | 'medium' | 'high'; confidenceScore: number } {
  let score = 0.5; // Base score
  
  // Boost for having specific location
  if (profileData.location && profileData.location !== 'Indonesia') {
    score += 0.1;
  }
  
  // Boost for having specialization
  if (profileData.specialization && profileData.specialization !== SpesialisasiRole.LAINNYA) {
    score += 0.15;
  }
  
  // Boost for having career summary
  if (profileData.careerSummary && profileData.careerSummary.allPositions.length > 0) {
    score += 0.1;
  }
  
  // Boost for having current position
  if (profileData.currentPosition || profileData.careerSummary?.currentPosition) {
    score += 0.1;
  }
  
  // Boost for reasonable experience years
  if (factors.yearsOfExperience > 0 && factors.yearsOfExperience < 40) {
    score += 0.05;
  }
  
  // Penalize if factors are too generic
  if (factors.location === 'Indonesia' || factors.location === 'Remote') {
    score -= 0.05;
  }
  
  if (factors.specialization === SpesialisasiRole.LAINNYA) {
    score -= 0.1;
  }
  
  // Determine confidence level
  let confidence: 'low' | 'medium' | 'high';
  if (score >= 0.7) {
    confidence = 'high';
  } else if (score >= 0.5) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    confidence,
    confidenceScore: Math.max(0, Math.min(1, score)),
  };
}

// ============================================================================
// LinkedIn Premium Integration (Placeholder)
// ============================================================================

/**
 * Extract LinkedIn Premium salary insights from page
 * This is a placeholder for future implementation
 * 
 * @param page - Playwright page instance
 * @returns Salary insights or null
 */
export async function extractLinkedInSalaryInsights(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _page: unknown
): Promise<LinkedInSalaryInsight | null> {
  // Placeholder implementation
  // In the future, this would:
  // 1. Check if user has LinkedIn Premium
  // 2. Navigate to job salary insights page
  // 3. Extract salary data if available
  
  logger.debug('LinkedIn Premium salary extraction not yet implemented');
  return null;
}

/**
 * Check if profile has LinkedIn Premium
 * Placeholder for future implementation
 * 
 * @param page - Playwright page instance
 * @returns True if Premium detected
 */
export async function hasLinkedInPremium(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _page: unknown
): Promise<boolean> {
  // Placeholder - would check for Premium badges
  return false;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compare estimated salary with market benchmark
 * 
 * @param estimate - Salary estimate
 * @param specialization - Role specialization
 * @returns Comparison result
 */
export function compareWithMarket(
  estimate: SalaryEstimate,
  specialization: SpesialisasiRole
): {
  vsMarketMedian: 'below' | 'at' | 'above';
  percentDiff: number;
  marketPosition: string;
} {
  // Get market median for specialization
  const baseLevel = getExperienceLevel(estimate.factors.yearsOfExperience);
  if (!baseLevel) {
    return {
      vsMarketMedian: 'at',
      percentDiff: 0,
      marketPosition: 'unknown',
    };
  }
  
  const specializationMultiplier = getSpecializationMultiplier(specialization);
  const marketMedian = baseLevel.baseSalary.median * specializationMultiplier;
  
  const percentDiff = ((estimate.median - marketMedian) / marketMedian) * 100;
  
  let vsMarketMedian: 'below' | 'at' | 'above';
  if (percentDiff < -10) {
    vsMarketMedian = 'below';
  } else if (percentDiff > 10) {
    vsMarketMedian = 'above';
  } else {
    vsMarketMedian = 'at';
  }
  
  const marketPosition = 
    percentDiff < -20 ? 'significantly below market' :
    percentDiff < -10 ? 'below market' :
    percentDiff < 10 ? 'at market rate' :
    percentDiff < 20 ? 'above market' :
    'significantly above market';
  
  return {
    vsMarketMedian,
    percentDiff,
    marketPosition,
  };
}

/**
 * Get salary estimate for display
 * 
 * @param estimate - Salary estimate
 * @returns Human-readable description
 */
export function getSalaryDescription(estimate: SalaryEstimate): string {
  const { formattedRange, confidence, factors } = estimate;
  
  return [
    `Estimated salary: ${formattedRange}`,
    `Confidence: ${confidence}`,
    `Based on ${factors.yearsOfExperience} years as ${factors.specialization} in ${factors.location}`,
  ].join('\n');
}

// ============================================================================
// Export
// ============================================================================

// Types and functions are exported via 'export' declarations above
