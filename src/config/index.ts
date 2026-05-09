import dotenv from 'dotenv';
import { z } from 'zod';
import { logger } from '@/utils/logger';

// Load environment variables
dotenv.config();

// Environment schema validation
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // LinkedIn Auth
  LINKEDIN_EMAIL: z.string().email('LINKEDIN_EMAIL must be a valid email'),
  LINKEDIN_PASSWORD: z.string().min(1, 'LINKEDIN_PASSWORD is required'),
  
  // Playwright
  PLAYWRIGHT_HEADLESS: z.string().default('true').transform((v) => v === 'true'),
  PLAYWRIGHT_BROWSER: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  
  // Scraping
  SCRAPER_DELAY_MIN: z.string().default('2000').transform(Number),
  SCRAPER_DELAY_MAX: z.string().default('5000').transform(Number),
  MAX_RETRIES: z.string().default('3').transform(Number),
  RETRY_BASE_DELAY: z.string().default('1000').transform(Number),
  CONCURRENT_BROWSERS_LIMIT: z.string().default('1').transform(Number),
  DAILY_PROFILE_QUOTA: z.string().default('200').transform(Number),
  HOURLY_PROFILE_QUOTA: z.string().default('50').transform(Number),
  
  // Output
  OUTPUT_DIR: z.string().default('./data/exports'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // Stealth
  ENABLE_EXTRA_STEALTH: z.string().default('true').transform((v) => v === 'true'),
  USER_AGENTS: z.string().optional(),
  SESSION_MAX_AGE: z.string().default('24').transform(Number),
});

// Parse and validate environment
function loadConfig() {
  try {
    const env = envSchema.parse(process.env);
    
    // Validation logic
    if (env.SCRAPER_DELAY_MAX < env.SCRAPER_DELAY_MIN) {
      throw new Error('SCRAPER_DELAY_MAX must be greater than SCRAPER_DELAY_MIN');
    }
    
    if (env.MAX_RETRIES < 0 || env.MAX_RETRIES > 10) {
      throw new Error('MAX_RETRIES must be between 0 and 10');
    }
    
    logger.debug('Configuration loaded successfully');
    
    return {
      database: {
        url: env.DATABASE_URL,
      },
      linkedin: {
        email: env.LINKEDIN_EMAIL,
        password: env.LINKEDIN_PASSWORD,
      },
      playwright: {
        headless: env.PLAYWRIGHT_HEADLESS,
        browser: env.PLAYWRIGHT_BROWSER,
      },
      scraper: {
        delayMin: env.SCRAPER_DELAY_MIN,
        delayMax: env.SCRAPER_DELAY_MAX,
        maxRetries: env.MAX_RETRIES,
        retryBaseDelay: env.RETRY_BASE_DELAY,
        concurrentBrowsersLimit: env.CONCURRENT_BROWSERS_LIMIT,
        dailyProfileQuota: env.DAILY_PROFILE_QUOTA,
        hourlyProfileQuota: env.HOURLY_PROFILE_QUOTA,
      },
      output: {
        dir: env.OUTPUT_DIR,
        logLevel: env.LOG_LEVEL,
      },
      stealth: {
        enableExtraStealth: env.ENABLE_EXTRA_STEALTH,
        userAgents: env.USER_AGENTS ? env.USER_AGENTS.split(',') : [],
        sessionMaxAge: env.SESSION_MAX_AGE,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      logger.error(`Configuration validation failed:\n${issues}`);
    } else {
      logger.error('Failed to load configuration:', error);
    }
    process.exit(1);
  }
}

export const config = loadConfig();

// Type export for config structure
export type Config = typeof config;
