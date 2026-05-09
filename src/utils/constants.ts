/**
 * Application Constants
 */

// UPN Veteran Jatim variations for fuzzy matching
export const UPN_NAME_VARIATIONS = [
  'Universitas Pembangunan Nasional Veteran Jawa Timur',
  'Universitas Pembangunan Nasional "Veteran" Jawa Timur',
  'UPN Veteran Jawa Timur',
  'UPN Veteran Jatim',
  'UPN "Veteran" Jatim',
  'UPN Veteran East Java',
  'Universitas Pembangunan Nasional Veteran Jatim',
  'UPN Jawa Timur',
];

// LinkedIn school name variations
export const LINKEDIN_UPN_NAMES = [
  'Universitas Pembangunan Nasional "Veteran" Jawa Timur',
  'UPN "Veteran" Jawa Timur',
  'UPN Veteran Jawa Timur',
  'Universitas Pembangunan Nasional Veteran Jawa Timur',
];

// Target years for scraping
export const TARGET_ANGKATAN_RANGE = {
  min: 2000,
  max: 2026,
};

// Scraping delays (milliseconds)
export const DEFAULT_DELAYS = {
  MIN: 2000,
  MAX: 5000,
  SCROLL: 1000,
  TYPING: 100,
};

// Quota limits
export const DEFAULT_QUOTAS = {
  DAILY: 200,
  HOURLY: 50,
};

// Retry configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY: 1000,
  MAX_DELAY: 30000,
};

// LinkedIn URL patterns
export const LINKEDIN_PATTERNS = {
  PROFILE_URL: /^https:\/\/www\.linkedin\.com\/in\/[\w-]+\/?$/,
  SEARCH_URL: 'https://www.linkedin.com/search/results/people/',
  LOGIN_URL: 'https://www.linkedin.com/login',
};

// Selectors (will be updated as LinkedIn changes)
export const LINKEDIN_SELECTORS = {
  // Profile page
  profile: {
    name: 'h1',
    headline: '[data-testid="profile-headline"]',
    location: '[data-testid="profile-location"]',
    photo: '[data-testid="profile-photo"] img',
    about: '[data-testid="profile-about"]',
    experience: '[data-testid="profile-experience"]',
    education: '[data-testid="profile-education"]',
    skills: '[data-testid="profile-skills"]',
  },
  // Search results
  search: {
    results: '[data-testid="search-results-container"]',
    resultCards: '[data-testid="search-result-card"]',
    nextButton: '[data-testid="search-pagination-next"]',
  },
};

// Tech stack keywords for categorization
export const TECH_KEYWORDS = {
  LANGUAGES: [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Golang', 'PHP', 'C++', 'C#', 
    'Ruby', 'Swift', 'Kotlin', 'Rust', 'Scala', 'R', 'MATLAB', 'SQL', 'NoSQL',
  ],
  FRONTEND: [
    'React', 'React.js', 'Vue', 'Vue.js', 'Angular', 'Svelte', 'Next.js', 'Nuxt.js',
    'HTML', 'CSS', 'Sass', 'SCSS', 'Less', 'TailwindCSS', 'Bootstrap', 'Material UI',
    'Redux', 'Zustand', 'jQuery', 'Webpack', 'Vite', 'Gatsby', 'Gridsome',
  ],
  BACKEND: [
    'Node.js', 'Express', 'Express.js', 'NestJS', 'Django', 'Flask', 'FastAPI',
    'Spring', 'Spring Boot', 'Laravel', 'Symfony', 'Ruby on Rails', 'ASP.NET',
    'GraphQL', 'REST API', 'gRPC', 'WebSocket', 'Microservices',
  ],
  DATABASE: [
    'PostgreSQL', 'MySQL', 'MariaDB', 'MongoDB', 'Redis', 'Elasticsearch',
    'SQLite', 'Oracle', 'SQL Server', 'Cassandra', 'DynamoDB', 'Firebase',
    'Supabase', 'Prisma', 'TypeORM', 'Sequelize', 'Mongoose',
  ],
  CLOUD: [
    'AWS', 'Amazon Web Services', 'Google Cloud', 'GCP', 'Azure', 'Microsoft Azure',
    'Vercel', 'Netlify', 'Heroku', 'DigitalOcean', 'Linode', 'Alibaba Cloud',
  ],
  DEVOPS: [
    'Docker', 'Kubernetes', 'K8s', 'Jenkins', 'GitHub Actions', 'GitLab CI',
    'CircleCI', 'Travis CI', 'Terraform', 'Ansible', 'Puppet', 'Chef',
    'Prometheus', 'Grafana', 'ELK Stack', 'Nginx', 'Apache',
  ],
  AI_ML: [
    'TensorFlow', 'PyTorch', 'Keras', 'Scikit-learn', 'OpenAI', 'Hugging Face',
    'LangChain', 'Pandas', 'NumPy', 'Jupyter', 'MLflow', 'Kubeflow',
    'Computer Vision', 'NLP', 'Deep Learning', 'Machine Learning',
  ],
  MOBILE: [
    'React Native', 'Flutter', 'Swift', 'Kotlin', 'iOS', 'Android',
    'Xamarin', 'Ionic', 'Cordova', 'PhoneGap', 'Expo',
  ],
  TOOLS: [
    'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Jira', 'Confluence', 'Trello',
    'Figma', 'Sketch', 'Adobe XD', 'VS Code', 'IntelliJ', 'Postman',
    'Insomnia', 'Swagger', 'Notion', 'Slack', 'Discord',
  ],
};

// Specialization role mapping
export const ROLE_KEYWORDS: Record<string, string[]> = {
  FRONTEND: ['Frontend', 'Front-end', 'UI Developer', 'Web Developer', 'React Developer', 'Vue Developer'],
  BACKEND: ['Backend', 'Back-end', 'Server-side', 'API Developer', 'Node.js Developer'],
  FULLSTACK: ['Fullstack', 'Full-stack', 'Full Stack', 'Generalist'],
  AI_ENGINEER: ['AI Engineer', 'Machine Learning Engineer', 'ML Engineer', 'Deep Learning', 'AI Developer'],
  DATA_SCIENTIST: ['Data Scientist', 'Data Analyst', 'Data Engineer', 'Analytics', 'BI Developer'],
  DEVOPS: ['DevOps', 'SRE', 'Site Reliability', 'Platform Engineer', 'Infrastructure'],
  MOBILE: ['Mobile Developer', 'iOS Developer', 'Android Developer', 'React Native', 'Flutter'],
  GAME_DEV: ['Game Developer', 'Unity', 'Unreal Engine', 'Game Programmer'],
  SECURITY: ['Security Engineer', 'Cybersecurity', 'Penetration Tester', 'Security Analyst'],
  QA_ENGINEER: ['QA Engineer', 'Test Engineer', 'Automation Tester', 'SDET'],
};

// File paths
export const PATHS = {
  DATA: './data',
  EXPORTS: './data/exports',
  LOGS: './data/logs',
  TEMP: './data/temp',
};

// Log messages
export const MESSAGES = {
  SCRAPING: {
    START: 'Memulai proses scraping...',
    COMPLETE: 'Proses scraping selesai',
    ERROR: 'Error saat scraping:',
    RATE_LIMIT: 'Rate limit terdeteksi, menunggu...',
    SESSION_EXPIRED: 'Session expired, melakukan re-login...',
  },
  EXPORT: {
    START: 'Memulai export data...',
    COMPLETE: 'Export berhasil:',
    ERROR: 'Error saat export:',
  },
  DATABASE: {
    CONNECTING: 'Menghubungkan ke database...',
    CONNECTED: 'Terhubung ke database',
    ERROR: 'Error koneksi database:',
  },
};
