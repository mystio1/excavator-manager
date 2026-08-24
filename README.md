# Excavator Manager

A fast, mobile-friendly management system for excavator/JCB owners — machines, customers, operators, work-hour tracking, salaries, servicing and billing. Built with Next.js (App Router), Prisma + SQLite, and Auth.js. Designed to be self-hosted: everything, including the database, lives in this project folder.

## Running it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first visit redirects to **Register**, which creates your business and its first login in one step. Each business's data is fully isolated — you can register more than one business on the same install if needed.

## Data

Everything is stored in `dev.db` (SQLite) in the project root — back this file up regularly. `AUTH_SECRET` and `DATABASE_URL` live in `.env` (not committed); generate a new secret for any new deployment with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Self-hosting in production

```bash
npm run build
npm run start
```

Runs a standalone Node server on port 3000 (set `PORT` to change it). Point a reverse proxy (nginx, Caddy) at it if you want a domain/HTTPS. Because the database is a local file, keep it on a machine/disk that stays up and gets backed up — there's no external database to fail over to.

## What's built so far

- Auth + multi-business accounts
- Dashboard with live counts, alerts and a 6-month hours chart
- Excavators: add machine, start/stop work, daily hour logging (by hour-meter or clock time), work history with filters
- Customers: add, search, full machine/work history per customer
- Operators: add, current-assignment view

Coming next: operator salary & advances, service tracking with per-item history, expenses, and GST/Non-GST bill generation with PDF export — the database schema for all of these already exists (see `prisma/schema.prisma`), just not the screens yet.
