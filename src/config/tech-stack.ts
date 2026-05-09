/**
 * Tech Stack Master List & Configuration
 * 
 * Predefined list of popular tech stacks with fuzzy matching support
 * for standardizing skill names and categorization.
 * 
 * @module config/tech-stack
 */

import { TechStackCategory } from '@/types/enums';

// ============================================================================
// Tech Stack Definitions by Category
// ============================================================================

/**
 * Programming Languages
 */
export const PROGRAMMING_LANGUAGES = [
  // JavaScript ecosystem
  { name: 'JavaScript', aliases: ['JS', 'Javascript', 'ECMAScript', 'ES6', 'ES2015'], category: TechStackCategory.LANGUAGE },
  { name: 'TypeScript', aliases: ['TS', 'Typescript'], category: TechStackCategory.LANGUAGE },
  { name: 'Node.js', aliases: ['NodeJS', 'Node'], category: TechStackCategory.LANGUAGE },
  
  // Python
  { name: 'Python', aliases: ['Py'], category: TechStackCategory.LANGUAGE },
  
  // Java
  { name: 'Java', aliases: ['J2EE', 'J2SE'], category: TechStackCategory.LANGUAGE },
  
  // C-family
  { name: 'C', aliases: [], category: TechStackCategory.LANGUAGE },
  { name: 'C++', aliases: ['CPP', 'C Plus Plus', 'C/C++'], category: TechStackCategory.LANGUAGE },
  { name: 'C#', aliases: ['CSharp', 'C Sharp', '.NET'], category: TechStackCategory.LANGUAGE },
  
  // Web
  { name: 'PHP', aliases: ['PHP7', 'PHP8'], category: TechStackCategory.LANGUAGE },
  { name: 'HTML', aliases: ['HTML5'], category: TechStackCategory.LANGUAGE },
  { name: 'CSS', aliases: ['CSS3'], category: TechStackCategory.LANGUAGE },
  { name: 'Sass', aliases: ['SCSS', 'SASS'], category: TechStackCategory.LANGUAGE },
  { name: 'Less', aliases: [], category: TechStackCategory.LANGUAGE },
  
  // Mobile
  { name: 'Swift', aliases: [], category: TechStackCategory.LANGUAGE },
  { name: 'Kotlin', aliases: [], category: TechStackCategory.LANGUAGE },
  { name: 'Dart', aliases: [], category: TechStackCategory.LANGUAGE },
  
  // Systems/Other
  { name: 'Go', aliases: ['Golang'], category: TechStackCategory.LANGUAGE },
  { name: 'Rust', aliases: [], category: TechStackCategory.LANGUAGE },
  { name: 'Ruby', aliases: ['Rails'], category: TechStackCategory.LANGUAGE },
  { name: 'Scala', aliases: [], category: TechStackCategory.LANGUAGE },
  { name: 'R', aliases: [], category: TechStackCategory.LANGUAGE },
  { name: 'MATLAB', aliases: [], category: TechStackCategory.LANGUAGE },
  { name: 'Shell', aliases: ['Bash', 'Zsh', 'Shell Script'], category: TechStackCategory.LANGUAGE },
  { name: 'SQL', aliases: ['T-SQL', 'PL/SQL'], category: TechStackCategory.LANGUAGE },
];

/**
 * Frontend Technologies (using FRAMEWORK category)
 */
const FRONTEND_TECH = [
  // Frameworks
  { name: 'React', aliases: ['ReactJS', 'React.js', 'React Native'], category: TechStackCategory.FRAMEWORK },
  { name: 'Vue', aliases: ['VueJS', 'Vue.js'], category: TechStackCategory.FRAMEWORK },
  { name: 'Angular', aliases: ['AngularJS', 'Angular.js'], category: TechStackCategory.FRAMEWORK },
  { name: 'Svelte', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'Next.js', aliases: ['NextJS'], category: TechStackCategory.FRAMEWORK },
  { name: 'Nuxt', aliases: ['NuxtJS', 'Nuxt.js'], category: TechStackCategory.FRAMEWORK },
  { name: 'Gatsby', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'Remix', aliases: [], category: TechStackCategory.FRAMEWORK },
  
  // State Management
  { name: 'Redux', aliases: ['Redux Toolkit', 'RTK'], category: TechStackCategory.LIBRARY },
  { name: 'Zustand', aliases: [], category: TechStackCategory.LIBRARY },
  { name: 'MobX', aliases: [], category: TechStackCategory.LIBRARY },
  { name: 'Pinia', aliases: [], category: TechStackCategory.LIBRARY },
  
  // Styling
  { name: 'TailwindCSS', aliases: ['Tailwind', 'Tailwind CSS'], category: TechStackCategory.FRAMEWORK },
  { name: 'Bootstrap', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'Material UI', aliases: ['MUI', 'Material-UI'], category: TechStackCategory.FRAMEWORK },
  { name: 'Chakra UI', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'Ant Design', aliases: ['AntD'], category: TechStackCategory.FRAMEWORK },
  { name: 'Styled Components', aliases: ['Styled-Components'], category: TechStackCategory.LIBRARY },
  
  // Build Tools
  { name: 'Webpack', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Vite', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Parcel', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Babel', aliases: [], category: TechStackCategory.TOOL },
  { name: 'ESLint', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Prettier', aliases: [], category: TechStackCategory.TOOL },
];

/**
 * Backend Technologies (using FRAMEWORK category)
 */
const BACKEND_TECH = [
  // Node.js
  { name: 'Express', aliases: ['ExpressJS', 'Express.js'], category: TechStackCategory.FRAMEWORK },
  { name: 'NestJS', aliases: ['Nest.js'], category: TechStackCategory.FRAMEWORK },
  { name: 'Fastify', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'Koa', aliases: [], category: TechStackCategory.FRAMEWORK },
  
  // Python
  { name: 'Django', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'Flask', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'FastAPI', aliases: [], category: TechStackCategory.FRAMEWORK },
  
  // Java
  { name: 'Spring', aliases: ['Spring Boot', 'SpringBoot'], category: TechStackCategory.FRAMEWORK },
  { name: 'Jakarta EE', aliases: ['Java EE', 'J2EE'], category: TechStackCategory.FRAMEWORK },
  
  // PHP
  { name: 'Laravel', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'Symfony', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'CodeIgniter', aliases: [], category: TechStackCategory.FRAMEWORK },
  
  // Go
  { name: 'Gin', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'Echo', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'Fiber', aliases: [], category: TechStackCategory.FRAMEWORK },
  
  // APIs
  { name: 'GraphQL', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'REST API', aliases: ['REST', 'RESTful'], category: TechStackCategory.FRAMEWORK },
  { name: 'gRPC', aliases: [], category: TechStackCategory.FRAMEWORK },
  { name: 'WebSocket', aliases: ['Socket.io'], category: TechStackCategory.LIBRARY },
];

/**
 * Database Technologies
 */
const DATABASE_TECH = [
  // Relational
  { name: 'PostgreSQL', aliases: ['Postgres'], category: TechStackCategory.DATABASE },
  { name: 'MySQL', aliases: [], category: TechStackCategory.DATABASE },
  { name: 'MariaDB', aliases: [], category: TechStackCategory.DATABASE },
  { name: 'SQLite', aliases: [], category: TechStackCategory.DATABASE },
  { name: 'Oracle', aliases: ['Oracle DB'], category: TechStackCategory.DATABASE },
  { name: 'SQL Server', aliases: ['MSSQL'], category: TechStackCategory.DATABASE },
  
  // NoSQL
  { name: 'MongoDB', aliases: ['Mongo'], category: TechStackCategory.DATABASE },
  { name: 'Redis', aliases: [], category: TechStackCategory.DATABASE },
  { name: 'Cassandra', aliases: [], category: TechStackCategory.DATABASE },
  { name: 'DynamoDB', aliases: [], category: TechStackCategory.DATABASE },
  { name: 'Firebase', aliases: ['Firestore'], category: TechStackCategory.DATABASE },
  { name: 'Elasticsearch', aliases: ['Elastic'], category: TechStackCategory.DATABASE },
  
  // ORM/Tools
  { name: 'Prisma', aliases: [], category: TechStackCategory.LIBRARY },
  { name: 'Sequelize', aliases: [], category: TechStackCategory.LIBRARY },
  { name: 'TypeORM', aliases: [], category: TechStackCategory.LIBRARY },
  { name: 'Mongoose', aliases: [], category: TechStackCategory.LIBRARY },
  { name: 'Hibernate', aliases: [], category: TechStackCategory.LIBRARY },
];

/**
 * Cloud & DevOps
 */
const CLOUD_DEVOPS_TECH = [
  // Cloud Providers
  { name: 'AWS', aliases: ['Amazon Web Services', 'Amazon AWS'], category: TechStackCategory.CLOUD },
  { name: 'Azure', aliases: ['Microsoft Azure'], category: TechStackCategory.CLOUD },
  { name: 'GCP', aliases: ['Google Cloud', 'Google Cloud Platform'], category: TechStackCategory.CLOUD },
  { name: 'DigitalOcean', aliases: ['DO'], category: TechStackCategory.CLOUD },
  { name: 'Heroku', aliases: [], category: TechStackCategory.CLOUD },
  { name: 'Vercel', aliases: [], category: TechStackCategory.CLOUD },
  { name: 'Netlify', aliases: [], category: TechStackCategory.CLOUD },
  
  // Containers & Orchestration
  { name: 'Docker', aliases: [], category: TechStackCategory.DEVOPS },
  { name: 'Kubernetes', aliases: ['K8s'], category: TechStackCategory.DEVOPS },
  { name: 'Helm', aliases: [], category: TechStackCategory.DEVOPS },
  { name: 'Docker Compose', aliases: [], category: TechStackCategory.DEVOPS },
  
  // CI/CD
  { name: 'Jenkins', aliases: [], category: TechStackCategory.DEVOPS },
  { name: 'GitHub Actions', aliases: [], category: TechStackCategory.DEVOPS },
  { name: 'GitLab CI', aliases: ['GitLab CI/CD'], category: TechStackCategory.DEVOPS },
  { name: 'CircleCI', aliases: [], category: TechStackCategory.DEVOPS },
  { name: 'Travis CI', aliases: ['Travis'], category: TechStackCategory.DEVOPS },
  { name: 'Azure DevOps', aliases: ['Azure Pipelines'], category: TechStackCategory.DEVOPS },
  
  // Infrastructure
  { name: 'Terraform', aliases: [], category: TechStackCategory.DEVOPS },
  { name: 'Ansible', aliases: [], category: TechStackCategory.DEVOPS },
  { name: 'Pulumi', aliases: [], category: TechStackCategory.DEVOPS },
  { name: 'CloudFormation', aliases: [], category: TechStackCategory.DEVOPS },
  
  // Monitoring
  { name: 'Prometheus', aliases: [], category: TechStackCategory.DEVOPS },
  { name: 'Grafana', aliases: [], category: TechStackCategory.DEVOPS },
  { name: 'Datadog', aliases: [], category: TechStackCategory.DEVOPS },
];

/**
 * AI/ML Technologies
 */
const AI_ML_TECH = [
  // Frameworks
  { name: 'TensorFlow', aliases: ['TF'], category: TechStackCategory.AI_ML },
  { name: 'PyTorch', aliases: [], category: TechStackCategory.AI_ML },
  { name: 'Keras', aliases: [], category: TechStackCategory.AI_ML },
  { name: 'Scikit-learn', aliases: ['Sklearn'], category: TechStackCategory.AI_ML },
  { name: 'Pandas', aliases: [], category: TechStackCategory.AI_ML },
  { name: 'NumPy', aliases: ['Numpy'], category: TechStackCategory.AI_ML },
  { name: 'OpenCV', aliases: [], category: TechStackCategory.AI_ML },
  
  // AI Services
  { name: 'OpenAI', aliases: ['GPT', 'ChatGPT'], category: TechStackCategory.AI_ML },
  { name: 'HuggingFace', aliases: ['Transformers'], category: TechStackCategory.AI_ML },
  { name: 'LangChain', aliases: [], category: TechStackCategory.AI_ML },
  { name: 'LlamaIndex', aliases: [], category: TechStackCategory.AI_ML },
  { name: 'Pinecone', aliases: [], category: TechStackCategory.AI_ML },
  
  // MLOps
  { name: 'MLflow', aliases: [], category: TechStackCategory.AI_ML },
  { name: 'Kubeflow', aliases: [], category: TechStackCategory.AI_ML },
  { name: 'Weights & Biases', aliases: ['WandB'], category: TechStackCategory.AI_ML },
];

/**
 * Tools & Others
 */
const TOOLS = [
  // Version Control
  { name: 'Git', aliases: [], category: TechStackCategory.TOOL },
  { name: 'GitHub', aliases: [], category: TechStackCategory.TOOL },
  { name: 'GitLab', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Bitbucket', aliases: [], category: TechStackCategory.TOOL },
  
  // Project Management
  { name: 'Jira', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Trello', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Asana', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Monday.com', aliases: [], category: TechStackCategory.TOOL },
  
  // Design
  { name: 'Figma', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Adobe XD', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Sketch', aliases: [], category: TechStackCategory.TOOL },
  
  // Testing
  { name: 'Jest', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Cypress', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Playwright', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Selenium', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Mocha', aliases: [], category: TechStackCategory.TOOL },
  { name: 'Chai', aliases: [], category: TechStackCategory.TOOL },
  
  // IDEs & Editors
  { name: 'VS Code', aliases: ['Visual Studio Code', 'Code'], category: TechStackCategory.TOOL },
  { name: 'IntelliJ IDEA', aliases: ['IntelliJ'], category: TechStackCategory.TOOL },
  { name: 'WebStorm', aliases: [], category: TechStackCategory.TOOL },
  { name: 'PyCharm', aliases: [], category: TechStackCategory.TOOL },
];

// ============================================================================
// Combined Master List
// ============================================================================

/**
 * All tech stack definitions
 */
export const ALL_TECH_STACK = [
  ...PROGRAMMING_LANGUAGES,
  ...FRONTEND_TECH,
  ...BACKEND_TECH,
  ...DATABASE_TECH,
  ...CLOUD_DEVOPS_TECH,
  ...AI_ML_TECH,
  ...TOOLS,
];

// ============================================================================
// Lookup Maps for Fast Matching
// ============================================================================

/**
 * Map of normalized skill names to standard names
 */
export const SKILL_ALIAS_MAP: Map<string, string> = new Map();

/**
 * Map of standard names to tech definitions
 */
export const TECH_DEFINITION_MAP: Map<string, typeof ALL_TECH_STACK[0]> = new Map();

/**
 * Map of skill names to categories
 */
export const SKILL_CATEGORY_MAP: Map<string, TechStackCategory> = new Map();

// Initialize lookup maps
for (const tech of ALL_TECH_STACK) {
  const normalized = normalizeTechName(tech.name);
  
  // Map main name
  SKILL_ALIAS_MAP.set(normalized, tech.name);
  TECH_DEFINITION_MAP.set(tech.name, tech);
  SKILL_CATEGORY_MAP.set(tech.name, tech.category);
  
  // Map aliases
  for (const alias of tech.aliases) {
    const normalizedAlias = normalizeTechName(alias);
    SKILL_ALIAS_MAP.set(normalizedAlias, tech.name);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize tech name for matching
 * 
 * @param name - Raw skill name
 * @returns Normalized name
 */
export function normalizeTechName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-.]+/g, '') // Remove spaces, hyphens, dots
    .replace(/[\(\)]/g, '') // Remove parentheses
    .trim();
}

/**
 * Calculate similarity between two strings (Levenshtein-based)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0 && len2 === 0) return 1;
  if (len1 === 0 || len2 === 0) return 0;
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[len1][len2];
  return 1 - distance / Math.max(len1, len2);
}

/**
 * Find matching tech name with fuzzy matching
 * 
 * @param skillName - Raw skill name from profile
 * @param threshold - Minimum similarity threshold (0-1)
 * @returns Standardized tech name or null
 */
export function findTechMatch(skillName: string, threshold: number = 0.8): string | null {
  const normalized = normalizeTechName(skillName);
  
  // Exact match
  if (SKILL_ALIAS_MAP.has(normalized)) {
    return SKILL_ALIAS_MAP.get(normalized)!;
  }
  
  // Fuzzy match
  let bestMatch: string | null = null;
  let bestScore = 0;
  
  for (const [alias, standardName] of SKILL_ALIAS_MAP) {
    const score = calculateSimilarity(normalized, alias);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = standardName;
    }
  }
  
  return bestMatch;
}

/**
 * Get category for a tech skill
 * 
 * @param skillName - Tech skill name
 * @returns Category or undefined
 */
export function getTechCategory(skillName: string): TechStackCategory | undefined {
  return SKILL_CATEGORY_MAP.get(skillName);
}

/**
 * Get all skills in a category
 * 
 * @param category - Tech stack category
 * @returns Array of skill names
 */
export function getSkillsByCategory(category: TechStackCategory): string[] {
  const skills: string[] = [];
  
  for (const [name, cat] of SKILL_CATEGORY_MAP) {
    if (cat === category) {
      skills.push(name);
    }
  }
  
  return skills;
}

/**
 * Check if a skill is a tech skill (vs soft skill)
 * 
 * @param skillName - Skill name to check
 * @returns True if tech skill
 */
export function isTechSkill(skillName: string): boolean {
  const match = findTechMatch(skillName, 0.7);
  return match !== null;
}

// ============================================================================
// Specialization Scoring
// ============================================================================

/**
 * Score thresholds for specialization detection
 */
export const SPECIALIZATION_THRESHOLDS = {
  FRONTEND: {
    // Frontend-focused: React, Vue, Angular, CSS frameworks
    [TechStackCategory.FRAMEWORK]: 3,
    [TechStackCategory.LANGUAGE]: 2,
  },
  BACKEND: {
    // Backend-focused: Express, Django, Spring + Database
    [TechStackCategory.FRAMEWORK]: 3,
    [TechStackCategory.DATABASE]: 2,
    [TechStackCategory.LANGUAGE]: 2,
  },
  FULLSTACK: {
    // Both frontend and backend frameworks
    [TechStackCategory.FRAMEWORK]: 4,
    [TechStackCategory.DATABASE]: 1,
    [TechStackCategory.LANGUAGE]: 2,
  },
  DEVOPS: {
    [TechStackCategory.DEVOPS]: 3,
    [TechStackCategory.CLOUD]: 2,
  },
  AI_ENGINEER: {
    [TechStackCategory.AI_ML]: 3,
    [TechStackCategory.LANGUAGE]: 2,
  },
  MOBILE: {
    // Mobile detection based on specific skills
    required: ['React Native', 'Flutter', 'Swift', 'Kotlin'],
    minCount: 2,
  },
  DATA_ENGINEER: {
    [TechStackCategory.DATABASE]: 3,
    [TechStackCategory.AI_ML]: 1,
  },
};

// ============================================================================
// Export
// ============================================================================

// All tech arrays are already exported with 'export const' above
