/**
 * Tech Stack & Skills Extraction
 * 
 * Extracts tools, programming languages, and tech stack from LinkedIn profiles
 * from the skills section and job descriptions.
 * 
 * Features:
 * - Skills section scraping with endorsement extraction
 * - Tech stack categorization using master list
 * - Job description keyword extraction
 * - Specialization/role derivation based on skills
 * 
 * @module scraper/extraction/tech-stack
 */

import type { Page } from 'playwright';
import { logger } from '@/utils/logger';
import { randomDelay } from '@/scraper/rate-limiter';
import { SpesialisasiRole, TechStackCategory } from '@/types/enums';
import { 
  findTechMatch, 
  getTechCategory, 
  isTechSkill,
  SPECIALIZATION_THRESHOLDS,
  normalizeTechName,
} from '@/config/tech-stack';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Skill entry extracted from LinkedIn
 */
export interface SkillEntry {
  /** Skill name */
  skillName: string;
  /** Normalized/standardized name */
  normalizedName?: string;
  /** Number of endorsements */
  endorsementCount: number;
  /** Tech category if applicable */
  category?: TechStackCategory;
  /** Whether this is a tech skill */
  isTechSkill: boolean;
  /** Skill score based on endorsements and relevance */
  score: number;
}

/**
 * Tech stack extraction result
 */
export interface TechStackResult {
  /** All extracted skills */
  skills: SkillEntry[];
  /** Only tech skills */
  techSkills: SkillEntry[];
  /** Skills grouped by category */
  skillsByCategory: Record<TechStackCategory, SkillEntry[]>;
  /** Derived specialization */
  specialization: SpesialisasiRole;
  /** Confidence score for specialization (0-1) */
  specializationConfidence: number;
  /** Total tech skill score */
  totalTechScore: number;
  /** Top skills (highest scored) */
  topSkills: string[];
}

/**
 * Extraction configuration
 */
export interface TechStackExtractionConfig {
  /** Timeout for element selection */
  elementTimeout: number;
  /** Whether to expand skills section */
  expandSection: boolean;
  /** Maximum skills to extract */
  maxSkills: number;
  /** Minimum endorsement count to consider */
  minEndorsements: number;
  /** Whether to extract from descriptions */
  extractFromDescriptions: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: TechStackExtractionConfig = {
  elementTimeout: 5000,
  expandSection: true,
  maxSkills: 50,
  minEndorsements: 0,
  extractFromDescriptions: true,
};

// ============================================================================
// Selectors
// ============================================================================

const SKILLS_SELECTORS = {
  // Section containers
  section: '.skills-section, #skills-section, .pv-skill-categories-section',
  
  // Show all button
  showAllButton: [
    '.skills-section .pv-profile-section__see-all',
    '.skills-section .artdeco-button:has-text("Show all")',
    '[data-testid="show-all-skills"]',
    'button:has-text("Show all skills")',
  ],
  
  // Individual skill entries
  skillItem: [
    '.pv-skill-category-entity',
    '.skill-category-entity',
    '[data-testid="skill-item"]',
    '.artdeco-entity-lockup__content',
  ],
  
  // Skill fields
  skillName: [
    '.pv-skill-category-entity__name',
    '.skill-category-entity__name',
    '[data-testid="skill-name"]',
    '.artdeco-entity-lockup__title',
    'span[aria-hidden="true"]',
  ],
  endorsementCount: [
    '.pv-skill-category-entity__endorsement-count',
    '.skill-category-entity__endorsement-count',
    '[data-testid="endorsement-count"]',
    '.artdeco-entity-lockup__metadata',
    '.t-black--light',
  ],
};

// ============================================================================
// Skills Section Extraction
// ============================================================================

/**
 * Extract skills from LinkedIn profile
 * 
 * @param page - Playwright page instance
 * @param config - Extraction configuration
 * @returns Array of skill entries
 */
export async function extractSkills(
  page: Page,
  config?: Partial<TechStackExtractionConfig>
): Promise<SkillEntry[]> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const skills: SkillEntry[] = [];
  
  logger.info('Extracting skills...');
  
  try {
    // Check if skills section exists
    const sectionExists = await page.locator(SKILLS_SELECTORS.section).count() > 0;
    if (!sectionExists) {
      logger.warn('Skills section not found');
      return skills;
    }
    
    // Expand section if needed
    if (opts.expandSection) {
      await expandSkillsSection(page);
    }
    
    // Extract all skills
    for (const itemSelector of SKILLS_SELECTORS.skillItem) {
      const skillElements = await page.locator(itemSelector).all();
      
      for (const element of skillElements.slice(0, opts.maxSkills)) {
        try {
          const skill = await extractSkillEntry(element, opts);
          if (skill) {
            skills.push(skill);
          }
        } catch (error) {
          logger.debug('Failed to extract skill entry:', error);
          continue;
        }
      }
      
      if (skills.length > 0) break;
    }
    
    logger.info(`Extracted ${skills.length} skills`);
    return skills;
    
  } catch (error) {
    logger.error('Failed to extract skills:', error);
    return skills;
  }
}

/**
 * Extract single skill entry
 */
async function extractSkillEntry(
  element: ReturnType<Page['locator']>,
  config: TechStackExtractionConfig
): Promise<SkillEntry | null> {
  // Extract skill name
  const skillName = await extractField(element, SKILLS_SELECTORS.skillName);
  if (!skillName) return null;
  
  // Clean and normalize
  const cleanName = skillName.trim();
  
  // Extract endorsement count
  const endorsementText = await extractField(element, SKILLS_SELECTORS.endorsementCount);
  let endorsementCount = 0;
  
  if (endorsementText) {
    // Parse number from text like "99+" or "50"
    const match = endorsementText.match(/(\d+)/);
    if (match) {
      endorsementCount = parseInt(match[1], 10);
    }
  }
  
  // Skip if below minimum endorsements
  if (endorsementCount < config.minEndorsements) {
    return null;
  }
  
  // Check if tech skill and normalize
  const isTech = isTechSkill(cleanName);
  const normalizedName = findTechMatch(cleanName, 0.8);
  const category = normalizedName ? getTechCategory(normalizedName) : undefined;
  
  // Calculate score
  const score = calculateSkillScore(cleanName, endorsementCount, isTech);
  
  return {
    skillName: cleanName,
    normalizedName: normalizedName || undefined,
    endorsementCount,
    category,
    isTechSkill: isTech,
    score,
  };
}

/**
 * Expand skills section
 */
async function expandSkillsSection(page: Page): Promise<void> {
  for (const selector of SKILLS_SELECTORS.showAllButton) {
    try {
      const button = page.locator(selector).first();
      const visible = await button.isVisible().catch(() => false);
      
      if (visible) {
        await button.click();
        await randomDelay(1000, 2000);
        logger.debug('Expanded skills section');
        return;
      }
    } catch {
      continue;
    }
  }
}

/**
 * Calculate skill score based on various factors
 */
function calculateSkillScore(
  skillName: string,
  endorsements: number,
  isTech: boolean
): number {
  let score = 0;
  
  // Base score from endorsements (max 50 points)
  score += Math.min(endorsements, 50);
  
  // Bonus for tech skills
  if (isTech) {
    score += 25;
  }
  
  // Bonus for programming languages
  const normalized = normalizeTechName(skillName);
  const langKeywords = ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php'];
  if (langKeywords.some(kw => normalized.includes(kw))) {
    score += 15;
  }
  
  return score;
}

// ============================================================================
// Job Description Tech Extraction
// ============================================================================

/**
 * Extract tech keywords from job description
 * 
 * @param description - Job description text
 * @returns Array of found tech keywords
 */
export function extractTechFromDescription(description: string): string[] {
  if (!description) return [];
  
  const foundTech: string[] = [];
  const normalized = description.toLowerCase();
  
  // Common tech keywords to look for
  const techKeywords = [
    // Languages
    'javascript', 'typescript', 'python', 'java', 'go', 'golang', 'rust', 'php', 'c++', 'c#',
    // Frontend
    'react', 'vue', 'angular', 'nextjs', 'tailwind', 'css', 'html',
    // Backend
    'nodejs', 'express', 'django', 'spring', 'laravel',
    // Database
    'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
    // Cloud/DevOps
    'aws', 'docker', 'kubernetes', 'terraform', 'jenkins',
    // AI/ML
    'tensorflow', 'pytorch', 'pandas', 'machine learning',
    // Tools
    'git', 'github', 'jira', 'figma',
  ];
  
  for (const keyword of techKeywords) {
    // Check for word boundaries
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(normalized)) {
      // Try to normalize to standard name
      const normalized = findTechMatch(keyword, 0.8);
      if (normalized && !foundTech.includes(normalized)) {
        foundTech.push(normalized);
      }
    }
  }
  
  return foundTech;
}

// ============================================================================
// Specialization Derivation
// ============================================================================

/**
 * Derive specialization based on skills and experience
 * 
 * @param skills - Extracted skills
 * @returns Specialization role
 */
export function deriveSpecialization(skills: SkillEntry[]): SpesialisasiRole {
  if (skills.length === 0) {
    return SpesialisasiRole.LAINNYA;
  }
  
  // Filter to tech skills only
  const techSkills = skills.filter(s => s.isTechSkill);
  
  // Count skills by category
  const categoryCounts: Record<string, number> = {};
  for (const skill of techSkills) {
    if (skill.category) {
      categoryCounts[skill.category] = (categoryCounts[skill.category] || 0) + 1;
    }
  }
  
  // Check for mobile skills first (specific detection)
  const mobileSkills = techSkills.filter(s => 
    ['React Native', 'Flutter', 'Swift', 'Kotlin', 'iOS', 'Android'].some(
      mobile => s.skillName.toLowerCase().includes(mobile.toLowerCase())
    )
  );
  
  if (mobileSkills.length >= 2) {
    return SpesialisasiRole.MOBILE;
  }
  
  // Score each specialization
  const scores: Record<string, number> = {};
  
  // FRONTEND: Frontend frameworks + languages
  scores.FRONTEND = (categoryCounts['FRAMEWORK'] || 0) * 2 +
                    (categoryCounts['LANGUAGE'] || 0);
  
  // BACKEND: Backend frameworks + databases
  scores.BACKEND = (categoryCounts['FRAMEWORK'] || 0) * 2 +
                   (categoryCounts['DATABASE'] || 0);
  
  // FULLSTACK: Mix of frontend and backend
  scores.FULLSTACK = (categoryCounts['FRAMEWORK'] || 0) * 1.5 +
                     (categoryCounts['DATABASE'] || 0) * 0.5;
  
  // DEVOPS
  scores.DEVOPS = (categoryCounts['DEVOPS'] || 0) * 3 +
                  (categoryCounts['CLOUD'] || 0) * 2;
  
  // AI/ML
  scores.AI_ML = (categoryCounts['AI_ML'] || 0) * 3;
  
  // DATA SCIENTIST
  scores.DATA_SCIENTIST = (categoryCounts['DATABASE'] || 0) * 2 +
                         (categoryCounts['AI_ML'] || 0);
  
  // Find highest score
  let bestSpecialization = SpesialisasiRole.LAINNYA;
  let maxScore = 0;
  
  const specializationMap: Record<string, SpesialisasiRole> = {
    'FRONTEND': SpesialisasiRole.FRONTEND,
    'BACKEND': SpesialisasiRole.BACKEND,
    'FULLSTACK': SpesialisasiRole.FULLSTACK,
    'DEVOPS': SpesialisasiRole.DEVOPS,
    'AI_ML': SpesialisasiRole.AI_ENGINEER,
    'DATA_SCIENTIST': SpesialisasiRole.DATA_SCIENTIST,
  };
  
  for (const [key, score] of Object.entries(scores)) {
    // Apply thresholds
    const threshold = SPECIALIZATION_THRESHOLDS[key as keyof typeof SPECIALIZATION_THRESHOLDS];
    let meetsThreshold = false;
    
    if (threshold && 'required' in threshold) {
      // Mobile-style threshold with required skills
      meetsThreshold = true; // Already checked above
    } else if (threshold) {
      // Category-based threshold
      const categoryThresholds = threshold as Record<string, number>;
      let meetsCategories = true;
      for (const [cat, minCount] of Object.entries(categoryThresholds)) {
        if ((categoryCounts[cat] || 0) < minCount) {
          meetsCategories = false;
          break;
        }
      }
      meetsThreshold = meetsCategories;
    }
    
    if (score > maxScore && meetsThreshold) {
      maxScore = score;
      bestSpecialization = specializationMap[key] || SpesialisasiRole.LAINNYA;
    }
  }
  
  // Check confidence - if score is too low, return LAINNYA
  if (maxScore < 5) {
    return SpesialisasiRole.LAINNYA;
  }
  
  return bestSpecialization;
}

/**
 * Calculate specialization confidence
 */
function calculateSpecializationConfidence(
  specialization: SpesialisasiRole,
  skills: SkillEntry[]
): number {
  const techSkills = skills.filter(s => s.isTechSkill);
  
  if (techSkills.length === 0) return 0;
  
  // Base confidence on number of tech skills
  let confidence = Math.min(techSkills.length / 10, 0.5);
  
  // Boost if specialization-specific skills are highly endorsed
  const highEndorsementSkills = techSkills.filter(s => s.endorsementCount >= 10);
  confidence += highEndorsementSkills.length * 0.05;
  
  // Cap at 1.0
  return Math.min(confidence, 1.0);
}

// ============================================================================
// Tech Stack Aggregation
// ============================================================================

/**
 * Extract complete tech stack from profile
 * 
 * @param page - Playwright page instance
 * @param jobDescriptions - Optional job descriptions for additional extraction
 * @param config - Extraction configuration
 * @returns Complete tech stack result
 */
export async function extractTechStack(
  page: Page,
  jobDescriptions?: string[],
  config?: Partial<TechStackExtractionConfig>
): Promise<TechStackResult> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  
  // Extract skills from skills section
  const skills = await extractSkills(page, opts);
  
  // Extract additional tech from job descriptions
  if (opts.extractFromDescriptions && jobDescriptions) {
    for (const description of jobDescriptions) {
      const techKeywords = extractTechFromDescription(description);
      
      for (const keyword of techKeywords) {
        // Check if not already in skills
        if (!skills.some(s => s.normalizedName === keyword || s.skillName.toLowerCase() === keyword.toLowerCase())) {
          const isTech = true;
          const category = getTechCategory(keyword);
          
          skills.push({
            skillName: keyword,
            normalizedName: keyword,
            endorsementCount: 0, // No endorsements from description
            category,
            isTechSkill: isTech,
            score: 10, // Base score for description-extracted skills
          });
        }
      }
    }
  }
  
  // Filter tech skills
  const techSkills = skills.filter(s => s.isTechSkill);
  
  // Group by category
  const skillsByCategory: Record<TechStackCategory, SkillEntry[]> = {
    [TechStackCategory.LANGUAGE]: [],
    [TechStackCategory.FRAMEWORK]: [],
    [TechStackCategory.DATABASE]: [],
    [TechStackCategory.CLOUD]: [],
    [TechStackCategory.DEVOPS]: [],
    [TechStackCategory.AI_ML]: [],
    [TechStackCategory.TOOL]: [],
    [TechStackCategory.LIBRARY]: [],
    [TechStackCategory.MOBILE]: [],
    [TechStackCategory.OTHER]: [],
  };
  
  for (const skill of techSkills) {
    if (skill.category) {
      skillsByCategory[skill.category].push(skill);
    }
  }
  
  // Sort by score and get top skills
  const sortedTechSkills = [...techSkills].sort((a, b) => b.score - a.score);
  const topSkills = sortedTechSkills.slice(0, 10).map(s => s.normalizedName || s.skillName);
  
  // Derive specialization
  const specialization = deriveSpecialization(skills);
  const specializationConfidence = calculateSpecializationConfidence(specialization, skills);
  
  // Calculate total tech score
  const totalTechScore = techSkills.reduce((sum, s) => sum + s.score, 0);
  
  return {
    skills,
    techSkills,
    skillsByCategory,
    specialization,
    specializationConfidence,
    totalTechScore,
    topSkills,
  };
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
 * Categorize skill by name
 */
export function categorizeSkill(skillName: string): TechStackCategory | undefined {
  const normalized = findTechMatch(skillName, 0.8);
  if (normalized) {
    return getTechCategory(normalized);
  }
  return undefined;
}

// ============================================================================
// Export
// ============================================================================

// Types and functions are exported via 'export' declarations above
