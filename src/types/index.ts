// Alumni data types
export interface AlumniData {
  id?: string;
  namaLengkap: string;
  angkatan: number | null;
  tahunLulus: number | null;
  ipk: number | null;
  linkedInUrl: string;
  fotoProfil: string | null;
  spesialisasi: SpesialisasiRole | null;
  pekerjaanSaatIni: Pekerjaan | null;
  perusahaanSaatIni: string | null;
  riwayatPekerjaan: Pekerjaan[];
  techStack: TechStack[];
  gajiEstimasi: GajiEstimasi | null;
  createdAt?: Date;
  updatedAt?: Date;
  lastScrapedAt?: Date;
}

export interface Pekerjaan {
  id?: string;
  posisi: string;
  perusahaan: string;
  isCurrent: boolean;
  tanggalMulai: Date | null;
  tanggalSelesai: Date | null;
  lokasi: string | null;
  deskripsi: string | null;
}

export interface TechStack {
  id?: string;
  nama: string;
  kategori: TechCategory;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert' | null;
}

export interface GajiEstimasi {
  min: number;
  max: number;
  median: number;
  currency: string;
  confidence: 'low' | 'medium' | 'high';
  isEstimated: boolean;
}

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

export enum TechCategory {
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

// Scraping types
export interface ScrapingConfig {
  delayMin: number;
  delayMax: number;
  maxRetries: number;
  retryBaseDelay: number;
  concurrentBrowsersLimit: number;
  dailyProfileQuota: number;
  hourlyProfileQuota: number;
  headless: boolean;
}

export interface ScrapingResult {
  success: boolean;
  data?: AlumniData;
  error?: ScrapingError;
  retryCount: number;
  duration: number;
}

export interface ScrapingError {
  type: ErrorType;
  message: string;
  url: string;
  timestamp: Date;
  stackTrace?: string;
}

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

export enum ScrapingStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
  SKIPPED = 'SKIPPED',
}

// Session types
export interface LinkedInCredentials {
  email: string;
  password: string;
}

export interface SessionData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

// Export types
export interface ExportFilters {
  angkatanMin?: number;
  angkatanMax?: number;
  spesialisasi?: SpesialisasiRole[];
  techStack?: string[];
  currentCompany?: string;
  hasIPK?: boolean;
}

export interface ExportOptions {
  format: 'csv' | 'json';
  outputPath?: string;
  filters?: ExportFilters;
  includeNested?: boolean;
  prettyPrint?: boolean;
}
