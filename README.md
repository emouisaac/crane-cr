# Crane Credit Platform

Crane Credit is a full-stack digital loan platform built on your existing HTML/CSS frontend and upgraded with:

- Node.js + Express.js APIs
- PostgreSQL persistence with migrations
- Socket.io real-time updates
- Role-based dashboards for users, admins, and super admins
- Cookie-based auth, CSRF protection, rate limiting, audit logs, and backup workflows

## Project Structure

```text
/backend
  /config
  /controllers
  /middleware
  /migrations
  /models
  /routes
  /scripts
  /services
  /sockets
  /uploads
  server.js
/frontend
  /js
index.html
admin.html
super-admin.html
login.html
admin-login.html
super-admin-login.html
styles.css
```

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to a persistent PostgreSQL database.
3. Set strong values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `SUPER_ADMIN_PASSWORD`.
4. Set `COOKIE_SECURE=true` behind HTTPS in production.

## Install And Run

```bash
npm install
npm run migrate
npm start
```

The app serves:

- `/` or `/index.html` for users
- `/admin-login.html` for admins
- `/super-admin-login.html` for the super admin

## Persistence Rules

- PostgreSQL stores accounts, sessions, loans, documents, audit logs, and notifications.
- Uploaded documents and backup files are stored under `backend/storage`.
- For Render, Railway, or VPS deployments, attach a persistent disk or volume to `backend/storage`.
- Migrations are additive and do not reset data.

## Default Operational Flow

- Super admin account is seeded from `.env` on startup.
- Super admin creates admin accounts from `super-admin.html`.
- Users register from the main portal and submit loan requests.
- Admins review applications and documents in real time.
- Socket.io propagates status changes and notifications across dashboards immediately.

## Backups

- Scheduled backups run from `AUTO_BACKUP_CRON`.
- Manual backup:

```bash
npm run backup
```

- Restore a backup:

```bash
npm run restore -- crane-backup-YYYY-MM-DDTHH-MM-SS-sssZ.json
```

## Deployment Notes

- `Dockerfile` and `docker-compose.yml` are included.
- Run behind HTTPS and a reverse proxy in production.
- Restrict document storage access at the infrastructure layer as well as application layer.
- For Render/Railway, configure the app start command as `npm run migrate && npm start`.

## Important Notes

- This codebase preserves data by design, but true "never lose data" behavior still depends on production infrastructure:
  persistent PostgreSQL storage, persistent file volumes, automated backup retention, and secure secret management.
- Image blur detection is implemented with a server-side sharpness heuristic.
- Duplicate-photo matching is implemented via SHA-256 document hash blocking for exact re-use.
