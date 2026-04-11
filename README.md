
# Lol Data System
Professional LPL/LCK Data Management System.
[Trigger Update: Force Vercel Refresh]

## Vercel Deploy

This project now supports both local SQLite development and cloud PostgreSQL deployment.

Required Vercel environment variables:

- `DATABASE_URL`
- `CRON_SECRET`
- `RIOT_API_KEY`
- `GEMINI_API_KEY`

Recommended deploy steps:

1. Import the GitHub repository into Vercel.
2. Add the environment variables in the Vercel project settings.
3. Keep the default build command as `npm run build`.
4. Keep the default output setting for Next.js.

Build behavior:

- Local builds use `prisma/schema.local.prisma` and SQLite.
- Cloud builds use `prisma/schema.prisma` and PostgreSQL automatically when `DATABASE_URL` is not a `file:` URL.
