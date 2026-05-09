# UPN Alumni LinkedIn Scraper

Sistem Web Scraper untuk mengumpulkan data alumni Informatika UPN "Veteran" Jawa Timur (2004-2026) dari LinkedIn.

## Tech Stack

- **Language:** TypeScript
- **Scraping Engine:** Playwright dengan stealth plugins
- **Database:** PostgreSQL dengan Prisma ORM
- **CLI:** Commander.js

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Git

## Setup

### 1. Clone Repository

```bash
git clone https://github.com/galiihajiip/scraper-alumni.git
cd scraper-alumni
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install Playwright Browsers

```bash
npm run install-browsers
```

Atau install secara manual:

```bash
npx playwright install chromium
```

### 4. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env` dan isi dengan:
- `DATABASE_URL` - Connection string PostgreSQL
- `LINKEDIN_EMAIL` dan `LINKEDIN_PASSWORD` - Akun LinkedIn untuk scraping

### 5. Setup Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# (Optional) Open Prisma Studio
npm run db:studio
```

## Usage

### Run Scraper

```bash
# Scrape dengan default settings
npm run scrape

# Scrape dengan filter angkatan
npm run scrape -- --angkatan 2015-2020

# Scrape dengan limit
npm run scrape -- --limit 50

# Resume scraping dari terakhir
npm run scrape -- --resume
```

### Export Data

```bash
# Export ke CSV
npm run export -- --format csv

# Export ke JSON
npm run export -- --format json

# Export dengan filter
npm run export -- --format csv --angkatan 2018-2022
```

## Project Structure

```
.
├── src/
│   ├── auth/          # LinkedIn authentication & session
│   ├── cli/           # Command-line interface
│   ├── config/        # Configuration & constants
│   ├── database/      # Prisma client & repositories
│   ├── export/        # CSV/JSON export handlers
│   ├── scraper/       # Scraping engine & extraction
│   ├── types/         # TypeScript interfaces
│   └── utils/         # Helper functions
├── prisma/
│   └── schema.prisma  # Database schema
├── data/              # Output directory
└── dist/              # Compiled output
```

## Playwright Browser Installation

Jika mengalami error browser tidak ditemukan:

### Windows
```bash
# Install Chromium saja (lebih ringan)
npx playwright install chromium

# Atau install semua browsers
npx playwright install

# Install dengan dependencies (Windows)
npx playwright install --with-deps chromium
```

### Verifikasi Installasi
```bash
npx playwright chromium --version
```

## Rate Limiting & Safety

Scraper ini menggunakan rate limiting untuk menghindari ban dari LinkedIn:
- Delay acak antar request (2-5 detik)
- Maximum 200 profiles per hari
- Maximum 50 profiles per jam
- Auto-backoff jika terdeteksi throttling

## Troubleshooting

### Error: Browser tidak terinstall
```bash
npm run install-browsers
```

### Error: Database connection
Pastikan PostgreSQL running dan `DATABASE_URL` di `.env` benar.

### Error: LinkedIn login failed
Periksa kredensial di `.env` dan pastikan akun tidak terkunci.

## License

MIT
