/**
 * @fileoverview Core TypeScript interfaces and types for the UPN Alumni Scraper
 * @description Contains all data structures for alumni data, scraping configuration,
 * error handling, and export options. Fully typed with no 'any' usage.
 */

// Import enums from enums.ts for use in this file
import {
  SpesialisasiRole,
  TechStackCategory,
  ScrapingStatus,
  ErrorType,
  SkillLevel,
} from './enums';

/**
 * Data lengkap alumni yang di-extract dari LinkedIn
 * @interface AlumniData
 */
export interface AlumniData {
  /** UUID dari database (optional untuk new records) */
  id?: string;
  /** Nama lengkap alumni */
  namaLengkap: string;
  /** Tahun masuk kuliah (2004-2026) */
  angkatan: number | null;
  /** Tahun lulus kuliah */
  tahunLulus: number | null;
  /** IPK dalam skala 4.0 */
  ipk: number | null;
  /** URL profil LinkedIn (unik) */
  linkedInUrl: string;
  /** URL foto profil (jika public) */
  fotoProfil: string | null;
  /** Spesialisasi/role saat ini */
  spesialisasi: SpesialisasiRole | null;
  /** Pekerjaan saat ini (derived dari riwayatPekerjaan) */
  pekerjaanSaatIni: Pekerjaan | null;
  /** Perusahaan saat ini (derived dari riwayatPekerjaan) */
  perusahaanSaatIni: string | null;
  /** Seluruh riwayat pekerjaan */
  riwayatPekerjaan: Pekerjaan[];
  /** Tech stack yang dikuasai */
  techStack: TechStack[];
  /** Estimasi gaji (optional) */
  gajiEstimasi: GajiEstimasi | null;
  /** Tanggal record dibuat */
  createdAt?: Date;
  /** Tanggal record terakhir diupdate */
  updatedAt?: Date;
  /** Tanggal terakhir di-scrape */
  lastScrapedAt?: Date;
}

/**
 * Informasi pekerjaan/posisi
 * @interface Pekerjaan
 */
export interface Pekerjaan {
  id?: string;
  /** Jabatan/posisi (e.g., "Senior Software Engineer") */
  posisi: string;
  /** Nama perusahaan */
  perusahaan: string;
  /** Apakah ini pekerjaan saat ini */
  isCurrent: boolean;
  /** Tanggal mulai bekerja */
  tanggalMulai: Date | null;
  /** Tanggal selesai (null jika masih bekerja) */
  tanggalSelesai: Date | null;
  /** Lokasi pekerjaan */
  lokasi: string | null;
  /** Deskripsi pekerjaan */
  deskripsi: string | null;
}

/**
 * Tech stack yang dikuasai alumni
 * @interface TechStack
 */
export interface TechStack {
  id?: string;
  /** Nama tool/technology (e.g., "React", "Python") */
  nama: string;
  /** Kategori tech stack */
  kategori: TechStackCategory;
  /** Level keahlian (opsional) */
  level: SkillLevel | null;
}

/**
 * Estimasi gaji berdasarkan market data
 * @interface GajiEstimasi
 */
export interface GajiEstimasi {
  /** Gaji minimum dalam IDR */
  min: number;
  /** Gaji maksimum dalam IDR */
  max: number;
  /** Gaji median dalam IDR */
  median: number;
  /** Mata uang (default: IDR) */
  currency: string;
  /** Confidence level dari estimasi */
  confidence: 'low' | 'medium' | 'high';
  /** Apakah ini hasil estimasi atau data aktual */
  isEstimated: boolean;
}

// Re-export enums from enums.ts for backward compatibility
export {
  SpesialisasiRole,
  TechStackCategory as TechCategory,
  ScrapingStatus,
  ErrorType,
  SkillLevel,
  SupportedBrowser,
  ExportFormat,
  LogLevel,
} from './enums';

/**
 * Konfigurasi untuk proses scraping
 * @interface ScrapingConfig
 */
export interface ScrapingConfig {
  /** Delay minimum antar request dalam ms */
  delayMin: number;
  /** Delay maksimum antar request dalam ms */
  delayMax: number;
  /** Jumlah maksimum retry untuk failed request */
  maxRetries: number;
  /** Delay dasar untuk retry dalam ms */
  retryBaseDelay: number;
  /** Limit concurrent browser instances */
  concurrentBrowsersLimit: number;
  /** Maximum profiles per day untuk avoid ban */
  dailyProfileQuota: number;
  /** Maximum profiles per hour */
  hourlyProfileQuota: number;
  /** Run browser in headless mode */
  headless: boolean;
}

/**
 * Hasil dari satu kali scraping attempt
 * @interface ScrapingResult
 */
export interface ScrapingResult {
  /** Apakah scraping berhasil */
  success: boolean;
  /** Data alumni yang berhasil di-extract */
  data?: AlumniData;
  /** Error detail jika gagal */
  error?: ScrapingError;
  /** Jumlah retry yang dilakukan */
  retryCount: number;
  /** Durasi scraping dalam ms */
  duration: number;
}

/**
 * Detail error saat scraping
 * @interface ScrapingError
 */
export interface ScrapingError {
  /** Jenis error yang terjadi */
  type: ErrorType;
  /** Pesan error */
  message: string;
  /** URL yang sedang di-scrape */
  url: string;
  /** Timestamp saat error terjadi */
  timestamp: Date;
  /** Stack trace untuk debugging */
  stackTrace?: string;
}

/**
 * Kredensial untuk login LinkedIn
 * @interface LinkedInCredentials
 */
export interface LinkedInCredentials {
  /** Email LinkedIn */
  email: string;
  /** Password LinkedIn */
  password: string;
}

/**
 * Data session browser untuk persistence
 * @interface SessionData
 */
export interface SessionData {
  /** Array cookies dari browser */
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
  /** Local storage data */
  localStorage?: Record<string, string>;
  /** Session storage data */
  sessionStorage?: Record<string, string>;
  /** User agent string */
  userAgent?: string;
  /** Browser viewport dimensions */
  viewport?: {
    width: number;
    height: number;
  };
}

/**
 * Filter untuk export data
 * @interface ExportFilters
 */
export interface ExportFilters {
  /** Filter angkatan minimum */
  angkatanMin?: number;
  /** Filter angkatan maksimum */
  angkatanMax?: number;
  /** Filter berdasarkan spesialisasi */
  spesialisasi?: SpesialisasiRole[];
  /** Filter berdasarkan tech stack */
  techStack?: string[];
  /** Filter berdasarkan perusahaan saat ini */
  currentCompany?: string;
  /** Hanya export yang punya data IPK */
  hasIPK?: boolean;
}

/**
 * Options untuk export data
 * @interface ExportOptions
 */
export interface ExportOptions {
  /** Format export: csv atau json */
  format: 'csv' | 'json';
  /** Path output file (optional, auto-generated kalau tidak diisi) */
  outputPath?: string;
  /** Filter yang akan diaplikasikan */
  filters?: ExportFilters;
  /** Include nested objects untuk JSON */
  includeNested?: boolean;
  /** Pretty print JSON output */
  prettyPrint?: boolean;
}
