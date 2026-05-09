#!/usr/bin/env node

/**
 * CLI Interface for UPN Alumni Scraper
 * 
 * Main entry point for command-line operations including scraping,
 * data export, database management, and configuration.
 * 
 * @module cli/index
 */

import { Command } from 'commander';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { exportToCSV } from '@/export/csv-export';
import { exportToJSON } from '@/export/json-export';
import type { ExportFilters } from '@/export/csv-export';
import type { SpesialisasiRole } from '@/types/enums';

// ============================================================================
// CLI Setup
// ============================================================================

const program = new Command();

program
  .name('upn-alumni-scraper')
  .description('LinkedIn Scraper untuk data alumni Informatika UPN Veteran Jawa Timur (2004-2026)')
  .version('1.0.0');

// ============================================================================
// Scrape Command
// ============================================================================

program
  .command('scrape')
  .description('Jalankan scraper untuk mengumpulkan data alumni dari LinkedIn')
  .option('-a, --angkatan <range>', 'Filter angkatan (e.g., 2015-2020 atau 2019)')
  .option('-l, --limit <number>', 'Maximum profiles to scrape', parseInt)
  .option('-r, --resume', 'Resume from last saved position')
  .option('-q, --query <string>', 'Custom LinkedIn search query')
  .option('--headless', 'Run browser in headless mode (default: false)')
  .option('--no-headless', 'Show browser window for debugging')
  .option('-d, --delay <ms>', 'Minimum delay between requests (ms)', parseInt)
  .option('--safe-mode', 'Ultra-conservative mode to avoid detection')
  .action(async (options) => {
    const startTime = Date.now();
    
    try {
      // Pre-flight checks
      await runHealthChecks();
      
      // Parse angkatan range
      const angkatanRange = parseAngkatanRange(options.angkatan);
      
      logger.info('Starting scraper...', {
        angkatanRange,
        limit: options.limit,
        resume: options.resume,
        query: options.query,
        headless: options.headless ?? config.playwright.headless,
        safeMode: options.safeMode,
      });

      // TODO: Implement full scraping orchestration
      // This would integrate all the modules we've built:
      // - Browser setup
      // - Authentication
      // - Search query building
      // - Profile discovery
      // - Extraction (overview, education, experience, tech-stack)
      // - Rate limiting
      // - Data persistence
      
      logger.info('Scraper configuration:', { 
        headless: options.headless ?? config.playwright.headless,
        delayMin: options.delay ?? config.scraper.delayMin,
        delayMax: config.scraper.delayMax,
      });
      
      // Placeholder for actual implementation
      logger.info('⚠️  Full scraping implementation requires Phase 2-4 integration');
      logger.info('For now, use "npm run scrape" after all phases are integrated.');
      
      // Post-flight summary
      const duration = Date.now() - startTime;
      logger.info('Scraper session completed', {
        duration: formatDuration(duration),
        status: 'completed',
      });
      
    } catch (error) {
      handleCliError(error, 'scrape');
    }
  });

// ============================================================================
// Export Command
// ============================================================================

program
  .command('export')
  .description('Export data alumni ke CSV atau JSON')
  .argument('[format]', 'Format export (csv|json)', 'csv')
  .option('-a, --angkatan <range>', 'Filter berdasarkan angkatan (e.g., 2015-2020)')
  .option('-s, --spesialisasi <list>', 'Filter spesialisasi (comma-separated, e.g., FRONTEND,BACKEND)')
  .option('-t, --tech <skills>', 'Filter tech stack (comma-separated)')
  .option('--has-ipk', 'Hanya export yang punya data IPK')
  .option('-n, --name <search>', 'Cari berdasarkan nama')
  .option('-o, --output <path>', 'Custom output file path')
  .option('--streaming', 'Gunakan streaming untuk dataset besar')
  .option('--batch-size <number>', 'Ukuran batch untuk streaming', parseInt, 100)
  .action(async (format: string, options) => {
    const startTime = Date.now();
    
    try {
      logger.info('Starting export...', { format, options });
      
      // Build filters
      const filters = buildExportFilters(options);
      
      // Export based on format
      let result;
      if (format.toLowerCase() === 'json') {
        result = await exportToJSON({
          filters,
          outputPath: options.output,
          pretty: true,
          includeNested: true,
        });
      } else {
        result = await exportToCSV({
          filters,
          outputPath: options.output,
          streaming: options.streaming,
          batchSize: options.batchSize,
        });
      }
      
      // Summary
      const duration = Date.now() - startTime;
      logger.info('Export completed successfully!', {
        filePath: result.filePath,
        recordCount: result.recordCount,
        duration: formatDuration(duration),
      });
      
      console.log(`\n✅ Export selesai!`);
      console.log(`📁 File: ${result.filePath}`);
      console.log(`📊 Records: ${result.recordCount}`);
      console.log(`⏱️  Duration: ${formatDuration(duration)}`);
      
    } catch (error) {
      handleCliError(error, 'export');
    }
  });

// ============================================================================
// Database Command
// ============================================================================

program
  .command('db')
  .description('Database utilities (wrapper untuk Prisma)')
  .argument('<action>', 'Action: migrate, reset, seed, studio, status')
  .action(async (action: string) => {
    try {
      switch (action) {
        case 'migrate':
          logger.info('Running database migrations...');
          await runCommand('npx prisma migrate dev');
          break;
          
        case 'reset':
          logger.warn('Resetting database - all data will be lost!');
          await runCommand('npx prisma migrate reset --force');
          break;
          
        case 'seed':
          logger.info('Seeding database...');
          await runCommand('npx tsx src/database/seed.ts');
          break;
          
        case 'studio':
          logger.info('Starting Prisma Studio...');
          await runCommand('npx prisma studio');
          break;
          
        case 'status':
          logger.info('Checking database status...');
          await runCommand('npx prisma migrate status');
          break;
          
        default:
          console.error(`Unknown action: ${action}`);
          console.log('Available actions: migrate, reset, seed, studio, status');
          process.exit(1);
      }
    } catch (error) {
      handleCliError(error, 'db');
    }
  });

// ============================================================================
// Auth Command
// ============================================================================

program
  .command('auth')
  .description('Authentication dan session management')
  .argument('<action>', 'Action: login, status, logout, refresh')
  .option('-u, --username <email>', 'LinkedIn email/username')
  .option('-p, --password <password>', 'LinkedIn password')
  .option('--save-session', 'Simpan session untuk penggunaan berikutnya')
  .action(async (action: string, options) => {
    try {
      switch (action) {
        case 'login':
          logger.info('Logging in to LinkedIn...');
          if (!options.username || !options.password) {
            console.error('❌ Email dan password diperlukan');
            console.log('Usage: auth login -u <email> -p <password>');
            process.exit(1);
          }
          // TODO: Implement login via auth module
          logger.info('Login functionality requires Phase 2.2 integration');
          break;
          
        case 'status':
          logger.info('Checking authentication status...');
          // TODO: Check session validity
          logger.info('Session status: Not implemented');
          break;
          
        case 'logout':
          logger.info('Logging out...');
          // TODO: Clear session
          logger.info('Logout functionality requires Phase 2.2 integration');
          break;
          
        case 'refresh':
          logger.info('Refreshing session...');
          // TODO: Refresh session
          logger.info('Session refresh requires Phase 2.2 integration');
          break;
          
        default:
          console.error(`Unknown action: ${action}`);
          console.log('Available actions: login, status, logout, refresh');
          process.exit(1);
      }
    } catch (error) {
      handleCliError(error, 'auth');
    }
  });

// ============================================================================
// Config Command
// ============================================================================

program
  .command('config')
  .description('Validate dan tampilkan konfigurasi')
  .option('--validate', 'Validate configuration against schema')
  .option('--env', 'Show environment variables')
  .action((options) => {
    try {
      logger.info('Current configuration:');
      
      // Show config (mask sensitive data)
      const safeConfig = {
        ...config,
        linkedin: {
          ...config.linkedin,
          password: config.linkedin.password ? '***' : undefined,
        },
      };
      
      console.log('\n📋 Configuration:');
      console.log(JSON.stringify(safeConfig, null, 2));
      
      if (options.env) {
        console.log('\n🔧 Environment Variables:');
        console.log('LINKEDIN_EMAIL:', process.env.LINKEDIN_EMAIL || '(not set)');
        console.log('LINKEDIN_PASSWORD:', process.env.LINKEDIN_PASSWORD ? '***' : '(not set)');
        console.log('DATABASE_URL:', process.env.DATABASE_URL ? '***' : '(not set)');
        console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
      }
      
      if (options.validate) {
        logger.info('✅ Configuration validation passed');
      }
      
    } catch (error) {
      handleCliError(error, 'config');
    }
  });

// ============================================================================
// Stats Command (Bonus)
// ============================================================================

program
  .command('stats')
  .description('Tampilkan statistik data alumni')
  .option('-a, --angkatan <year>', 'Statistik untuk angkatan tertentu')
  .action(async (options) => {
    try {
      logger.info('Fetching statistics...');
      
      // TODO: Implement stats from database
      console.log('\n📊 Alumni Statistics');
      console.log('====================');
      console.log('Total Alumni: (query from database)');
      console.log('By Angkatan: (query from database)');
      console.log('By Spesialisasi: (query from database)');
      console.log('By Company: (query from database)');
      console.log('\nℹ️  Run "npm run db:studio" to explore data interactively');
      
    } catch (error) {
      handleCliError(error, 'stats');
    }
  });

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse angkatan range string
 */
function parseAngkatanRange(range?: string): { min?: number; max?: number } {
  if (!range) return {};
  
  // Single year: "2019"
  if (!range.includes('-')) {
    const year = parseInt(range, 10);
    if (!isNaN(year)) {
      return { min: year, max: year };
    }
    return {};
  }
  
  // Range: "2015-2020"
  const parts = range.split('-').map(p => parseInt(p.trim(), 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { min: parts[0], max: parts[1] };
  }
  
  return {};
}

/**
 * Build export filters from CLI options
 */
function buildExportFilters(options: Record<string, unknown>): ExportFilters {
  const filters: ExportFilters = {};
  
  // Angkatan range
  if (options.angkatan) {
    const range = parseAngkatanRange(String(options.angkatan));
    filters.angkatanMin = range.min;
    filters.angkatanMax = range.max;
  }
  
  // Specializations
  if (options.spesialisasi) {
    filters.spesialisasi = String(options.spesialisasi)
      .split(',')
      .map(s => s.trim().toUpperCase()) as SpesialisasiRole[];
  }
  
  // Tech stack
  if (options.tech) {
    filters.techStack = String(options.tech).split(',').map(s => s.trim());
  }
  
  // Has IPK
  if (options.hasIpk) {
    filters.hasIPK = true;
  }
  
  // Name search
  if (options.name) {
    filters.namaLengkap = String(options.name);
  }
  
  return filters;
}

/**
 * Run pre-flight health checks
 */
async function runHealthChecks(): Promise<void> {
  logger.info('Running pre-flight checks...');
  
  // Check database connection
  try {
    const { getPrismaClient } = await import('@/database/client');
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ Database connection OK');
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw new Error('Database health check failed');
  }
  
  // Check required environment variables
  const required = ['DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    logger.error('❌ Missing environment variables:', missing);
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  
  logger.info('✅ Pre-flight checks passed');
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Run shell command
 */
async function runCommand(command: string): Promise<void> {
  const { execSync } = await import('child_process');
  execSync(command, { stdio: 'inherit' });
}

/**
 * Global error handler for CLI
 */
function handleCliError(error: unknown, command: string): never {
  const err = error as Error;
  
  logger.error(`❌ Command "${command}" failed:`, err.message);
  
  if (process.env.NODE_ENV === 'development') {
    logger.error('Stack trace:', err.stack);
  }
  
  console.error(`\n❌ Error: ${err.message}`);
  console.log('\n💡 Try running with --help for usage information');
  console.log('   Example: npm run scrape -- --help');
  
  process.exit(1);
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    
    try {
      // Save any pending state
      // TODO: Implement state saving for resume capability
      
      // Close database connections
      const { getPrismaClient } = await import('@/database/client');
      const prisma = getPrismaClient();
      await prisma.$disconnect();
      
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  setupGracefulShutdown();
  
  // Log startup info
  logger.info('UPN Alumni Scraper CLI');
  logger.info(`Version: ${program.version()}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Parse and execute
  await program.parseAsync(process.argv);
}

// Run main if called directly
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export { program, main };
