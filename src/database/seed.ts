/**
 * Database Seeding Script
 * 
 * Optional: Seed database with initial reference data
 * e.g., tech stack categories, common companies, etc.
 */

import { getPrismaClient, disconnect } from './client';
import { logger } from '@/utils/logger';

const commonTechStacks = [
  // Programming Languages
  { nama: 'JavaScript', kategori: 'LANGUAGE' },
  { nama: 'TypeScript', kategori: 'LANGUAGE' },
  { nama: 'Python', kategori: 'LANGUAGE' },
  { nama: 'Java', kategori: 'LANGUAGE' },
  { nama: 'Go', kategori: 'LANGUAGE' },
  { nama: 'PHP', kategori: 'LANGUAGE' },
  { nama: 'C++', kategori: 'LANGUAGE' },
  { nama: 'C#', kategori: 'LANGUAGE' },
  { nama: 'Ruby', kategori: 'LANGUAGE' },
  { nama: 'Swift', kategori: 'LANGUAGE' },
  { nama: 'Kotlin', kategori: 'LANGUAGE' },
  
  // Frontend Frameworks
  { nama: 'React', kategori: 'FRAMEWORK' },
  { nama: 'Vue.js', kategori: 'FRAMEWORK' },
  { nama: 'Angular', kategori: 'FRAMEWORK' },
  { nama: 'Svelte', kategori: 'FRAMEWORK' },
  { nama: 'Next.js', kategori: 'FRAMEWORK' },
  { nama: 'Nuxt.js', kategori: 'FRAMEWORK' },
  { nama: 'TailwindCSS', kategori: 'FRAMEWORK' },
  
  // Backend Frameworks
  { nama: 'Node.js', kategori: 'FRAMEWORK' },
  { nama: 'Express.js', kategori: 'FRAMEWORK' },
  { nama: 'Django', kategori: 'FRAMEWORK' },
  { nama: 'Spring Boot', kategori: 'FRAMEWORK' },
  { nama: 'Laravel', kategori: 'FRAMEWORK' },
  { nama: 'FastAPI', kategori: 'FRAMEWORK' },
  
  // Databases
  { nama: 'PostgreSQL', kategori: 'DATABASE' },
  { nama: 'MySQL', kategori: 'DATABASE' },
  { nama: 'MongoDB', kategori: 'DATABASE' },
  { nama: 'Redis', kategori: 'DATABASE' },
  { nama: 'SQLite', kategori: 'DATABASE' },
  { nama: 'Oracle', kategori: 'DATABASE' },
  
  // Cloud Platforms
  { nama: 'AWS', kategori: 'CLOUD' },
  { nama: 'Google Cloud', kategori: 'CLOUD' },
  { nama: 'Azure', kategori: 'CLOUD' },
  { nama: 'Vercel', kategori: 'CLOUD' },
  { nama: 'Netlify', kategori: 'CLOUD' },
  { nama: 'DigitalOcean', kategori: 'CLOUD' },
  
  // DevOps Tools
  { nama: 'Docker', kategori: 'DEVOPS' },
  { nama: 'Kubernetes', kategori: 'DEVOPS' },
  { nama: 'Jenkins', kategori: 'DEVOPS' },
  { nama: 'GitHub Actions', kategori: 'DEVOPS' },
  { nama: 'Terraform', kategori: 'DEVOPS' },
  { nama: 'Ansible', kategori: 'DEVOPS' },
  
  // AI/ML
  { nama: 'TensorFlow', kategori: 'AI_ML' },
  { nama: 'PyTorch', kategori: 'AI_ML' },
  { nama: 'Scikit-learn', kategori: 'AI_ML' },
  { nama: 'OpenAI API', kategori: 'AI_ML' },
  { nama: 'Hugging Face', kategori: 'AI_ML' },
  
  // Tools
  { nama: 'Git', kategori: 'TOOL' },
  { nama: 'GitHub', kategori: 'TOOL' },
  { nama: 'GitLab', kategori: 'TOOL' },
  { nama: 'Jira', kategori: 'TOOL' },
  { nama: 'Figma', kategori: 'TOOL' },
  { nama: 'VS Code', kategori: 'TOOL' },
  { nama: 'Postman', kategori: 'TOOL' },
  { nama: 'Docker Compose', kategori: 'TOOL' },
];

async function seed() {
  logger.info('Starting database seed...');
  
  const prisma = getPrismaClient();
  
  try {
    // Seed tech stacks
    logger.info(`Seeding ${commonTechStacks.length} tech stacks...`);
    
    for (const tech of commonTechStacks) {
      await prisma.techStack.upsert({
        where: { nama: tech.nama },
        update: {},
        create: {
          nama: tech.nama,
          kategori: tech.kategori,
        },
      });
    }
    
    logger.info('Tech stacks seeded successfully');
    
    logger.info('Database seed completed!');
  } catch (error) {
    logger.error('Seed failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Run seed if this file is executed directly
if (require.main === module) {
  seed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { seed };
