# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Be-U Social Backend — a NestJS 11 API using **Fastify** (not Express), **Drizzle ORM**, **Clerk** for auth, and **Oracle Cloud Object Storage** for images. Deployed on a 1GB OCI instance, so memory efficiency is a recurring concern.

## Commands

```bash
# Development
npm run start:dev        # Watch mode with SWC compiler (fast)
npm run start:debug      # Debug mode

# Build & Production
npm run build            # Compile TypeScript
npm run start:prod       # Run compiled dist/main.js

# Code Quality
npm run lint             # ESLint with auto-fix
npm run format           # Prettier format

# Testing
npm run test             # Unit tests
npm run test:watch       # Watch mode
npm run test:cov         # Coverage report
npm run test:e2e         # End-to-end tests

# Database (Drizzle)
npm run db:generate      # Generate migration files from schema
npm run db:migrate       # Run migrations
npm run db:push          # Push schema directly (dev shortcut)
npm run db:studio        # Open Drizzle Studio GUI
```

## Architecture

### HTTP Framework
Fastify is used instead of Express for lower memory overhead. File uploads use `@fastify/multipart` (20MB limit). When working with request/response types, use Fastify types, not Express types.

### Authentication Flow
Every request (except `@Public()` routes) passes through two global providers:

1. **`ClerkAuthGuard`** ([src/core/guards/clerk-auth.guard.ts](src/core/guards/clerk-auth.guard.ts)) — validates the Clerk JWT from `Authorization: Bearer <token>`, attaches `clerkPayload.sub` (clerk_id) to request.
2. **`AttachUserInterceptor`** ([src/core/interceptors/attach-user.interceptor.ts](src/core/interceptors/attach-user.interceptor.ts)) — queries DB by `clerk_id`, attaches the full user row to `request['user']`.

Both are registered as `APP_GUARD` and `APP_INTERCEPTOR` in [src/app.module.ts](src/app.module.ts).

### Custom Decorators
Located in [src/core/decorators/](src/core/decorators/):
- `@Public()` — skips auth guard (for health checks, webhooks, auth sync endpoints)
- `@CurrentUser()` — parameter decorator returning the full DB user row
- `@CurrentClerkId()` — parameter decorator returning just the `clerk_id` string (available before DB sync)

### Database
- **ORM:** Drizzle ORM with `pg` driver connecting to Neon PostgreSQL (pooled connection on port 6543)
- **Global module:** `DatabaseModule` is `@Global()`, injected everywhere via token `'DB'`
- **Schema files:** [src/database/schema/](src/database/schema/) — each table has its own file, all exported from `index.ts`
- **Config:** [drizzle.config.ts](drizzle.config.ts) points to `src/database/schema/index.ts`

Key tables: `users`, `user-profiles`, `user-summaries`, `images`, `products`, `scan-history`, `labels`, `ingredients`, `prescriptions`, `medications`, `allergen-flags`, `recommendations`.

### Module Structure
Feature modules live in [src/modules/](src/modules/). Currently active:
- **auth** — `POST /auth/sync` (creates DB user from Clerk data), `GET /auth/me`
- **users** — user profile management (placeholder)
- **imageUploads** — `POST /upload`, `GET /upload/image/:id`, `GET /upload/my-images`, `DELETE /upload/image/:id`

Placeholder modules (not yet implemented): `ai-memory`, `media`, `posts`.

### Image Uploads
[src/modules/imageUploads/oracle-storage.service.ts](src/modules/imageUploads/oracle-storage.service.ts) handles Oracle Cloud OCI SDK. OCI private key in env uses `\n` escape sequences that must be converted to actual newlines. Upload accepts JPEG, PNG, HEIC; generates 1-hour pre-signed URLs.

## Environment Variables

Required in `.env`:
```
DATABASE_URL=          # Neon PostgreSQL pooled connection string
CLERK_SECRET_KEY=      # Clerk backend secret key
PORT=3000

# Oracle Cloud Object Storage
OCI_TENANCY=
OCI_USER=
OCI_FINGERPRINT=
OCI_PRIVATE_KEY=       # PEM key with \n escapes
OCI_REGION=
OCI_NAMESPACE=
OCI_BUCKET=
```

## Key Conventions

- **DTOs** use `class-validator` decorators; `ValidationPipe` with `whitelist: true, transform: true` is applied globally.
- **Inject DB** in services with `@Inject('DB') private db: NodePgDatabase<typeof schema>`.
- **Transactions** for multi-table writes (e.g., creating user + profile + summary atomically in `AuthService`).
- SWC compiler is used for `start:dev` — do not add decorators that require full TypeScript compilation metadata without testing.
- PM2 config ([ecosystem.config.js](ecosystem.config.js)) limits memory to 600MB; avoid in-memory caching of large objects.
