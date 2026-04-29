# Be-U Backend — Feature Log

Chronological record of all features shipped. Each entry covers what was built, which files are involved, and any notable decisions.

---

## Phase 1 — Foundation (Feb 2026)

### 2026-02-20 — Project Scaffold
**Commit:** `c506604`

- NestJS 11 project initialised with **Fastify** adapter (lower memory overhead vs Express)
- **Drizzle ORM** connected to **Neon PostgreSQL** (pooled connection)
- Full DB schema defined upfront:
  `users`, `user_profiles`, `user_summaries`, `images`, `products`, `scan_history`, `labels`, `ingredients`, `prescriptions`, `medications`, `allergen_flags`, `recommendations`
- **Clerk** chosen for auth (JWT-based, no session storage)
- **Oracle Cloud Object Storage** chosen for image hosting (OCI SDK)
- Deployed target: 1 GB OCI instance — memory efficiency a first-class concern

**Key files:** `src/database/schema/`, `drizzle.config.ts`, `ecosystem.config.js`

---

### 2026-02-27 — Image Upload
**Commit:** `7372fce`

- `POST /upload` — accepts JPEG, PNG, HEIC via `@fastify/multipart` (20 MB limit)
- Images stored in Oracle OCI bucket; metadata (URL, oracle key) saved to `images` table
- Pre-signed URL generation for time-limited access (`GET /upload/image/:id`)
- `GET /upload/my-images` — list user's uploaded images
- `DELETE /upload/image/:id` — delete from OCI + DB

**Key files:** `src/modules/imageUploads/`

---

## Phase 2 — CI/CD & Infrastructure (Mar 2026)

### 2026-03-03 — GitHub Actions Deployment Pipeline
**Commits:** `fd3b2f5` → `39173e2`

- Two-job workflow: **Build & Test** → **Deploy to Oracle** (only on `main` push)
- Entire `.env` stored as base64-encoded GitHub secret `APP_ENV_VARS`, decoded on server at deploy time
- `npm ci` skipped when `package-lock.json` hash unchanged (speed optimisation)
- Drizzle migrations run automatically on every deploy
- PM2 restarts app with `ecosystem.config.js` (600 MB memory cap, Fastify graceful shutdown)

**Key files:** `.github/workflows/deploy.yml`, `ecosystem.config.js`

---

### 2026-03-03 — Health Endpoint & Auth
**Commits:** `85ebb77`, `fb685e0`

- `GET /health` — public endpoint, used by deployment verify step
- **Clerk auth flow** wired globally:
  - `ClerkAuthGuard` — validates JWT on every request, attaches `clerk_id`
  - `AttachUserInterceptor` — looks up DB user by `clerk_id`, attaches full user row
  - `@Public()` decorator to opt out per route
- `POST /auth/sync` — upserts DB user from Clerk webhook data
- `GET /auth/me` — returns current user

**Key files:** `src/core/guards/`, `src/core/interceptors/`, `src/modules/auth/`

---

## Phase 3 — Scanning (Mar 2026)

### 2026-03-06 — Product & Prescription Scanning
**Commit:** `b455cdb`

- `POST /scans/product` — accepts front/back OCR text + parsed LLM output from client
  - Inserts `products`, `scan_history`, `scanned_labels`, `scanned_ingredients` in a single transaction
- `POST /scans/prescription` — accepts OCR + parsed prescription data
  - Inserts `scan_history`, `scanned_prescriptions`, `medications`
- `GET /scans` — paginated scan list with product/prescription metadata
- `GET /scans/:id` — full scan detail with pre-signed image URLs

**Key files:** `src/modules/scans/scans.service.ts`, `src/modules/scans/scans.controller.ts`

---

### 2026-03-07 — PDF Lab Report Scanning + LLM Parsing
**Commit:** `469f8b2`

- `POST /scans/lab-report` — accepts a PDF file URL
- PDF downloaded from OCI, text extracted via `pdf-parse`
- LLM call made server-side to `LLM_SERVER_URL/lab-report` with extracted text
- Scan created immediately; LLM processing runs in background (non-blocking response)
- `parsedResult` and `llmSummary` updated after LLM responds

**Key files:** `src/modules/scans/scans.service.ts` — `createLabReportScan`, `processLabReportWithLLM`

---

### 2026-03-20 — Image Compression
**Commit:** `0067c6a`

- Uploaded images compressed before storing to OCI (reduces storage cost and pre-signed URL fetch time)

---

### 2026-03-21 — LLM Summary Extraction
**Commit:** `f9d89c5`

- `extractSummaryFromParsedResult` — handles both flat (`parsedResult.summary`) and nested front/back (`parsedResult.front.summary`) structures
- `llmSummary` backfilled from `parsedResult` when not explicitly stored
- Persisted back to DB on `GET /scans/:id` if missing (fire-and-forget)

---

## Phase 4 — AI & Personalisation (Apr 2026)

### 2026-04-24 — User Profile API

- `GET /users/profile` — returns user's profile
- `PATCH /users/profile` — update name, age, gender, skin type, allergies, conditions
- `POST /auth/sync` response extended to include `profile` — client gets everything at login, no second call needed

**Key files:** `src/modules/users/`, `src/modules/auth/auth.service.ts`

---

### 2026-04-24 — Rolling User Summaries

After each scan, a compact entry is prepended to the relevant JSONB array in `user_summaries` (capped to keep last N):

| Scan type | Column | Cap |
|---|---|---|
| Food product | `recent_food` | 10 |
| Beauty/makeup product | `recent_makeup` | 10 |
| Medication product | `recent_medications` | 10 |
| Prescription | `recent_prescriptions` | 5 |
| Prescription medications | `recent_medications` | 10 |
| Lab report | `recent_lab_reports` | 5 |

- Summary routing uses `dto.category` (client-provided ground truth), not LLM's `product_type` string
- All writes are fire-and-forget — scan creation never blocks on this

**Key files:** `src/modules/scans/scans.service.ts` — `updateUserSummary`

---

### 2026-04-24 — Allergen Flagging

- After each product scan with ingredients, matched allergens are written to `allergen_flags`
- Two match criteria: LLM set `is_allergen: true` **or** ingredient name contains a string from `user_profiles.allergies` (case-insensitive substring)
- Matched ingredient names deduplicated into `user_summaries.flagged_ingredients` (text[]) via `ARRAY(SELECT DISTINCT unnest(...))`
- Returns matched names to the caller so the recommendation step doesn't re-query

**Key files:** `src/modules/scans/scans.service.ts` — `checkAndFlagAllergens`

---

### 2026-04-24 — LLM Context Enrichment

- `buildUserContextBlock(userId)` — fetches profile + flagged ingredients, returns a compact text block:
  ```
  [USER CONTEXT]
  Age: 28 | Gender: female | Skin type: sensitive
  Allergies: peanuts, gluten
  Previously flagged: sodium lauryl sulfate, parabens
  [/USER CONTEXT]
  ```
- Prepended to every LLM call (lab report, retry cron)
- Budget-aware: `budget = TEXT_LIMIT - contextBlock.length` to stay within model limits

**Key files:** `src/modules/scans/scans.service.ts` — `buildUserContextBlock`

---

### 2026-04-24 — LLM Retry Cron Job

- Cron runs every 3 hours (`@Cron(CronExpression.EVERY_3_HOURS)`)
- Finds up to 20 label/ingredients scans where `rawOcrText IS NOT NULL` and `llmSummary IS NULL`
- Re-calls `/label` or `/ingredients` LLM endpoint with user context prepended
- Updates `llmSummary`, `parsedResult`, `confidence` on success
- `isRunning` guard prevents overlapping executions

**Key files:** `src/modules/scans/scan-retry.service.ts`

---

### 2026-04-24 — Vector Embeddings

- `generateAndStoreEmbedding(scanId, text)` — calls `EMBEDDING_SERVER_URL/embed`, stores 768-dim vector in `scan_history.embedding`
- Model: `nomic-embed-text` (768 dimensions — schema updated from earlier 384-dim placeholder)
- Triggered fire-and-forget for all scan types:
  - Product: product name + brand + OCR text
  - Prescription: doctor name + diagnosis + raw OCR
  - Lab report: LLM summary (raw text fallback)
- HNSW index (`vector_cosine_ops`) created on `scan_history.embedding` for fast ANN search

**Key files:** `src/modules/scans/scans.service.ts` — `generateAndStoreEmbedding`, `src/database/schema/scan-history.schema.ts`, `src/database/migrations/0006_vector_index.sql`

---

### 2026-04-26 — RAG Context Injection for LLM Summaries

- `buildRagContextBlock(userId, text, excludeScanId?)` — embeds the current scan text on the fly, queries `scan_history` via pgvector cosine distance (`<=>`), returns the top-3 most similar past scans that have an existing `llm_summary`
- Result injected into LLM prompt as a `[RELEVANT PAST SCANS]` block alongside the existing `[USER CONTEXT]` block
- Enables cross-scan reasoning in summaries:
  - Trend detection (e.g. creatinine rising across lab reports)
  - Allergen cross-referencing (e.g. SLS flagged in a previous shampoo scan)
  - Duplicate product warnings
- Both context blocks fetched in parallel (`Promise.all`) to minimise latency
- RAG block silently returns `''` on any failure — never blocks the LLM call
- Wired into two server-side LLM call points:
  - `processLabReportWithLLM` in `scans.service.ts`
  - `retryFailedSummaries` cron in `scan-retry.service.ts`
- `excludeScanId` prevents the current scan from appearing in its own context

**Key files:** `src/modules/scans/scans.service.ts` — `buildRagContextBlock`, `src/modules/scans/scan-retry.service.ts`

---

### 2026-04-24 — Recommendations

One row inserted into `recommendations` after every scan:

| scanType | `safeToUse` | `recommendation` | `reasoning` |
|---|---|---|---|
| `label` | `true` | usage directions from label | warnings count |
| `ingredients` | `true` / `false` | allergen list or "none detected" | matched allergen names |
| `prescription` | `null` | medication names list | — |
| `lab_report` | `null` | LLM summary | — |

- Allergen check and recommendation are **chained** for product scans — recommendation knows exactly which allergens were flagged before inserting
- All other scan types: fire-and-forget after transaction

**Key files:** `src/modules/scans/scans.service.ts` — `generateRecommendation`

---

### 2026-04-24 — Database Logger

- `logs` table: `id`, `level`, `context`, `message`, `metadata` (jsonb), `created_at`
- `DbLoggerService` implements NestJS `LoggerService`
  - `log` / `warn` / `error` → console + DB
  - `debug` / `verbose` → console only (not persisted)
  - DB writes are fire-and-forget; failure falls back to `console.error`
- Registered via `app.useLogger(app.get(DbLoggerService))` — all existing `this.logger.*` calls across every service automatically persist with no per-service changes

**Key files:** `src/core/logger/db-logger.service.ts`, `src/core/logger/logger.module.ts`, `src/database/schema/logs.schema.ts`

---

## Infrastructure Summary

| Concern | Solution |
|---|---|
| HTTP | NestJS 11 + Fastify |
| Auth | Clerk (JWT) |
| Database | Neon PostgreSQL + Drizzle ORM |
| File storage | Oracle Cloud Object Storage |
| LLM | Self-hosted / Modal-deployed Ollama (`qwen2.5:1.5b`) |
| Embeddings | Self-hosted / Modal-deployed `nomic-embed-text` (768-dim) |
| Deployment | OCI 1 GB instance + PM2 + GitHub Actions |
| Scheduler | `@nestjs/schedule` (cron) |
