/**
 * Application Enums
 * 
 * Centralized enum definitions for type safety across the application.
 * These enums mirror the Prisma schema enums for consistency.
 */

/**
 * Spesialisasi/Role yang dimiliki oleh alumni
 */
export enum SpesialisasiRole {
  FRONTEND = 'FRONTEND',
  BACKEND = 'BACKEND',
  FULLSTACK = 'FULLSTACK',
  AI_ENGINEER = 'AI_ENGINEER',
  DATA_SCIENTIST = 'DATA_SCIENTIST',
  DEVOPS = 'DEVOPS',
  MOBILE = 'MOBILE',
  GAME_DEV = 'GAME_DEV',
  SECURITY = 'SECURITY',
  QA_ENGINEER = 'QA_ENGINEER',
  LAINNYA = 'LAINNYA',
}

/**
 * Kategori dari tech stack
 */
export enum TechStackCategory {
  LANGUAGE = 'LANGUAGE',
  FRAMEWORK = 'FRAMEWORK',
  DATABASE = 'DATABASE',
  CLOUD = 'CLOUD',
  DEVOPS = 'DEVOPS',
  AI_ML = 'AI_ML',
  TOOL = 'TOOL',
  LIBRARY = 'LIBRARY',
  MOBILE = 'MOBILE',
  OTHER = 'OTHER',
}

/**
 * Status dari proses scraping
 */
export enum ScrapingStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
  SKIPPED = 'SKIPPED',
}

/**
 * Jenis error yang terjadi saat scraping
 */
export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  PARSING_ERROR = 'PARSING_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  BROWSER_ERROR = 'BROWSER_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Level keahlian dalam tech stack
 */
export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

/**
 * Browser yang didukung oleh Playwright
 */
export enum SupportedBrowser {
  CHROMIUM = 'chromium',
  FIREFOX = 'firefox',
  WEBKIT = 'webkit',
}

/**
 * Format export yang didukung
 */
export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

/**
 * Level log yang tersedia
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Helper function untuk mendapatkan semua values dari enum
 * @param enumObj - Enum object
 * @returns Array of enum values
 */
export function getEnumValues<T extends Record<string, string>>(enumObj: T): string[] {
  return Object.values(enumObj);
}

/**
 * Helper function untuk validasi enum value
 * @param enumObj - Enum object
 * @param value - Value yang akan dicek
 * @returns boolean
 */
export function isValidEnumValue<T extends Record<string, string>>(
  enumObj: T,
  value: string
): value is T[keyof T] {
  return Object.values(enumObj).includes(value);
}
