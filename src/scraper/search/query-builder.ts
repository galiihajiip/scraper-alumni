/**
 * LinkedIn Search Query Builder
 * 
 * Builds optimized search URLs and queries for finding UPN Veteran alumni
 * on LinkedIn with various filters and parameters.
 * 
 * Features:
 * - Search URL generator for LinkedIn
 * - Alumni-specific query variations
 * - Filter parameters (school, year, location)
 * - Query performance tracking
 * - URL encoding and sanitization
 * 
 * @module scraper/search/query-builder
 */

import { logger } from '@/utils/logger';

// ============================================================================
// Constants & School Information
// ============================================================================

/**
 * UPN Veteran Jawa Timur name variations for search queries
 */
export const UPN_SCHOOL_NAMES = [
  'Universitas Pembangunan Nasional Veteran Jawa Timur',
  'UPN Veteran Jawa Timur',
  'UPN Veteran Jatim',
  'UPN Veteran East Java',
  'Universitas Pembangunan Nasional Veteran Jatim',
  'UPN Jawa Timur',
  'UPN Jatim',
];

/**
 * Major/department variations for Informatika
 */
export const INFORMATIKA_MAJOR_NAMES = [
  'Teknik Informatika',
  'Informatika',
  'S1 Informatika',
  'Sarjana Informatika',
  'Teknik Informatika UPN',
  'Informatika UPN',
  'Informatika UPN Veteran',
];

/**
 * LinkedIn school IDs (these would need to be discovered from LinkedIn)
 * Placeholder values - actual IDs should be fetched from LinkedIn
 */
export const LINKEDIN_SCHOOL_IDS: Record<string, string> = {
  'upn_veteran_jatim': '12345678', // Placeholder - should be fetched
};

/**
 * LinkedIn geo URNs for location filtering
 */
export const LINKEDIN_GEO_URNS: Record<string, string> = {
  'indonesia': '102478259',
  'east_java': '90000084',
  'surabaya': '106407502',
  'jatim': '90000084',
};

/**
 * Year ranges for batch/angkatan filtering
 */
export const YEAR_RANGES: {
  min: number;
  max: number;
  batches: Array<{ start: number; end: number; label: string }>;
} = {
  min: 2004,
  max: 2026,
  // Predefined ranges for search batches
  batches: [
    { start: 2004, end: 2008, label: '2004-2008' },
    { start: 2009, end: 2013, label: '2009-2013' },
    { start: 2014, end: 2018, label: '2014-2018' },
    { start: 2019, end: 2023, label: '2019-2023' },
    { start: 2024, end: 2026, label: '2024-2026' },
  ],
};

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Search URL parameters
 */
export interface SearchParams {
  /** Keywords for search */
  keywords?: string;
  /** Location name or geo URN */
  location?: string;
  /** Current company name */
  currentCompany?: string;
  /** Past company name */
  pastCompany?: string;
  /** School name or ID */
  school?: string;
  /** Graduation year range */
  yearRange?: { start: number; end: number };
  /** Search result count limit */
  count?: number;
}

/**
 * LinkedIn filter parameters for URL building
 */
export interface LinkedInFilters {
  /** School filter (comma-separated IDs) */
  schoolFilter?: string;
  /** Location geo URN */
  geoUrn?: string;
  /** Date range for graduation */
  dateRange?: string;
  /** Keywords */
  keywords?: string;
  /** Current company filter */
  currentCompany?: string;
  /** Past company filter */
  pastCompany?: string;
  /** Industry filter */
  industry?: string;
  /** Function/role filter */
  function?: string;
  /** Profile language */
  language?: string;
}

/**
 * Query performance tracking
 */
export interface QueryPerformance {
  query: string;
  url: string;
  profilesFound: number;
  executionTime: number;
  timestamp: Date;
  success: boolean;
}

// ============================================================================
// URL Generation
// ============================================================================

/**
 * Build LinkedIn search URL with filters
 * 
 * @param params - Search parameters
 * @returns LinkedIn search URL
 */
export function buildSearchUrl(params: SearchParams): string {
  const baseUrl = 'https://www.linkedin.com/search/results/people/';
  const queryParams = new URLSearchParams();
  
  // Add keywords
  if (params.keywords) {
    queryParams.set('keywords', sanitizeQuery(params.keywords));
  }
  
  // Add filters
  const filters: string[] = [];
  
  // School filter
  if (params.school) {
    const schoolId = getSchoolId(params.school);
    if (schoolId) {
      filters.push(`schoolFilter=>${schoolId}`);
    }
  }
  
  // Location filter
  if (params.location) {
    const geoUrn = LINKEDIN_GEO_URNS[params.location.toLowerCase()] || params.location;
    filters.push(`geoUrn=>${geoUrn}`);
  }
  
  // Year range filter (graduation year approximation via date range)
  if (params.yearRange) {
    // LinkedIn uses dateRange for "dates attended"
    // We'll approximate by using the end year
    const endYear = params.yearRange.end;
    // Format: dateRange=>present,2024 or dateRange=>2014,2024
    filters.push(`dateRange=>,${endYear}`);
  }
  
  // Add filters to query params
  if (filters.length > 0) {
    queryParams.set('filters', filters.join(','));
  }
  
  // Origin parameter (required for LinkedIn)
  queryParams.set('origin', 'FACETED_SEARCH');
  
  return `${baseUrl}?${queryParams.toString()}`;
}

/**
 * Build LinkedIn Sales Navigator search URL (if available)
 * 
 * @param params - Search parameters
 * @returns Sales Navigator search URL
 */
export function buildSalesNavigatorUrl(params: SearchParams): string {
  const baseUrl = 'https://www.linkedin.com/sales/search/people/';
  const queryParams = new URLSearchParams();
  
  // Sales Navigator uses different parameter structure
  if (params.keywords) {
    queryParams.set('query', sanitizeQuery(params.keywords));
  }
  
  if (params.school) {
    queryParams.set('school', params.school);
  }
  
  if (params.location) {
    queryParams.set('geoIncluded', LINKEDIN_GEO_URNS[params.location.toLowerCase()] || params.location);
  }
  
  if (params.currentCompany) {
    queryParams.set('companyIncluded', params.currentCompany);
  }
  
  queryParams.set('doSearch', 'true');
  
  return `${baseUrl}?${queryParams.toString()}`;
}

/**
 * Build Google search URL as alternative (X-Ray search)
 * 
 * @param params - Search parameters
 * @returns Google search URL for LinkedIn X-Ray
 */
export function buildGoogleXRayUrl(params: SearchParams): string {
  // X-Ray search: site:linkedin.com/in "school name" "keyword"
  let query = 'site:linkedin.com/in';
  
  if (params.school) {
    query += ` "${params.school}"`;
  }
  
  if (params.keywords) {
    query += ` ${params.keywords}`;
  }
  
  if (params.location) {
    query += ` "${params.location}"`;
  }
  
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// ============================================================================
// Alumni-Specific Queries
// ============================================================================

/**
 * Generate all UPN search query variations
 * 
 * @returns Array of search queries with school names
 */
export function generateUPNSearchQueries(): string[] {
  const queries: string[] = [];
  
  // Base school name queries
  queries.push(...UPN_SCHOOL_NAMES);
  
  // Informatika + UPN combinations
  for (const major of INFORMATIKA_MAJOR_NAMES) {
    for (const school of UPN_SCHOOL_NAMES.slice(0, 3)) { // Top 3 school variations
      queries.push(`${major} ${school}`);
    }
  }
  
  // Alumni + school combinations
  queries.push(...UPN_SCHOOL_NAMES.map(s => `Alumni ${s}`));
  queries.push(...UPN_SCHOOL_NAMES.map(s => `Lulusan ${s}`));
  
  logger.info(`Generated ${queries.length} UPN search query variations`);
  
  return queries;
}

/**
 * Generate year-filtered queries for batch searching
 * 
 * @returns Array of queries with year ranges
 */
export function generateYearFilteredQueries(): Array<{ query: string; yearRange: { start: number; end: number } }> {
  const queries: Array<{ query: string; yearRange: { start: number; end: number } }> = [];
  
  for (const batch of YEAR_RANGES.batches) {
    // Query with year range
    const query = `UPN Veteran Jatim ${batch.label}`;
    queries.push({ query, yearRange: batch });
    
    // Informatika specific
    queries.push({
      query: `Informatika UPN Veteran ${batch.label}`,
      yearRange: batch,
    });
  }
  
  return queries;
}

/**
 * Generate search URLs for all UPN queries
 * 
 * @returns Array of search URLs with metadata
 */
export function generateAllUPNSearchUrls(): Array<{ 
  url: string; 
  query: string; 
  yearRange?: { start: number; end: number };
}> {
  const results: Array<{ url: string; query: string; yearRange?: { start: number; end: number } }> = [];
  
  // Basic school queries
  const schoolQueries = generateUPNSearchQueries();
  for (const query of schoolQueries) {
    results.push({
      url: buildSearchUrl({
        keywords: query,
        location: 'indonesia',
      }),
      query,
    });
  }
  
  // Year filtered queries
  const yearQueries = generateYearFilteredQueries();
  for (const { query, yearRange } of yearQueries) {
    results.push({
      url: buildSearchUrl({
        keywords: query,
        location: 'indonesia',
        yearRange,
      }),
      query,
      yearRange,
    });
  }
  
  return results;
}

// ============================================================================
// Query Optimization
// ============================================================================

// Query performance cache
const queryPerformanceCache = new Map<string, QueryPerformance>();

/**
 * Track query performance
 * 
 * @param query - Search query
 * @param url - Search URL
 * @param profilesFound - Number of profiles found
 * @param executionTime - Execution time in ms
 * @param success - Whether query succeeded
 */
export function trackQueryPerformance(
  query: string,
  url: string,
  profilesFound: number,
  executionTime: number,
  success: boolean
): void {
  const performance: QueryPerformance = {
    query,
    url,
    profilesFound,
    executionTime,
    timestamp: new Date(),
    success,
  };
  
  queryPerformanceCache.set(query, performance);
  
  logger.info(
    `Query performance: "${query}" - ${profilesFound} profiles in ${executionTime}ms`
  );
}

/**
 * Get optimized queries sorted by performance
 * 
 * @returns Array of queries sorted by profiles found (descending)
 */
export function getOptimizedQueries(): QueryPerformance[] {
  return Array.from(queryPerformanceCache.values())
    .filter(p => p.success)
    .sort((a, b) => b.profilesFound - a.profilesFound);
}

/**
 * Get best performing queries
 * 
 * @param limit - Number of top queries to return
 * @returns Top performing queries
 */
export function getTopQueries(limit: number = 10): QueryPerformance[] {
  return getOptimizedQueries().slice(0, limit);
}

/**
 * Clear performance cache
 */
export function clearPerformanceCache(): void {
  queryPerformanceCache.clear();
  logger.info('Query performance cache cleared');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get LinkedIn school ID from name
 * 
 * @param schoolName - School name or identifier
 * @returns School ID or undefined
 */
function getSchoolId(schoolName: string): string | undefined {
  // Check if it's already an ID
  if (/^\d+$/.test(schoolName)) {
    return schoolName;
  }
  
  // Check cache/lookup
  const normalized = schoolName.toLowerCase().replace(/\s+/g, '_');
  return LINKEDIN_SCHOOL_IDS[normalized as keyof typeof LINKEDIN_SCHOOL_IDS];
}

/**
 * Sanitize search query for URL
 * 
 * @param query - Raw query string
 * @returns Sanitized query
 */
function sanitizeQuery(query: string): string {
  // Remove special characters that might break LinkedIn search
  return query
    .replace(/[<>'"]/g, '') // Remove HTML/special chars
    .trim();
}

/**
 * Encode URL parameters safely
 * 
 * @param params - Parameters to encode
 * @returns Encoded URL string
 */
export function encodeSearchParams(params: Record<string, string>): string {
  const searchParams = new URLSearchParams();
  
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }
  
  return searchParams.toString();
}

/**
 * Parse LinkedIn search URL to extract parameters
 * 
 * @param url - LinkedIn search URL
 * @returns Parsed parameters
 */
export function parseSearchUrl(url: string): Partial<SearchParams> {
  try {
    const urlObj = new URL(url);
    const params: Partial<SearchParams> = {};
    
    // Extract keywords
    const keywords = urlObj.searchParams.get('keywords');
    if (keywords) {
      params.keywords = keywords;
    }
    
    // Extract filters
    const filters = urlObj.searchParams.get('filters');
    if (filters) {
      const filterParts = filters.split(',');
      for (const part of filterParts) {
        if (part.startsWith('schoolFilter=>')) {
          params.school = part.replace('schoolFilter=>', '');
        }
        if (part.startsWith('geoUrn=>')) {
          const geoUrn = part.replace('geoUrn=>', '');
          // Reverse lookup geo URN to location name
          const location = Object.entries(LINKEDIN_GEO_URNS)
            .find(([, urn]) => urn === geoUrn)?.[0];
          if (location) {
            params.location = location;
          }
        }
        if (part.startsWith('dateRange=>')) {
          const dateRange = part.replace('dateRange=>', '');
          const [, endYear] = dateRange.split(',');
          if (endYear) {
            const year = parseInt(endYear, 10);
            params.yearRange = { start: year - 4, end: year };
          }
        }
      }
    }
    
    return params;
  } catch (error) {
    logger.error('Failed to parse search URL:', error);
    return {};
  }
}

// ============================================================================
// School ID Discovery (for dynamic lookup)
// ============================================================================

/**
 * Cache for discovered school IDs
 */
const discoveredSchoolIds = new Map<string, string>();

/**
 * Discover LinkedIn school ID from directory
 * This would be called during initialization or on-demand
 * 
 * @param schoolName - School name to search
 * @returns Promise with school ID or undefined
 */
export async function discoverSchoolId(schoolName: string): Promise<string | undefined> {
  // Check cache first
  if (discoveredSchoolIds.has(schoolName)) {
    return discoveredSchoolIds.get(schoolName);
  }
  
  // Placeholder: In actual implementation, this would:
  // 1. Navigate to LinkedIn school directory
  // 2. Search for the school name
  // 3. Extract the ID from the URL or page
  // 4. Cache the result
  
  logger.info(`Discovering LinkedIn ID for school: ${schoolName}`);
  
  // Return undefined for now - requires actual scraping
  return undefined;
}

/**
 * Cache discovered school ID
 * 
 * @param schoolName - School name
 * @param schoolId - LinkedIn school ID
 */
export function cacheSchoolId(schoolName: string, schoolId: string): void {
  discoveredSchoolIds.set(schoolName, schoolId);
  logger.info(`Cached school ID for "${schoolName}": ${schoolId}`);
}

/**
 * Get all cached school IDs
 */
export function getCachedSchoolIds(): Map<string, string> {
  return new Map(discoveredSchoolIds);
}

// ============================================================================
// Export Constants
// ============================================================================

// Constants are already exported above
