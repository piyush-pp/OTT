# Frontend Learning Roadmap — OTT Project

This is a **read-in-order** guide for understanding the frontend of this OTT streaming MVP. Each phase builds on the last. You do not need deep backend knowledge at first, but skimming [`ARCHITECTURE_FLOW.md`](ARCHITECTURE_FLOW.md) once will help you see *why* the frontend does certain things (upload to S3, HLS playback, JWT, etc.).

---

## What You Are Looking At

This frontend is a **React 18 + TypeScript** SPA built with **Vite**, routed with **react-router-dom**, styled with plain **CSS**, and talking to a REST API via **`fetch`**.

| Piece | Role in this repo |
|--------|-------------------|
| **Vite** | Dev server + bundler (`npm run dev` on port 5173) |
| **React** | UI as components + state |
| **TypeScript** | Types for API responses, props, etc. |
| **React Router** | URLs like `/browse`, `/videos/:id` |
| **Video.js** | HLS video player on the watch page |
| **Sonner** | Toast notifications |
| **lucide-react** | Icons |
| **recharts** | Charts on the Stats page |

---

## Before You Read Code

### 1. Run the app

From repo root (with backend/docker up per project README):

```bash
cd frontend
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:4000
npm install
npm run dev
```

### 2. Click through every route

Keep DevTools → **Network** open:

| URL | What to notice |
|-----|----------------|
| `/browse` | Public catalog, no login required |
| `/auth` | Login → tokens stored |
| `/library` | Your videos (needs auth) |
| `/upload` | File picker → presigned PUT → complete |
| `/videos/:id` | Player, SSE progress while processing |
| `/stats` | Admin-style metrics |
| `/s/:token` | Shared link playback |

### 3. One-time architecture read (30 min)

Read [`ARCHITECTURE_FLOW.md`](ARCHITECTURE_FLOW.md) — sections 1–3 are enough for frontend context.

---

## Phase 0 — How the App Boots (30 min)

Read in this order:

| # | File | Concepts |
|---|------|----------|
| 1 | `frontend/index.html` | Single `<div id="root">`; Vite injects the JS entry |
| 2 | `frontend/vite.config.ts` | Dev server port, React plugin |
| 3 | `frontend/src/main.tsx` | `ReactDOM.createRoot`, `BrowserRouter`, global CSS import |
| 4 | `frontend/.env.example` | `import.meta.env.VITE_*` env vars |

**Mental model:** `index.html` → `main.tsx` mounts React → `App` owns layout + routes.

---

## Phase 1 — Shell, Routing, Auth Gate (1–2 hours)

| # | File | Concepts |
|---|------|----------|
| 5 | `frontend/src/pages/App.tsx` | `Routes` / `Route`, `Navigate`, `RequireAuth`, `TopNav`, `useEffect`, `useRef`, `useState` |
| 6 | Skim `frontend/src/styles.css` (first ~200 lines) | Layout classes: `.app-shell`, `.topnav`, `.btn` — read more as you hit UI in pages |

**Focus in `App.tsx`:**

- **Routing:** which paths are public vs wrapped in `<RequireAuth>`
- **Auth UI:** `isLoggedIn()`, JWT email decode for avatar initials
- **Side effects:** `useEffect` for menu close, admin probe, sync auth on route change
- **Toaster:** global notifications via Sonner

**Exercise:** Add a `console.log(location.pathname)` in `TopNav` and watch it change as you navigate.

---

## Phase 2 — API Layer (1–2 hours) — Read Before Most Pages

| # | File | Concepts |
|---|------|----------|
| 7 | `frontend/src/api/client.ts` | `fetch`, JWT in headers, `localStorage`, token refresh on 401, `api<T>()` helper |

This file is the **spine** of the app. Every page imports from here.

**Key ideas:**

- `api(path, init)` — authenticated JSON calls
- `setTokens` / `getAccessToken` — session in browser storage
- `apiUrl(path)` — full URL for images/thumbnails
- Refresh queue when multiple requests hit 401 at once

**Exercise:** In Network tab, log in, then trigger a request and find the `Authorization: Bearer` header.

---

## Phase 3 — Simplest Page: Forms + API (45 min)

| # | File | Concepts |
|---|------|----------|
| 8 | `frontend/src/pages/Auth.tsx` | Controlled inputs, `useState`, `useMemo`, async submit, `useNavigate`, toasts |

**Patterns to notice:**

- Local state: `email`, `password`, `mode` (login/signup/forgot)
- `handleSubmit` → `api(...)` → `setTokens` → `navigate("/library")`
- Error/success via `toast` from Sonner

This is the template for almost every other page: **state → call API → update UI → navigate**.

---

## Phase 4 — Reusable UI: Components (1 hour)

Read **before** the big list pages:

| # | File | Concepts |
|---|------|----------|
| 9 | `frontend/src/components/VideoCard.tsx` | Props, `variant`, conditional UI, `Link`, thumbnail URL logic |
| 10 | `frontend/src/components/ContinueWatchingCard.tsx` | Smaller card variant (if used from Browse) |
| 11 | `frontend/src/components/ShareModal.tsx` | Modal pattern, lifting state from parent |
| 12 | `frontend/src/components/EmbedModal.tsx` | Same pattern for embed code |

**`VideoCard` is important:** it shows how **browse** (public thumbnails) vs **library** (auth query param) differ — same component, different `variant`.

---

## Phase 5 — Data Loading: Lists, Search, Pagination (1–2 hours)

| # | File | Concepts |
|---|------|----------|
| 13 | `frontend/src/pages/Browse.tsx` | `useEffect` data fetch, debounced search, pagination, loading skeletons |
| 14 | `frontend/src/pages/Videos.tsx` | “My library” — similar list, delete actions |

**Patterns:**

- Fetch on mount + when `page` / `debouncedSearch` / `category` changes
- `loading` state → show `VideoCardSkeleton`
- `meta.hasMore` for “load more” or next page

**Exercise:** Change `PAGE_SIZE` in Browse and see how many cards load per request.

---

## Phase 6 — Upload Flow (1–2 hours) — Ties to Architecture Doc

| # | File | Concepts |
|---|------|----------|
| 15 | `frontend/src/pages/Upload.tsx` | File input, validation, **two-step upload** (API URL → PUT to storage → complete) |

**Flow to trace with Network tab:**

1. `POST` upload-url → get `uploadUrl`, `videoId`
2. `PUT` directly to MinIO/S3 (not through your API)
3. `POST` complete with metadata

Also note: `useRef` for hidden file input, progress state, category/visibility enums.

Cross-read: `ARCHITECTURE_FLOW.md` §3 Steps B–D.

---

## Phase 7 — Player: Hardest Frontend File (2–3 hours)

| # | File | Concepts |
|---|------|----------|
| 16 | `frontend/src/pages/Player.tsx` | `useParams`, Video.js, refs, SSE, resume progress, modals |
| 17 | `frontend/src/components/qualitySelector.ts` | Imperative DOM hook for HLS quality menu |

**Read in chunks:**

1. **Load video metadata** — `api` for video by `id`
2. **Processing state** — SSE or polling for `status` / `progress`
3. **Playback** — when `status === "READY"`, Video.js + `playbackUrl` (HLS `.m3u8`)
4. **Watch progress** — save position, resume on load (`seekedOnce` ref)
5. **Owner actions** — delete, visibility, share/embed modals

**Concepts that often confuse beginners:**

- `useRef` for the `<video>` element and the Video.js instance (DOM lives outside React render)
- `useEffect` cleanup — destroy player on unmount
- `lockedSrc` — avoid re-initializing player when React re-renders

Cross-read: `ARCHITECTURE_FLOW.md` playback section.

---

## Phase 8 — Share + Stats (1 hour)

| # | File | Concepts |
|---|------|----------|
| 18 | `frontend/src/pages/Share.tsx` | Public route `/s/:token`, token in URL |
| 19 | `frontend/src/pages/Stats.tsx` | Charts (recharts), admin-gated data |

Compare **Share** (token-based, minimal auth) with **Player** (id-based, richer UI).

---

## Phase 9 — Styling System (ongoing, 1–2 hours)

| # | File | Concepts |
|---|------|----------|
| 20 | `frontend/src/styles.css` | CSS variables, layout, cards, player chrome, responsive rules |

**Tip:** Don’t read all ~1800 lines at once. When you read a page, search styles for its main class (e.g. `.browse-hero`, `.player-layout`).

---

## Phase 10 — Optional: Backend Touchpoints (when frontend “clicks”)

Only when you wonder *what the API returns*:

| Frontend calls | Backend to peek at |
|----------------|-------------------|
| Auth | `backend/src/routes/auth.ts`, `authController.ts` |
| Browse | `backend/src/routes/browse.ts`, `browseController.ts` |
| Videos / upload | `backend/src/routes/videos.ts`, `videosService.ts` |
| Stream / SSE | `backend/src/controllers/streamController.ts` |

You do **not** need Node/Prisma fluency to understand the frontend; use backend files as API reference.

---

## Suggested 2-Week Schedule

| Day | Focus |
|-----|--------|
| 1 | Phase 0–1: boot + `App.tsx`, click all routes |
| 2 | Phase 2: `client.ts` + Network tab with JWT |
| 3 | Phase 3–4: `Auth.tsx` + `VideoCard.tsx` |
| 4 | Phase 5: `Browse.tsx` |
| 5 | Phase 5: `Videos.tsx` |
| 6 | Phase 6: `Upload.tsx` + architecture upload section |
| 7–8 | Phase 7: `Player.tsx` + `qualitySelector.ts` |
| 9 | Phase 8: `Share.tsx`, `Stats.tsx` |
| 10+ | Phase 9: CSS deep dive; small tweaks as exercises |

---

## Mini Exercises (best way to learn)

1. **Change copy** — Browse empty state message in `Browse.tsx`.
2. **New nav link** — Add a “Help” route in `App.tsx` with a one-line placeholder component.
3. **Log API errors** — In `client.ts`, `console.error` before `throw new Error`.
4. **Break and fix** — Wrong `VITE_API_BASE_URL`; see failed `fetch` in Network tab.
5. **Trace one feature end-to-end** — e.g. delete video: button in `VideoCard` → handler in `Videos.tsx` → `api(DELETE)` → Network tab.

---

## File Tree (frontend only)

```
frontend/
├── index.html              ← entry HTML
├── vite.config.ts
├── src/
│   ├── main.tsx            ← React mount
│   ├── styles.css          ← global styles
│   ├── api/
│   │   └── client.ts       ← HTTP + auth (read early)
│   ├── pages/
│   │   ├── App.tsx         ← routes + layout
│   │   ├── Auth.tsx
│   │   ├── Browse.tsx
│   │   ├── Videos.tsx
│   │   ├── Upload.tsx
│   │   ├── Player.tsx      ← most complex
│   │   ├── Share.tsx
│   │   └── Stats.tsx
│   └── components/
│       ├── VideoCard.tsx
│       ├── ContinueWatchingCard.tsx
│       ├── ShareModal.tsx
│       ├── EmbedModal.tsx
│       └── qualitySelector.ts
```

---

## If You Get Stuck

| Symptom | Likely place |
|--------|----------------|
| Redirected to `/auth` | `RequireAuth` in `App.tsx`, empty token in `client.ts` |
| 401 loops / “Session expired” | `attemptRefresh` in `client.ts` |
| Upload fails after URL step | `Upload.tsx` PUT step; CORS/storage in docker |
| Player black screen | `Player.tsx` + `playbackUrl`; video not `READY` yet |
| Thumbnail broken | `VideoCard` `thumbnailSrc` + auth query param |

---

## Related docs

- [`ARCHITECTURE_FLOW.md`](ARCHITECTURE_FLOW.md) — end-to-end system flow (upload, transcode, playback)
- [`PHASES.md`](PHASES.md) — project phase milestones (if present)
