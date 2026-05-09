# UPN Alumni Dashboard

Dashboard Next.js untuk visualisasi data alumni Informatika UPN Veteran Jawa Timur.

## Features

- **Dashboard Overview**: Statistik total alumni, angkatan, perusahaan, tech stacks
- **Alumni Table**: Tabel dengan search, filter, pagination
- **Analytics**: Charts (spesialisasi distribution, angkatan bar chart, tech stack popularity)
- **Scraper Control**: Trigger scraping dari web interface
- **Export**: Download CSV/JSON langsung dari dashboard

## Setup

```bash
cd dashboard
npm install
npm run dev
```

## Configuration

Buat file `.env.local`:

```env
DATABASE_URL="file:../prisma/dev.db"
# atau untuk PostgreSQL:
# DATABASE_URL="postgresql://user:pass@localhost:5432/upn_alumni"
```

## Pages

- `/` - Dashboard Overview
- `/alumni` - Alumni Table dengan filter
- `/analytics` - Data Visualization
- `/scraper` - Scraper Control Panel
- `/export` - Export Data

## API Routes

- `GET /api/alumni` - List alumni dengan pagination
- `GET /api/stats` - Aggregasi data
- `POST /api/scrape` - Trigger scraping (background job)
- `GET /api/export/csv` - Download CSV
- `GET /api/export/json` - Download JSON

## Tech Stack

- Next.js 14 (App Router)
- TailwindCSS
- Prisma Client (shared dari root)
- Recharts untuk visualisasi
- Lucide React untuk icons

## Production Build

```bash
npm run build
npm start
```

Dashboard akan berjalan di `http://localhost:3000`
