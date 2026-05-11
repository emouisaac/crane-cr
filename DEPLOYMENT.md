# Deployment Guide

## Render

1. Create a PostgreSQL service.
2. Create a web service from this repo.
3. Set `DATABASE_URL` from the Render PostgreSQL connection string.
4. Add a persistent disk mounted to `backend/storage`.
5. Set start command:

```bash
npm run migrate && npm start
```

6. Set environment variables from `.env.example`.

## Railway

1. Provision a PostgreSQL plugin.
2. Add a persistent volume for `backend/storage`.
3. Set `DATABASE_URL`, secrets, and `APP_ORIGIN`.
4. Start with:

```bash
npm run migrate && npm start
```

## VPS

1. Install Node.js 20+ and PostgreSQL 16+.
2. Clone the repo and create `.env`.
3. Create directories for persistent uploads and backups.
4. Run:

```bash
npm install
npm run migrate
npm start
```

5. Put the app behind Nginx or Caddy with HTTPS enabled.

## Docker

```bash
docker compose up --build
```

This brings up the app and PostgreSQL with named volumes for database persistence and application storage.

## Production Checklist

- Use long random JWT secrets.
- Set `COOKIE_SECURE=true`.
- Set `APP_ORIGIN` to the exact public origin.
- Mount persistent storage for `backend/storage`.
- Enable platform-level snapshots for PostgreSQL.
- Monitor backup creation and periodically test restore.
