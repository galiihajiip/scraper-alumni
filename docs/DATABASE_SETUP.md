# Database Setup Guide

Panduan setup PostgreSQL untuk UPN Alumni Scraper

## Prerequisites

- PostgreSQL 14+ terinstall
- psql CLI atau pgAdmin

## Quick Setup

### 1. Create Database

```sql
CREATE DATABASE upn_alumni_scraper;
CREATE USER scraper_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE upn_alumni_scraper TO scraper_user;
```

### 2. Update Environment Variables

Edit `.env` file:

```env
DATABASE_URL="postgresql://scraper_user:your_secure_password@localhost:5432/upn_alumni_scraper?schema=public"
```

### 3. Run Migrations

```bash
# Generate Prisma Client
npm run db:generate

# Create and apply migration
npx prisma migrate dev --name init

# Atau untuk production (apply tanpa membuat migration baru)
npx prisma migrate deploy
```

### 4. Verify Setup

```bash
# Buka Prisma Studio
npm run db:studio
```

Akses http://localhost:5555 untuk melihat database.

## Schema Overview

### Tables

| Table | Description | Row Estimate |
|-------|-------------|--------------|
| `alumni` | Data utama alumni | ~5000 rows |
| `pekerjaan` | Riwayat pekerjaan | ~15000 rows |
| `tech_stack` | Master list tech stack | ~100 rows |
| `alumni_tech_stack` | Junction table N:M | ~5000 rows |
| `scraping_log` | Log aktivitas scraping | ~10000 rows |
| `session` | Session LinkedIn | ~5 rows |

### Indexes

Indexes utama untuk query performance:

- `alumni(angkatan)` - Filter berdasarkan angkatan
- `alumni(spesialisasi)` - Filter berdasarkan role
- `alumni(angkatan, spesialisasi)` - Composite query
- `pekerjaan(alumni_id, is_current)` - Cari pekerjaan saat ini
- `alumni_tech_stack(alumni_id, tech_stack_id)` - Unique constraint
- `scraping_log(status, created_at)` - Query log terbaru

### Constraints

- **Unique**: `alumni(linked_in_url)`, `tech_stack(nama)`
- **Check**: `tahun_lulus >= angkatan` (di-validate di aplikasi)
- **Foreign Key**: Semua relation dengan `ON DELETE CASCADE`

## Manual SQL Migration (Alternative)

Jika tidak menggunakan Prisma Migrate, jalankan SQL berikut:

```sql
-- Create Enum Types
CREATE TYPE "SpesialisasiRole" AS ENUM (
  'FRONTEND', 'BACKEND', 'FULLSTACK', 'AI_ENGINEER', 
  'DATA_SCIENTIST', 'DEVOPS', 'MOBILE', 'GAME_DEV', 
  'SECURITY', 'QA_ENGINEER', 'LAINNYA'
);

CREATE TYPE "TechCategory" AS ENUM (
  'LANGUAGE', 'FRAMEWORK', 'DATABASE', 'CLOUD', 
  'DEVOPS', 'AI_ML', 'TOOL', 'LIBRARY', 'MOBILE', 'OTHER'
);

CREATE TYPE "SkillLevel" AS ENUM (
  'beginner', 'intermediate', 'advanced', 'expert'
);

CREATE TYPE "ScrapingStatus" AS ENUM (
  'PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'RETRYING', 'SKIPPED'
);

-- Create Tables
CREATE TABLE "alumni" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "nama_lengkap" VARCHAR(255) NOT NULL,
  "angkatan" INTEGER,
  "tahun_lulus" INTEGER,
  "ipk" REAL,
  "linked_in_url" VARCHAR(500) UNIQUE NOT NULL,
  "foto_profil" VARCHAR(500),
  "spesialisasi" "SpesialisasiRole",
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "last_scraped_at" TIMESTAMP,
  
  CONSTRAINT "tahun_check" CHECK ("tahun_lulus" IS NULL OR "angkatan" IS NULL OR "tahun_lulus" >= "angkatan")
);

CREATE TABLE "pekerjaan" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "alumni_id" UUID NOT NULL REFERENCES "alumni"("id") ON DELETE CASCADE,
  "posisi" VARCHAR(255) NOT NULL,
  "perusahaan" VARCHAR(255) NOT NULL,
  "is_current" BOOLEAN DEFAULT false,
  "tanggal_mulai" DATE,
  "tanggal_selesai" DATE,
  "lokasi" VARCHAR(255),
  "deskripsi" TEXT,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "tech_stack" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "nama" VARCHAR(255) UNIQUE NOT NULL,
  "kategori" "TechCategory" NOT NULL,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "alumni_tech_stack" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "alumni_id" UUID NOT NULL REFERENCES "alumni"("id") ON DELETE CASCADE,
  "tech_stack_id" UUID NOT NULL REFERENCES "tech_stack"("id") ON DELETE CASCADE,
  "level" "SkillLevel",
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("alumni_id", "tech_stack_id")
);

CREATE TABLE "scraping_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "url" VARCHAR(500) NOT NULL,
  "status" "ScrapingStatus" NOT NULL,
  "error_message" TEXT,
  "retry_count" INTEGER DEFAULT 0,
  "duration" INTEGER,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "session" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "platform" VARCHAR(50) DEFAULT 'linkedin',
  "session_data" JSONB NOT NULL,
  "is_active" BOOLEAN DEFAULT true,
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes
CREATE INDEX "idx_alumni_angkatan" ON "alumni"("angkatan");
CREATE INDEX "idx_alumni_spesialisasi" ON "alumni"("spesialisasi");
CREATE INDEX "idx_alumni_tahun_lulus" ON "alumni"("tahun_lulus");
CREATE INDEX "idx_alumni_created_at" ON "alumni"("created_at");
CREATE INDEX "idx_alumni_angkatan_spesialisasi" ON "alumni"("angkatan", "spesialisasi");

CREATE INDEX "idx_pekerjaan_alumni_id" ON "pekerjaan"("alumni_id");
CREATE INDEX "idx_pekerjaan_is_current" ON "pekerjaan"("is_current");
CREATE INDEX "idx_pekerjaan_perusahaan" ON "pekerjaan"("perusahaan");
CREATE INDEX "idx_pekerjaan_alumni_current" ON "pekerjaan"("alumni_id", "is_current");

CREATE INDEX "idx_tech_stack_kategori" ON "tech_stack"("kategori");
CREATE INDEX "idx_tech_stack_nama" ON "tech_stack"("nama");

CREATE INDEX "idx_alumni_tech_stack_alumni" ON "alumni_tech_stack"("alumni_id");
CREATE INDEX "idx_alumni_tech_stack_tech" ON "alumni_tech_stack"("tech_stack_id");

CREATE INDEX "idx_scraping_log_status" ON "scraping_log"("status");
CREATE INDEX "idx_scraping_log_created" ON "scraping_log"("created_at");
CREATE INDEX "idx_scraping_log_url" ON "scraping_log"("url");
CREATE INDEX "idx_scraping_log_status_created" ON "scraping_log"("status", "created_at");

CREATE INDEX "idx_session_platform" ON "session"("platform");
CREATE INDEX "idx_session_active" ON "session"("is_active");
CREATE INDEX "idx_session_expires" ON "session"("expires_at");
CREATE INDEX "idx_session_platform_active" ON "session"("platform", "is_active");

-- Create Updated At Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_alumni_updated_at BEFORE UPDATE ON "alumni" 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pekerjaan_updated_at BEFORE UPDATE ON "pekerjaan" 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tech_stack_updated_at BEFORE UPDATE ON "tech_stack" 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_alumni_tech_stack_updated_at BEFORE UPDATE ON "alumni_tech_stack" 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_scraping_log_updated_at BEFORE UPDATE ON "scraping_log" 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_session_updated_at BEFORE UPDATE ON "session" 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Useful Queries

### Statistik Alumni

```sql
-- Total alumni per angkatan
SELECT angkatan, COUNT(*) as total
FROM alumni
WHERE angkatan IS NOT NULL
GROUP BY angkatan
ORDER BY angkatan DESC;

-- Distribusi spesialisasi
SELECT spesialisasi, COUNT(*) as total
FROM alumni
WHERE spesialisasi IS NOT NULL
GROUP BY spesialisasi
ORDER BY total DESC;

-- Tech stack paling populer
SELECT ts.nama, ts.kategori, COUNT(*) as pengguna
FROM alumni_tech_stack ats
JOIN tech_stack ts ON ats.tech_stack_id = ts.id
GROUP BY ts.nama, ts.kategori
ORDER BY pengguna DESC
LIMIT 20;

-- Perusahaan dengan alumni terbanyak
SELECT perusahaan, COUNT(*) as total_alumni
FROM pekerjaan
WHERE is_current = true
GROUP BY perusahaan
ORDER BY total_alumni DESC
LIMIT 20;
```

### Maintenance

```sql
-- Hapus log lama (> 30 hari)
DELETE FROM scraping_log
WHERE created_at < NOW() - INTERVAL '30 days';

-- Vacuum dan analyze
VACUUM ANALYZE;
```

## Troubleshooting

### Connection Error

```
Error: P1001: Can't reach database server
```

**Solusi:**
1. Pastikan PostgreSQL service running
2. Cek firewall settings
3. Verifikasi connection string di `.env`

### Migration Error

```
Error: P3018: A migration failed to apply
```

**Solusi:**
```bash
# Reset database (HATI-HATI: akan hapus semua data)
npx prisma migrate reset

# Atau
# Hapus migration folder dan database, lalu recreate
```

### Permission Denied

```
Error: P1010: User was denied access
```

**Solusi:**
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO scraper_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO scraper_user;
```

## Backup & Restore

### Backup

```bash
pg_dump -U scraper_user -d upn_alumni_scraper > backup_$(date +%Y%m%d).sql
```

### Restore

```bash
psql -U scraper_user -d upn_alumni_scraper < backup_20250115.sql
```

---

**Catatan:** Jangan commit file `.env` ke repository. Gunakan `.env.example` sebagai template.
