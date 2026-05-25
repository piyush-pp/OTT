# OTT Platform — Phased Implementation Plan

> This document describes phases 2–8 of building the OTT platform to a stakeholder-demo-ready state. Phase 1 (security hardening) is already complete — see git history.
>
> **Each phase is independently executable** by a single agent. Phases must be executed in order — later phases depend on earlier schema/API changes.
>
> **Scope explicitly EXCLUDED across all phases:** observability (logging/metrics/tracing/Sentry), automated testing, deployment infrastructure (Docker prod images, CI/CD, k8s). These are deliberately deferred.

---

## Repo Map (Reference)

```
OTT/
├── backend/                              # Express + Prisma + BullMQ producer
│   ├── prisma/schema.prisma              # DB schema
│   ├── src/
│   │   ├── index.ts                      # Express bootstrap, CORS, mounts
│   │   ├── controllers/                  # HTTP handlers (authController, videosController, streamController)
│   │   ├── services/                     # Domain logic (authService, videosService, s3, emailService)
│   │   ├── routes/                       # Route definitions (auth.ts, videos.ts)
│   │   ├── middleware/                   # auth.ts, rateLimiter.ts
│   │   ├── queue/videoQueue.ts           # BullMQ producer
│   │   ├── db/prisma.ts                  # Prisma client singleton
│   │   └── utils/{env.ts,errors.ts}
├── worker/                               # BullMQ consumer + ffmpeg
│   └── src/{worker.ts, transcode/ffmpeg.ts, s3/io.ts, fs/walk.ts, env.ts, prisma.ts}
├── frontend/                             # Vite + React + Video.js
│   └── src/
│       ├── api/client.ts                 # fetch wrapper + token refresh
│       ├── pages/{App,Auth,Videos,Upload,Player}.tsx
│       └── styles.css
├── docker-compose.yml                    # Postgres, Redis, MinIO, nginx CDN
└── nginx-cdn.conf
```

---

## Cross-Phase Conventions

- **All new endpoints** go under `/api/v1/` (introduced in Phase 3). Legacy `/auth`, `/videos` paths are kept for backward compat until Phase 3 migrates them.
- **All list endpoints** use cursor or offset pagination with consistent shape: `{ data: [], meta: { total, page, pageSize, hasMore } }`.
- **All mutating endpoints** accept an optional `Idempotency-Key` header.
- **All DB schema changes** ship with a proper `prisma migrate dev --name <descriptive_name>` migration file. Never use `db push` going forward.
- **All controllers** should follow the existing pattern: thin controller → service does work → Zod validates inputs → `HttpError` on failure → `next(err)`.
- **No hard-coded strings** for paths/keys — use `env.ts` config or constants.

---

# Phase 2 — Data Foundation + Reliability

**Goal:** All schema changes for upcoming features land here. Worker + backend handle SIGTERM gracefully. Migration history is real.

**Depends on:** Phase 1 (done).

**Effort:** ~2-3 hours.

## 2.1 Scope

### In Scope
- Schema additions: `Video.visibility`, `Video.viewCount`, `Video.category`, `Video.featured`, `Video.deletedAt`, `Video.duration`, `Video.sizeBytes`
- New tables: `WatchHistory`, `ShareLink`, `AuditLog`
- `User.role` enum (`USER` | `ADMIN`)
- Migration file checked into `backend/prisma/migrations/` (no more `db push`)
- Graceful shutdown for backend (Express) and worker (BullMQ)
- Dead-letter handling: failed jobs after max retries get marked `FAILED` with full error context (already happens — verify)
- `WORKER_CONCURRENCY` env var (default 2)
- Prisma connection pooling (`?connection_limit=10&pool_timeout=20` in `DATABASE_URL`)

### Out of Scope (defer to later phases)
- Using these new fields in the API (Phase 3+)
- Frontend changes (Phase 6+)

## 2.2 Tasks

### 2.2.1 Update Prisma Schema

File: `backend/prisma/schema.prisma`

```prisma
enum VideoStatus {
  UPLOADED
  PROCESSING
  READY
  FAILED
}

enum Visibility {
  PRIVATE
  UNLISTED
  PUBLIC
}

enum UserRole {
  USER
  ADMIN
}

model User {
  id                       String    @id @default(cuid())
  email                    String    @unique
  passwordHash             String
  emailVerified            Boolean   @default(false)
  emailVerifyTokenHash     String?   @unique
  emailVerifyTokenExpires  DateTime?
  role                     UserRole  @default(USER)
  displayName              String?
  createdAt                DateTime  @default(now())

  videos         Video[]
  refreshTokens  RefreshToken[]
  passwordResets PasswordResetToken[]
  watchHistory   WatchHistory[]
  shareLinks     ShareLink[]
  auditLogs      AuditLog[]
}

model Video {
  id           String      @id @default(cuid())
  title        String
  description  String?
  status       VideoStatus @default(UPLOADED)
  visibility   Visibility  @default(PRIVATE)
  category     String?
  featured     Boolean     @default(false)

  inputUrl     String
  inputKey     String
  playbackUrl  String?
  thumbnailUrl String?
  progress     Int         @default(0)
  duration     Int?        // seconds (nullable until probed)
  sizeBytes    BigInt?
  viewCount    Int         @default(0)
  error        String?

  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  deletedAt    DateTime?   // soft delete

  userId       String
  user         User        @relation(fields: [userId], references: [id])

  watchHistory WatchHistory[]
  shareLinks   ShareLink[]

  @@index([userId, createdAt])
  @@index([visibility, status, createdAt])
  @@index([category, visibility])
  @@index([featured, visibility])
  @@index([deletedAt])
}

model RefreshToken {
  // unchanged
}

model PasswordResetToken {
  // unchanged
}

model WatchHistory {
  id            String   @id @default(cuid())
  userId        String
  videoId       String
  watchedAt     DateTime @default(now())
  positionSec   Int      @default(0) // last playback position
  completedAt   DateTime?

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  video Video @relation(fields: [videoId], references: [id], onDelete: Cascade)

  @@unique([userId, videoId])
  @@index([userId, watchedAt])
}

model ShareLink {
  id         String    @id @default(cuid())
  tokenHash  String    @unique
  videoId    String
  userId     String    // creator
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  video Video @relation(fields: [videoId], references: [id], onDelete: Cascade)

  @@index([videoId])
  @@index([userId])
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  action    String   // e.g. "video.upload", "video.delete", "auth.login", "auth.password_reset"
  entityType String? // e.g. "Video", "User"
  entityId  String?
  metadata  Json?
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([action, createdAt])
}
```

### 2.2.2 Generate Migration

Drop the existing local DB and re-create with a real migration:

```bash
cd backend
npx prisma migrate reset --force          # destroys local data, OK for dev
npx prisma migrate dev --name add_visibility_and_engagement
npx prisma generate
```

If interactive TTY isn't available, generate SQL via `prisma migrate diff` and create the migration folder/file manually:

```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_add_visibility_and_engagement
npx prisma migrate diff --from-schema-datamodel <(git show HEAD:backend/prisma/schema.prisma) --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/.../migration.sql
npx prisma migrate deploy
```

### 2.2.3 Graceful Shutdown (Backend)

File: `backend/src/index.ts`

After the `app.listen(...)`, wire SIGTERM/SIGINT:

```ts
const server = app.listen(env.PORT, () => { ... });

const shutdown = async (signal: string) => {
  console.log(`[backend] ${signal} received — draining`);
  server.close(() => console.log("[backend] HTTP server closed"));
  try { await prisma.$disconnect(); } catch {}
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

### 2.2.4 Graceful Shutdown (Worker)

File: `worker/src/worker.ts`

```ts
const shutdown = async (signal: string) => {
  console.log(`[worker] ${signal} received — finishing current job then exiting`);
  await worker.close();                  // waits for active job
  try { await prisma.$disconnect(); } catch {}
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

### 2.2.5 Worker Concurrency Env Var

File: `worker/src/env.ts` — add `WORKER_CONCURRENCY` (default 2).
File: `worker/src/worker.ts` — pass `concurrency: env.WORKER_CONCURRENCY` to `new Worker(...)`.

### 2.2.6 Prisma Connection Pooling

Update `.env.example` to recommend:
```
DATABASE_URL=postgresql://ott:ott@localhost:5432/ott?schema=public&connection_limit=10&pool_timeout=20
```

## 2.3 Acceptance Criteria

- `npx prisma migrate status` reports all migrations applied; no pending changes
- A new migration file exists under `backend/prisma/migrations/<timestamp>_add_visibility_and_engagement/migration.sql`
- `kill -TERM <backend pid>` causes "draining" log + clean exit within 6s
- `kill -TERM <worker pid>` during a transcode waits for ffmpeg to finish, then exits
- `npm run dev` succeeds with worker running 2 concurrent jobs (verify by uploading 2 videos)
- `BigInt` serialization works in API responses (see "Gotcha" below)

## 2.4 Gotcha — BigInt JSON Serialization

`Video.sizeBytes` is `BigInt`. Add this to `backend/src/index.ts` once:

```ts
(BigInt.prototype as any).toJSON = function () { return this.toString(); };
```

---

# Phase 3 — API Hardening (Versioning, Pagination, Audit, Docs)

**Goal:** Move all endpoints under `/api/v1/`, paginate list endpoints, add idempotency key support, audit-log sensitive actions, generate OpenAPI docs.

**Depends on:** Phase 2 (needs `AuditLog` table).

**Effort:** ~3-4 hours.

## 3.1 Scope

### In Scope
- Mount existing routers under `/api/v1` (keep legacy paths working with deprecation header for one minor release)
- Pagination on `GET /api/v1/videos` (page, pageSize; default 20, max 100)
- Response envelope `{ data, meta }` for list endpoints
- `Idempotency-Key` header support on `POST /videos/complete` (returns cached response if same key seen in last 24h)
- `auditService` + auto-log on: login, signup, logout, password_reset, video.upload, video.delete, video.visibility_change
- OpenAPI/Swagger auto-generated from Zod schemas, served at `GET /api/v1/docs`

### Out of Scope
- New business logic (no public/private yet — Phase 4)

## 3.2 Tasks

### 3.2.1 Install Dependencies

```bash
cd backend
npm install zod-openapi @asteasolutions/zod-to-openapi swagger-ui-express
npm install -D @types/swagger-ui-express
```

### 3.2.2 Create v1 Router Mount

File: `backend/src/routes/v1.ts` (new)
```ts
import { Router } from "express";
import { authRouter } from "./auth.js";
import { videosRouter } from "./videos.js";

export const v1Router = Router();
v1Router.use("/auth", authRouter);
v1Router.use("/videos", videosRouter);
```

File: `backend/src/index.ts`
```ts
app.use("/api/v1", v1Router);

// Backward compat — log deprecation header
const deprecationWarning: RequestHandler = (_req, res, next) => {
  res.set("Deprecation", "true");
  res.set("Sunset", "2026-12-31");
  next();
};
app.use("/auth", deprecationWarning, authRouter);
app.use("/videos", deprecationWarning, videosRouter);
```

### 3.2.3 Pagination Helper

File: `backend/src/utils/pagination.ts` (new)
```ts
import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    data: items,
    meta: {
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total
    }
  };
}
```

### 3.2.4 Update `videosService.list`

```ts
async list(userId: string, params: { page: number; pageSize: number }) {
  const where = { userId, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize
    }),
    prisma.video.count({ where })
  ]);
  return { items, total };
}
```

Update controller `listVideos` to call with paginationSchema-parsed input and wrap in `paginate(...)`.

### 3.2.5 Soft Delete

Change `videosService.remove`:
```ts
await prisma.video.update({
  where: { id },
  data: { deletedAt: new Date() }
});
```

(Keep the S3 cleanup as-is — files still deleted immediately. Only the DB row is soft-deleted for audit trail.)

Add a `deletedAt: null` filter to all `findMany`/`findFirst` calls for Video.

### 3.2.6 Audit Service

File: `backend/src/services/auditService.ts` (new)
```ts
export const auditService = {
  log: async (params: {
    userId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    req?: Request;
  }) => {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata as any,
        ip: params.req?.ip,
        userAgent: params.req?.get("user-agent")
      }
    });
  }
};
```

Wire calls in `authService` and `videosService` at the end of each mutating method. Wrap in `.catch(console.error)` so audit failures never break user flows.

### 3.2.7 Idempotency Key Middleware

File: `backend/src/middleware/idempotency.ts` (new)

In-memory Map with 24h TTL, keyed by `${userId}:${idempotencyKey}:${routePath}`. Stores response status + body. Replays cached response on duplicate.

Apply to `POST /api/v1/videos/complete` only.

### 3.2.8 OpenAPI Generation

Build Zod schemas with `zod-openapi` extensions, register them, then serve docs at `GET /api/v1/docs` via `swagger-ui-express`.

Minimum: document `POST /auth/login`, `POST /auth/signup`, `POST /auth/refresh`, `GET /videos`, `POST /videos/upload-url`, `POST /videos/complete`, `GET /videos/:id`, `DELETE /videos/:id`.

## 3.3 Acceptance Criteria

- `curl http://localhost:4000/api/v1/videos?page=1&pageSize=5` returns `{ data: [...], meta: { total, page, pageSize, hasMore } }`
- Old `/videos` endpoint still works but response includes `Deprecation: true` header
- Sending `POST /api/v1/videos/complete` twice with same `Idempotency-Key` returns identical response (only one video created)
- Deleting a video preserves the DB row with `deletedAt` set; subsequent GET returns 404
- After login, an `AuditLog` row exists with `action: "auth.login"`, `userId: <user.id>`, IP populated
- `GET /api/v1/docs` renders Swagger UI showing all documented endpoints

---

# Phase 4 — Public / Private Videos + Discovery

**Goal:** Videos can be PRIVATE, UNLISTED, or PUBLIC. A public Browse page works without login. Categories, search, view counts, and featured videos are functional.

**Depends on:** Phases 2, 3.

**Effort:** ~6-8 hours.

## 4.1 Scope

### In Scope
- Visibility toggle on upload + edit endpoint
- New `GET /api/v1/browse` endpoint (no auth required, returns only PUBLIC + non-deleted videos)
- New `GET /api/v1/browse/:id` (single public video, no auth)
- Modified stream-proxy + thumbnail endpoint logic: PUBLIC videos accept stream tokens issued without user auth
- View counter (increment when stream token is issued for playback)
- Categories: hardcoded list of 8 — `Tech`, `Gaming`, `Music`, `Tutorial`, `Sports`, `News`, `Entertainment`, `Other` — exposed via `GET /api/v1/categories`
- Server-side title search: `GET /api/v1/browse?q=foo&category=Tech&page=1`
- Featured flag (admin only via RBAC): `PATCH /api/v1/admin/videos/:id { featured: true|false }`
- Featured endpoint: `GET /api/v1/browse/featured` (single most-recently-featured PUBLIC video)
- RBAC middleware: `requireAdmin` that 403s non-admin users

### Out of Scope
- Frontend UI for these (Phase 6, 8)
- Embed code, share links (Phase 5)

## 4.2 Tasks

### 4.2.1 Visibility Field Wiring

`videosService.completeUpload` — accept optional `visibility` and `category` from body. Default `PRIVATE` and `null`.

New endpoint: `PATCH /api/v1/videos/:id { visibility?, category?, title?, description? }` — owner only. Validate visibility transitions are allowed.

### 4.2.2 Browse Routes (No Auth)

File: `backend/src/routes/browse.ts` (new)

```ts
const browseRouter = Router();
browseRouter.get("/", listPublicVideos);          // ?q, ?category, ?page, ?pageSize
browseRouter.get("/featured", getFeaturedVideo);
browseRouter.get("/:id", getPublicVideo);
```

Mount at `/api/v1/browse`. No `requireAuth`.

### 4.2.3 listPublicVideos Service Method

```ts
async listPublic(params: { q?: string; category?: string; page: number; pageSize: number }) {
  const where: Prisma.VideoWhereInput = {
    visibility: "PUBLIC",
    status: "READY",
    deletedAt: null,
    ...(params.q ? { title: { contains: params.q, mode: "insensitive" } } : {}),
    ...(params.category ? { category: params.category } : {})
  };
  // ... same paginate pattern
}
```

### 4.2.4 Public-Video Stream Tokens

In `streamController.generateStreamToken`, add a `public` variant that doesn't require a `sub` user:

```ts
export function generatePublicStreamToken(videoId: string) {
  return jwt.sign({ videoId, type: "stream_public" }, env.JWT_SECRET, { expiresIn: "24h" });
}
```

In `streamHls` token validator, accept both `type === "stream"` and `type === "stream_public"`. For public type, verify the video is still PUBLIC at request time:

```ts
if (payload.type === "stream_public") {
  const video = await prisma.video.findUnique({ where: { id: payload.videoId } });
  if (!video || video.visibility !== "PUBLIC" || video.deletedAt) {
    return next(new HttpError(403, "Video not available"));
  }
}
```

In `videosService.getPublic`, return `playbackUrl` built with `generatePublicStreamToken`.

### 4.2.5 Thumbnail Endpoint for Public Videos

Add a no-auth public thumbnail variant: `GET /api/v1/browse/:id/thumbnail`. Skips JWT check, validates video is PUBLIC.

### 4.2.6 View Counter

Whenever a stream token is generated (either via `videosService.get` for owners or `getPublic` for everyone), increment:

```ts
await prisma.video.update({
  where: { id },
  data: { viewCount: { increment: 1 } }
});
```

Do this fire-and-forget (don't block the response).

> Note: this counts "playback attempts." For accurate view metrics in Phase 8 we'll switch to event-based tracking.

### 4.2.7 RBAC Middleware

File: `backend/src/middleware/auth.ts` — add:

```ts
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Unauthorized"));
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user?.role !== "ADMIN") return next(new HttpError(403, "Admin only"));
  next();
}
```

File: `backend/src/routes/admin.ts` (new)
```ts
adminRouter.use(requireAuth, requireAdmin);
adminRouter.patch("/videos/:id", patchVideoAdmin);   // can set featured, force-delete, etc.
adminRouter.get("/users", listUsers);
adminRouter.get("/stats", getPlatformStats);          // total users, total videos, total storage
```

Mount at `/api/v1/admin`.

### 4.2.8 Categories Endpoint

File: `backend/src/utils/categories.ts` (new):
```ts
export const CATEGORIES = ["Tech", "Gaming", "Music", "Tutorial", "Sports", "News", "Entertainment", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];
```

Endpoint `GET /api/v1/categories` returns `{ data: CATEGORIES }`.

Validate `category` field at upload/patch using `z.enum(CATEGORIES)`.

## 4.3 Acceptance Criteria

- `curl http://localhost:4000/api/v1/browse` (no auth) returns only PUBLIC videos
- `curl http://localhost:4000/api/v1/browse?q=tutorial&category=Tech` filters server-side
- `curl http://localhost:4000/api/v1/browse/<public-video-id>` returns full details including `playbackUrl` with public stream token
- Following that `playbackUrl` from a fresh browser session (no auth) successfully plays HLS
- Setting a video to PRIVATE removes it from browse results within one request
- Manually setting `role: ADMIN` on a user in DB → that user can call `PATCH /api/v1/admin/videos/:id { featured: true }`
- Non-admin calling the same endpoint gets 403
- `viewCount` increments by 1 each time `GET /videos/:id` or `GET /browse/:id` returns a video with `playbackUrl`

---

# Phase 5 — Sharing, Embeds, Seeding & Demo Users

**Goal:** Anyone can share a private video via a time-limited signed link. Public videos have an embed code. The app boots with realistic content and multiple demo users.

**Depends on:** Phases 2, 3, 4.

**Effort:** ~4-5 hours.

## 5.1 Scope

### In Scope
- `POST /api/v1/videos/:id/share` (owner) → returns `{ shareUrl, expiresAt }` (default TTL 24h, max 7 days)
- `GET /api/v1/share/:token` (no auth) → returns video metadata + playback URL if not expired/revoked
- `DELETE /api/v1/share/:id` (owner) → revoke
- `GET /api/v1/videos/:id/embed` (PUBLIC videos only) → returns `<iframe>` snippet
- `GET /embed/:id` (no auth, HTML response) → renders bare video player suitable for iframe embedding
- Seed script: `backend/scripts/seed.ts` — downloads 6 sample videos (Big Buck Bunny, Sintel, Tears of Steel, Elephants Dream, plus 2 short clips), uploads them through the normal upload flow, marks 3 as PUBLIC with categories
- Seed 3 demo users with credentials printed to stdout on boot if `--seed` flag passed

### Out of Scope
- Frontend share modal / embed modal (Phase 8)

## 5.2 Tasks

### 5.2.1 Share Link Service

File: `backend/src/services/shareService.ts` (new)

```ts
import { randomBytes, createHash } from "node:crypto";

export const shareService = {
  async create(params: { userId: string; videoId: string; ttlHours?: number }) {
    const ttl = Math.min(params.ttlHours ?? 24, 24 * 7);
    const video = await prisma.video.findFirst({
      where: { id: params.videoId, userId: params.userId, deletedAt: null }
    });
    if (!video) throw new HttpError(404, "Video not found");

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000);

    await prisma.shareLink.create({
      data: {
        tokenHash: createHash("sha256").update(token).digest("hex"),
        videoId: params.videoId,
        userId: params.userId,
        expiresAt
      }
    });

    return {
      shareUrl: `${env.PUBLIC_BASE_URL}/s/${token}`,
      token,
      expiresAt
    };
  },

  async resolve(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const link = await prisma.shareLink.findUnique({
      where: { tokenHash },
      include: { video: true }
    });
    if (!link || link.revokedAt || link.expiresAt < new Date() || link.video.deletedAt) {
      throw new HttpError(404, "Link not found or expired");
    }
    return link.video;
  }
};
```

Stream-token logic: when a share link resolves a video, generate a one-time stream token bound to that video for 24h. Reuse `generatePublicStreamToken`.

### 5.2.2 Embed Route

File: `backend/src/routes/embed.ts` (new)

`GET /embed/:id` returns a minimal HTML page with the Video.js player pre-loaded with the public stream URL. Refuses non-PUBLIC videos. Sets `X-Frame-Options: ALLOWALL` and `Content-Security-Policy: frame-ancestors *` so it embeds anywhere.

The `/api/v1/videos/:id/embed` endpoint returns:
```json
{
  "html": "<iframe src=\"http://localhost:4000/embed/<id>\" width=\"640\" height=\"360\" frameborder=\"0\" allowfullscreen></iframe>",
  "src": "http://localhost:4000/embed/<id>"
}
```

### 5.2.3 Seed Script

File: `backend/scripts/seed.ts` (new)

```ts
import { prisma } from "../src/db/prisma.js";
import bcrypt from "bcryptjs";
import { s3, presignPutObject } from "../src/services/s3.js";
import { videoTranscodeQueue } from "../src/queue/videoQueue.js";

const SAMPLE_VIDEOS = [
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", title: "Big Buck Bunny", category: "Entertainment", visibility: "PUBLIC" },
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", title: "Sintel", category: "Entertainment", visibility: "PUBLIC" },
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4", title: "Tears of Steel", category: "Entertainment", visibility: "PUBLIC" },
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", title: "Elephants Dream", category: "Tutorial", visibility: "PRIVATE" },
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4", title: "For Bigger Joyrides", category: "Sports", visibility: "PRIVATE" },
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4", title: "Subaru Outback Off-road", category: "Sports", visibility: "UNLISTED" }
];

const DEMO_USERS = [
  { email: "alice@demo.com", password: "demo1234", role: "USER", displayName: "Alice" },
  { email: "bob@demo.com", password: "demo1234", role: "USER", displayName: "Bob" },
  { email: "admin@demo.com", password: "admin1234", role: "ADMIN", displayName: "Admin" }
];

async function main() {
  console.log("=== Seeding demo users ===");
  for (const u of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
        role: u.role as any,
        displayName: u.displayName,
        emailVerified: true
      }
    });
    console.log(`  ${u.email} / ${u.password}  (${u.role})`);
  }

  console.log("\n=== Seeding sample videos ===");
  const alice = await prisma.user.findUnique({ where: { email: "alice@demo.com" } });
  const bob = await prisma.user.findUnique({ where: { email: "bob@demo.com" } });
  const userPool = [alice!, bob!];

  for (let i = 0; i < SAMPLE_VIDEOS.length; i++) {
    const sample = SAMPLE_VIDEOS[i];
    const owner = userPool[i % userPool.length];

    // Skip if a video with this title already exists for this user
    const existing = await prisma.video.findFirst({
      where: { title: sample.title, userId: owner.id }
    });
    if (existing) {
      console.log(`  [skip] ${sample.title} already exists`);
      continue;
    }

    const videoId = `seed_${i}_${Date.now()}`;
    const inputKey = `uploads/${videoId}/input.mp4`;

    // Stream-download sample mp4 → S3
    console.log(`  [download] ${sample.url}`);
    const res = await fetch(sample.url);
    if (!res.ok) throw new Error(`Failed to fetch ${sample.url}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    await s3.send(new (await import("@aws-sdk/client-s3")).PutObjectCommand({
      Bucket: env.S3_BUCKET, Key: inputKey, Body: buffer, ContentType: "video/mp4"
    }));

    await prisma.video.create({
      data: {
        id: videoId, title: sample.title, status: "UPLOADED",
        visibility: sample.visibility as any, category: sample.category,
        inputUrl: `s3://${env.S3_BUCKET}/${inputKey}`, inputKey,
        userId: owner.id, sizeBytes: BigInt(buffer.length)
      }
    });

    await videoTranscodeQueue.add("transcode", {
      videoId, bucket: env.S3_BUCKET, inputKey
    });
    console.log(`  [queued] ${sample.title} → ${owner.email}`);
  }

  console.log("\n=== Done. Transcoding will complete in the worker. ===");
  console.log("Login at http://localhost:5173 with any of the credentials above.");
  await prisma.$disconnect();
}

main().catch(console.error);
```

Add to `backend/package.json`:
```json
"scripts": {
  "seed": "tsx scripts/seed.ts"
}
```

### 5.2.4 PUBLIC_BASE_URL Env Var

File: `backend/src/utils/env.ts` — add `PUBLIC_BASE_URL` (e.g. `http://localhost:4000`) for constructing share URLs and embed src.

## 5.3 Acceptance Criteria

- `npm run seed` from `backend/` creates 3 users + 6 videos; videos start transcoding; on completion 3 are PUBLIC and visible on `/api/v1/browse`
- `POST /api/v1/videos/<id>/share { ttlHours: 1 }` returns a `shareUrl` like `http://localhost:4000/s/<token>`
- `GET /api/v1/share/<token>` returns video metadata with a fresh playable URL
- After 1 hour the same token returns 404
- `DELETE /api/v1/share/<id>` revokes immediately
- `GET /embed/<public-video-id>` returns a working HTML page with the Video.js player loaded
- Iframe-embedding that URL on any HTML page successfully plays the video

---

# Phase 6 — Real-time Progress + Performance

**Goal:** Transcode progress streams over SSE (no more 3s polling). Range requests work on .ts segments. Multi-size thumbnails. Stream endpoint rate-limited.

**Depends on:** Phases 2, 3.

**Effort:** ~3-4 hours.

## 6.1 Scope

### In Scope
- SSE endpoint `GET /api/v1/videos/:id/events` — streams `progress`, `status`, `done` events
- Worker publishes progress to Redis pub/sub channel `video:<id>:progress`
- Backend subscribes and fans out to SSE clients
- Range request support on `.ts` streaming (HTTP 206 Partial Content)
- Stream proxy rate limit: 600 requests/min per IP (high enough for normal HLS, blocks abuse)
- Multi-resolution thumbnails: worker generates 3 sizes (320×180, 640×360, 1280×720)
- `Video.thumbnailUrl` becomes `thumbnails: { sm, md, lg }` on API responses

### Out of Scope
- Frontend integration (Phase 7+)

## 6.2 Tasks

### 6.2.1 SSE Endpoint

File: `backend/src/controllers/eventsController.ts` (new)

```ts
import IORedis from "ioredis";
const sub = new IORedis(env.REDIS_URL);

export async function videoEvents(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return next(new HttpError(401, "Unauthorized"));
    const { id } = req.params;

    // Verify user owns video OR video is PUBLIC
    const video = await prisma.video.findFirst({
      where: { id, OR: [{ userId: req.user.id }, { visibility: "PUBLIC" }] }
    });
    if (!video) return next(new HttpError(404, "Not found"));

    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.flushHeaders();

    // Send current state immediately
    res.write(`event: snapshot\ndata: ${JSON.stringify({ status: video.status, progress: video.progress })}\n\n`);

    const channel = `video:${id}:progress`;
    const localSub = sub.duplicate();
    await localSub.subscribe(channel);
    localSub.on("message", (_ch, msg) => {
      res.write(`event: update\ndata: ${msg}\n\n`);
    });

    req.on("close", () => {
      localSub.unsubscribe(channel).then(() => localSub.disconnect());
    });
  } catch (err) {
    next(err);
  }
}
```

Add route `videosRouter.get("/:id/events", requireAuth, videoEvents);`

### 6.2.2 Worker Publishes Progress

File: `worker/src/worker.ts`

```ts
import IORedis from "ioredis";
const pub = new IORedis(env.REDIS_URL);

// inside the job handler's onProgress:
onProgress: async ({ rendition, percent }) => {
  // ... existing code ...
  await pub.publish(`video:${videoId}:progress`, JSON.stringify({ status: "PROCESSING", progress: overall, rendition, renditionPercent: percent }));
}

// After job completes:
await pub.publish(`video:${videoId}:progress`, JSON.stringify({ status: "READY", progress: 100 }));

// On failure (in catch block):
await pub.publish(`video:${videoId}:progress`, JSON.stringify({ status: "FAILED", error: message }));
```

### 6.2.3 Range Request Support on .ts

In `streamController.streamHls` for `.ts` path, check `req.headers.range`:

```ts
const range = req.headers.range;
if (range) {
  const match = /bytes=(\d+)-(\d*)/.exec(range);
  if (match) {
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : undefined;
    // Use S3 GetObjectCommand with Range header
    const cmd = new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: s3Key,
      Range: `bytes=${start}-${end ?? ""}`
    });
    const response = await s3.send(cmd);
    res.status(206);
    res.set("Content-Range", `bytes ${start}-${end ?? response.ContentLength! - 1 + start}/${response.ContentLength}`);
    res.set("Accept-Ranges", "bytes");
    res.set("Content-Type", "video/mp2t");
    (response.Body as Readable).pipe(res);
    return;
  }
}
```

(Add `getObjectStream` overload in `s3.ts` to accept a `range` param.)

### 6.2.4 Multi-Resolution Thumbnails

File: `worker/src/transcode/ffmpeg.ts` — add `generateThumbnails(...)` (plural) that emits 3 sizes:

```ts
export async function generateThumbnails(params: { inputPath: string; outDir: string }) {
  const sizes = [
    { name: "sm", w: 320, h: 180 },
    { name: "md", w: 640, h: 360 },
    { name: "lg", w: 1280, h: 720 }
  ];
  for (const s of sizes) {
    const out = path.join(params.outDir, `thumb_${s.name}.jpg`);
    await runFfmpeg([
      "-hide_banner", "-y",
      "-ss", "00:00:01", "-i", params.inputPath,
      "-vf", `scale=${s.w}:${s.h}`,
      "-frames:v", "1", "-q:v", "2",
      out
    ]);
  }
}
```

Worker uploads to `videos/:id/thumb_sm.jpg`, `thumb_md.jpg`, `thumb_lg.jpg`.

Update `streamThumbnail` to accept `?size=sm|md|lg` query (default `md`).

In `videosService.list` and `videosService.get`, return:
```ts
thumbnails: video.thumbnailUrl ? {
  sm: `/api/v1/videos/${id}/thumbnail?size=sm`,
  md: `/api/v1/videos/${id}/thumbnail?size=md`,
  lg: `/api/v1/videos/${id}/thumbnail?size=lg`
} : null
```

Keep `thumbnailUrl` for backward compat (point to md).

### 6.2.5 Stream Endpoint Rate Limit

`backend/src/middleware/rateLimiter.ts` — add:
```ts
export const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false
});
```

Apply to `videosRouter.get("/:id/stream/hls/*", streamLimiter, streamHls);`.

## 6.3 Acceptance Criteria

- Uploading a video → opening SSE in another terminal:
  `curl -N -H "Authorization: Bearer <token>" http://localhost:4000/api/v1/videos/<id>/events`
  shows live progress events streamed
- After transcode completes, an SSE `update` event with `{ status: "READY" }` is emitted within 1s
- `curl -I -H "Range: bytes=0-1024" http://localhost:4000/api/v1/videos/<id>/stream/hls/360p/seg_00000.ts?t=<token>` returns HTTP 206 with `Content-Range` header
- Three thumbnail sizes exist in S3 for each new video; `GET /api/v1/videos/<id>/thumbnail?size=sm` returns the small version
- Stream endpoint returns 429 after 600 requests/min from the same IP

---

# Phase 7 — UI Redesign (Clean SaaS Dark)

**Goal:** Visual overhaul — Vercel/Linear-inspired dark minimal. Drop-in replacement of all 5 pages plus new Browse page.

**Depends on:** Phases 2-6 backend changes (uses paginated APIs, browse endpoint, SSE, multi-thumb, etc.).

**Effort:** ~6-8 hours.

## 7.1 Scope

### In Scope
- Add Inter font via Google Fonts CDN in `index.html`
- Install and use `lucide-react`, `sonner` (toasts)
- Complete rewrite of `frontend/src/styles.css` (~400 lines)
- Redesign `App.tsx`: full-width nav, logo mark + user avatar dropdown
- Redesign `Auth.tsx`: centered card layout
- Redesign `Upload.tsx`: drag-and-drop zone + progress bar + visibility selector
- Redesign `Videos.tsx` (rename to "My Library"): stat cards + grid + hover effects + empty state + skeletons
- New page `Browse.tsx`: public videos, hero (featured), category filter chips, search bar
- Redesign `Player.tsx`: full-width player + info panel + back button
- Replace polling in Player + Videos with SSE (using Phase 6 endpoint)
- Toast notifications replace inline `<p className="error">` patterns

### Out of Scope
- Analytics dashboard (Phase 8)
- Share modal / embed modal UI (Phase 8)

## 7.2 Tasks

### 7.2.1 Dependencies

```bash
cd frontend
npm install lucide-react sonner
```

`frontend/index.html` — add inside `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### 7.2.2 Design Tokens — `styles.css`

```css
:root {
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;

  /* Surfaces */
  --bg:           #0a0a0a;
  --bg-elevated:  #111111;
  --bg-hover:     #1a1a1a;
  --bg-pressed:   #222222;

  /* Borders */
  --border:           rgba(255, 255, 255, 0.06);
  --border-strong:    rgba(255, 255, 255, 0.10);
  --border-hover:     rgba(255, 255, 255, 0.16);

  /* Text */
  --text:        #ededed;
  --text-muted:  #888888;
  --text-faint:  #555555;

  /* Accent */
  --accent:       #6366f1;
  --accent-hover: #7c7ff5;
  --accent-soft:  rgba(99, 102, 241, 0.12);

  /* Status */
  --success: #10b981;
  --warning: #f59e0b;
  --danger:  #ef4444;
  --info:    #3b82f6;

  /* Radii */
  --r-sm: 6px;
  --r-md: 8px;
  --r-lg: 12px;

  color-scheme: dark;
}

/* ... full body, nav, button, card, input, badge, hover-overlay,
   skeleton-shimmer, empty-state, hero-banner, category-chip styles ... */
```

(Full CSS will be ~400 lines. Reference Vercel/Linear inspector for exact rhythm; use 4/8/12/16/24/32 spacing scale; 13/14/16/20/28/32 type scale.)

### 7.2.3 Toast Provider

`App.tsx` — wrap routes with `<Toaster theme="dark" position="top-right" />` from `sonner`. Replace all inline error `<p>` usage with `toast.error(...)` and `toast.success(...)`.

### 7.2.4 New Browse Page

File: `frontend/src/pages/Browse.tsx` (new)

Structure:
```
[ Hero featured video — 100% width, 40vh height, title + Watch CTA ]

[ Search ____________________ ]   [ Tech ] [ Gaming ] [ Music ] ...

[ Card ] [ Card ] [ Card ] [ Card ]      ← Grid
[ Card ] [ Card ] [ Card ] [ Card ]

[ ← Prev   Page 1 of 5   Next → ]
```

Calls `GET /api/v1/browse?q=&category=&page=`. Server-side filters/pagination.

### 7.2.5 Library Page (Renamed)

File: `frontend/src/pages/Videos.tsx` → keep filename, rebrand UI as "My Library."

Top:
```
My Library                                  [+ Upload]
[12 videos]  [8 ready]  [2 processing]  [1 failed]
```

Grid of cards (same component as Browse, but with delete + visibility badge).

Skeleton shimmer state during first load.

Empty state with cloud-upload icon + CTA.

### 7.2.6 Upload Page

```
┌────────────────────────────────────────┐
│  ↑                                      │
│  Drag & drop your video here            │
│  or click to browse                     │
│                                         │
│  MP4, MOV, AVI, WebM · Max 2GB          │
└────────────────────────────────────────┘

Title       [_________________________]
Category    [▼ Select]
Visibility  ( ) Private  ( ) Unlisted  ( ) Public

[Upload & Transcode]
```

Use HTML5 drag-drop API (no library needed).

Show progress bar during S3 PUT (XHR or `fetch` + ReadableStream to track upload bytes — use XMLHttpRequest because `fetch` upload progress isn't standard).

### 7.2.7 Player Page Redesign

```
← Back to Library

[ ── FULL-WIDTH VIDEO PLAYER ── ]

Title (28px)                                       [Share] [🗑]
●Public · Tech · 12,345 views · 5:23 · Uploaded 2 days ago

Description goes here if present...
```

Use SSE for live progress instead of polling:
```ts
useEffect(() => {
  const es = new EventSource(`${baseUrl}/api/v1/videos/${id}/events`, { withCredentials: true });
  // Note: EventSource doesn't support custom headers — use a query token instead, OR
  // poll first via api() and switch to SSE once status === "PROCESSING"
}, [id]);
```

> Caveat: `EventSource` can't send `Authorization` headers. Either accept an `?auth=<jwt>` query param on the SSE route, or fall back to polling for the first call and only use SSE after authenticated.

### 7.2.8 Visibility Selector + Category in Upload

When calling `POST /videos/complete`, include `visibility` and `category` in the request body. Backend was updated in Phase 4 to accept these.

## 7.3 Acceptance Criteria

- Visit `http://localhost:5173` while logged out → redirected to `/browse` (new behavior)
- `/browse` renders without auth and shows public videos in a 4-column grid (3 on tablet, 1 on mobile)
- Category chips filter the grid via the API (not client-side)
- Search box filters server-side after 300ms debounce
- Featured video appears as hero on top of browse page with "Watch Now" CTA
- Hovering a card → thumbnail darkens + play button appears centered
- `/library` loads with skeleton shimmer for ~200ms, then renders cards
- Upload page: dropping an MP4 file onto the dropzone shows file name + size + thumbnail preview
- Upload page visibility radio buttons work; backend respects them
- During upload, a progress bar fills 0 → 100%
- Player page: while transcode is processing, progress updates smoothly without 3s lag (SSE)
- All error and success states show as top-right toasts, not inline

---

# Phase 8 — Analytics + Polish (Share/Embed UI, Watch History)

**Goal:** Stakeholder-impressive analytics + the remaining UI polish (share modal, embed modal, continue-watching, in-player history tracking).

**Depends on:** Phases 2-7.

**Effort:** ~3-4 hours.

## 8.1 Scope

### In Scope
- `POST /api/v1/videos/:id/heartbeat { positionSec }` — updates `WatchHistory` for current user
- `GET /api/v1/me/history` — list videos user has watched (with positionSec for continue-watching)
- `GET /api/v1/me/stats` — for the logged-in user: total uploads, total views received, total storage, watch time
- `GET /api/v1/admin/stats` — for admins only: aggregate platform stats
- Recharts on frontend for stats visualization (`npm install recharts`)
- Share modal: button on Player page → modal showing copyable URL + expiry picker
- Embed modal: only for PUBLIC videos → shows iframe snippet with copy button
- "Continue Watching" row at top of My Library page
- Player calls heartbeat every 10s to record position

### Out of Scope
- Real-time analytics (events stay simple — just counters)

## 8.2 Tasks

### 8.2.1 Heartbeat Endpoint

```ts
// POST /api/v1/videos/:id/heartbeat
async heartbeat({ userId, videoId, positionSec, completed }) {
  await prisma.watchHistory.upsert({
    where: { userId_videoId: { userId, videoId } },
    update: { positionSec, watchedAt: new Date(), completedAt: completed ? new Date() : undefined },
    create: { userId, videoId, positionSec, completedAt: completed ? new Date() : null }
  });
}
```

### 8.2.2 Continue-Watching Endpoint

```ts
// GET /api/v1/me/history?continueWatching=true
// Returns watchHistory entries where completedAt is null AND positionSec > 5
```

### 8.2.3 Stats Endpoints

```ts
// GET /api/v1/me/stats
{
  uploads: 12,
  totalViews: 1834,
  totalStorageBytes: 4123456789,
  totalWatchTimeSeconds: 9241,
  viewsLast7Days: [ { date: "2026-05-14", count: 120 }, ... ]
}
```

For `viewsLast7Days`, we don't track per-day yet — use heuristic: count `WatchHistory.watchedAt` per day for now. (Real event tracking is out of scope.)

### 8.2.4 Frontend — Analytics Page

File: `frontend/src/pages/Stats.tsx` (new)

Use `recharts` BarChart for views-per-day, KPI cards for totals.

### 8.2.5 Share Modal

```tsx
<Dialog>
  <h2>Share this video</h2>
  <div>
    Anyone with this link can watch this video until {expiresAt}.
    <input readonly value={shareUrl} />
    <button onClick={copyToClipboard}>Copy</button>
  </div>
  <select value={ttlHours} onChange={...}>
    <option value="1">1 hour</option>
    <option value="24">24 hours</option>
    <option value="168">7 days</option>
  </select>
  <button onClick={createShareLink}>Generate</button>
</Dialog>
```

No external dialog lib needed — use a basic styled overlay.

### 8.2.6 Embed Modal

Only shows on PUBLIC videos. Calls `GET /api/v1/videos/:id/embed`, displays HTML snippet + a "Preview" iframe.

### 8.2.7 Continue-Watching Row

In `Videos.tsx` (My Library), prepend a horizontal scrolling row:
```
Continue watching →
[ progress bar 45% | thumbnail | title ]  [ ... ]  [ ... ]
```

Calls `GET /api/v1/me/history?continueWatching=true`.

### 8.2.8 Heartbeat from Player

In `Player.tsx`:
```ts
useEffect(() => {
  if (!player.current) return;
  const intervalId = setInterval(() => {
    const pos = Math.floor(player.current!.currentTime() ?? 0);
    if (pos > 0) {
      api(`/api/v1/videos/${id}/heartbeat`, {
        method: "POST",
        body: JSON.stringify({ positionSec: pos })
      }).catch(() => {});
    }
  }, 10000);
  return () => clearInterval(intervalId);
}, [player.current]);

// Also call once on "ended" event with completed: true
```

## 8.3 Acceptance Criteria

- Playing a video for 30s, then refreshing the player page → video resumes at the previous position (within ±10s)
- `GET /api/v1/me/history?continueWatching=true` returns the in-progress video
- "Continue Watching" row appears on My Library when there are in-progress videos
- Player page → Share button opens modal, generates URL, copy-to-clipboard works
- For PUBLIC videos, Embed button appears, modal shows iframe snippet, preview works
- `/stats` page shows KPI cards + a 7-day bar chart of views
- Admin user sees additional platform-wide stats card on `/stats`

---

# Final Sanity Pass (Post-Phase 8)

After all phases land, do one polish pass:

1. Boot full stack: `npm run docker:up && npm run seed && npm run dev`
2. Open `http://localhost:5173` while logged out — should see Browse with 3 public videos + featured hero
3. Login as `alice@demo.com / demo1234` — see Library with her 3 private/unlisted videos
4. Upload a new video with Public visibility — appears on Browse after transcoding
5. Share a private video → open the share URL in incognito → plays
6. Embed a public video → paste iframe code on any HTML file → plays
7. Open `/stats` as admin (`admin@demo.com / admin1234`) → see platform stats
8. Watch a video for 30s, refresh, see continue-watching position preserved
9. Try playing a private video without login → 401, redirected to Auth
10. Try setting a video to Public from Library → it appears on Browse immediately

If all 10 pass → ready for stakeholder demo.

---

# Execution Notes for Agents

- **Each phase is one agent run.** Do not interleave phases.
- **Read this file before starting any phase.** Acceptance criteria are the contract.
- **Run the migration after every Prisma schema change** and commit the migration file.
- **Run `npx tsc --noEmit`** in both `backend/` and `frontend/` before declaring a phase complete.
- **Boot the stack and manually verify acceptance criteria** before signing off.
- **Never use `prisma db push` going forward** — always `prisma migrate dev --name <descriptive>`.
- **Preserve backward compatibility** of legacy `/auth` and `/videos` routes until Phase 8 is complete (then they can be removed).
- **All new env vars** must be added to `.env.example` and `backend/.env` (and `worker/.env` if relevant).
- **All new dependencies** must include the install command in the phase's task list, exactly as written.
