# Ad Module — How It Actually Works (As-Built Guide)

> A practical, behind-the-scenes guide to the ad-management system in this OTT app.
> After reading this you should understand the full flow, the technical jargon, every
> API involved, what each API does, and what happens internally when ads get served.
>
> This is the **"as-built"** companion to [`AD_INSERTION.md`](AD_INSERTION.md) (which is the
> theory + original plan). This doc describes the code that actually exists today.

---

## 0. The 60-second mental model

There are **two sides** to the module:

1. **Admin side (management):** An admin uploads ad videos ("creatives"), creates
   "campaigns" (a time-boxed budget container), and creates "placements" (rules that say
   *which ad plays where, when, and for whom*). All of this is plain CRUD over a REST API
   guarded by an admin role.

2. **Viewer side (serving):** When *any* viewer plays a video, the backend decides — on the
   fly — which ads to insert, and **rewrites the video's HLS playlist** so the ad segments
   are spliced directly into the content stream. The player just plays one continuous stream;
   it never knows ads were injected. This technique is called **SSAI (Server-Side Ad Insertion)**.

The key idea: **we don't use a separate ad player or VAST tags.** We stitch ads into the
manifest server-side. The browser's video player sees one seamless HLS stream.

```
ADMIN                                    VIEWER
  │ upload creative (MP4)                  │ open /watch/:id
  │ → transcoded to HLS                    │ player asks for master.m3u8
  │ create campaign (dates/budget)         │ → backend builds an "ad session"
  │ create placement (rules + CPM)         │ player asks for 360p/index.m3u8
  ▼                                        │ → backend STITCHES ads into playlist
 [Postgres: creatives,                     │ player plays content+ads as one stream
  campaigns, placements]   ──────────────► │ backend records impressions/quartiles
                                           ▼
                                       [Ad Analytics dashboard]
```

---

## 1. Jargon dictionary (read this first)

| Term | Plain meaning |
|---|---|
| **Creative** | The actual ad video file (e.g. a 15s MP4). Lives in `AdCreative`. |
| **Campaign** | A container with a name, advertiser, **budget**, and a **start/end date**. Decides *when* ads are eligible to run. Lives in `AdCampaign`. |
| **Placement** | The rule that links a creative to a campaign and says *where it goes* (pre/mid/post-roll), *who it targets* (category/video), and its **CPM bid**, **frequency cap**, and **pod size**. Lives in `AdPlacement`. This is the heart of targeting. |
| **Impression** | A recorded event that an ad started playing. Plus quartile events (25/50/75/100%). Lives in `AdImpression`. |
| **HLS** | HTTP Live Streaming. A video is split into many small `.ts` segments (~4s each) listed in a `.m3u8` text playlist. The player downloads the playlist, then the segments in order. |
| **m3u8 / manifest / playlist** | The text file that lists segments. A **master** playlist lists quality variants (360p/720p/1080p); each **variant** playlist lists the actual segments. |
| **SSAI** | Server-Side Ad Insertion — splicing ad segments *into* the content manifest on the server. What this app does. |
| **CSAI** | Client-Side Ad Insertion — the player loads ads separately (e.g. via VAST). This app does **not** do this. |
| **Pre / Mid / Post-roll** | Ad break before the video / partway through (at an offset) / after the video. |
| **Pod** | A group of ads played back-to-back in one break (like a TV commercial break). `maxAdsPerPod` caps how many. |
| **CPM** | "Cost Per Mille" = price per 1000 impressions. Used here as the **bid** to rank competing ads (higher CPM wins the slot). Stored in **cents**. |
| **Auction** | When multiple placements compete for the same break slot, the highest CPM wins. |
| **Frequency cap** | Max times a logged-in user sees the same creative per 24h. |
| **Slate** | A fallback "filler" clip shown when no real ad qualifies, so the break isn't empty/broken. |
| **Quartile** | Progress milestones of an ad: 25% (Q1), 50% (Q2), 75% (Q3), 100% (Complete). Standard ad-tracking metric. |
| **CUE-OUT / CUE-IN** | HLS tags marking where an ad break starts and ends. |
| **DISCONTINUITY** | HLS tag telling the player "the next segment is a different stream (different timing/encoding) — reset your decoder." Needed between content and ad. |
| **EXT-X-DATERANGE** | An HLS metadata tag we use to carry custom signals (the "Advertisement" badge and the skip-button offset) to the player. |
| **Presigned URL** | A temporary, signed S3 URL that lets the browser upload a file directly to S3 without backend credentials. |
| **BullMQ** | A Redis-backed job queue. Used to run FFmpeg transcoding in the background worker. |
| **Slate / Session / Stream token** | See sections below. |

---

## 2. Data model (the 5 ad tables)

Defined in [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) (the `Ad System` section).

### `AdCreative` — the ad video
The uploaded ad. Key fields:
- `durationSec` — total length, given by the admin at upload.
- `skipOffsetSec` — seconds before the "Skip Ad" button appears. `null` = non-skippable.
- `clickUrl` — the advertiser's landing page (⚠️ see Issues — currently unused).
- `status` — `PENDING → PROCESSING → READY → FAILED` (the transcode lifecycle).
- `inputKey` — S3 key of the raw uploaded MP4.
- `hlsBasePath` — S3 prefix of the transcoded HLS output, e.g. `ads/<id>/hls`. **Set only after transcode succeeds.** A creative is only usable once this is filled and `status = READY`.

### `AdCampaign` — the time/budget container
- `budgetCents` — budget in cents (⚠️ collected but not enforced — see Issues).
- `startDate` / `endDate` — the eligibility window.
- `status` — `DRAFT → ACTIVE → PAUSED → DONE`. **Only `ACTIVE` campaigns serve ads.** A new campaign starts as `DRAFT`, so nothing runs until you edit it to `ACTIVE`.

### `AdPlacement` — the targeting + bidding rule (the important one)
Links one `creativeId` to one `campaignId` plus:
- `breakType` — `PRE` / `MID` / `POST`.
- `midRollOffsetSec` — for MID only: how many seconds into the content.
- `targetCategory` — only show on videos of this category (`null` = all).
- `targetVideoId` — only show on this specific video (`null` = all).
- `maxAdsPerPod` — how many ads can fill this break slot.
- `frequencyCapPerDay` — per-user-per-day cap for the creative.
- `cpmCents` — the bid used to win the auction for a slot.

### `AdImpression` — the event log
One row per tracked event. `event` is one of `IMPRESSION | Q1 | Q2 | Q3 | COMPLETE | SKIP | CLICK`.
Carries `creativeId`, `placementId`, `videoId`, `sessionId`, and `userId` (null for anonymous).
This table is the entire source of truth for the analytics dashboard.

**Targeting precedence** (built in `buildAndStoreSession`): specific video > category > run-of-network
(a placement with no targets runs everywhere).

---

## 3. The full lifecycle, end to end

### Stage 1 — Upload a creative (admin)
Implemented in [`frontend/src/pages/admin/Creatives.tsx`](frontend/src/pages/admin/Creatives.tsx) and
[`backend/src/controllers/adController.ts`](backend/src/controllers/adController.ts).

This is a **3-step direct-to-S3 upload** (the file never passes through the API server):

1. **`GET /api/v1/admin/ad-creatives/upload-url`** → backend generates a random UUID, builds an
   S3 key `ads/<uuid>/input.mp4`, and returns a **presigned PUT URL** (valid 15 min) plus the key.
2. **Browser `PUT`s the MP4 directly to S3** using that URL (with an `XMLHttpRequest` so it can show
   an upload progress bar). No backend involvement — saves bandwidth and memory on the API server.
3. **`POST /api/v1/admin/ad-creatives`** with the metadata + the `inputKey` from step 1. The backend:
   - creates the `AdCreative` row (`status = PENDING`),
   - **enqueues an `ad-transcode` job** on BullMQ/Redis,
   - returns the row.

### Stage 2 — Transcode (background worker)
Implemented in [`worker/src/worker.ts`](worker/src/worker.ts) (`adWorker`).

The worker picks up the job and runs **the exact same FFmpeg pipeline as normal videos** — 3
renditions (360p/720p/1080p), 4-second segments. It:
- downloads the raw MP4 from S3,
- transcodes to HLS, uploads `master.m3u8`, each variant `index.m3u8`, and all `.ts` segments to
  `ads/<creativeId>/hls/...`,
- generates a thumbnail,
- sets `status = READY` and fills `hlsBasePath`.

> **Why transcode ads at all?** Codec/timing must match the content stream, otherwise the splice
> causes glitches or playback stalls. Same encoder settings = clean splice. (See `AD_INSERTION.md §1.6`.)

The Creatives page **polls every 5s** while any creative is `PENDING`/`PROCESSING`, so the status
pill flips to `READY` automatically.

### Stage 3 — Create a campaign (admin)
[`frontend/src/pages/admin/Campaigns.tsx`](frontend/src/pages/admin/Campaigns.tsx) →
**`POST /api/v1/admin/campaigns`**. Just CRUD. New campaigns are `DRAFT`.
**You must `PATCH` it to `ACTIVE`** (via Edit) before it serves anything.

### Stage 4 — Create a placement (admin)
[`frontend/src/pages/admin/Placements.tsx`](frontend/src/pages/admin/Placements.tsx) →
**`POST /api/v1/admin/placements`**. The backend validates that the campaign and creative exist and
that **the creative is `READY`** (you can't place a still-transcoding ad). For `MID` breaks,
`midRollOffsetSec` is required. CPM is entered in dollars in the UI and converted to cents.

### Stage 5 — A viewer plays a video → ad session is built
This is the magic. Implemented in [`backend/src/controllers/streamController.ts`](backend/src/controllers/streamController.ts)
and [`backend/src/services/adScheduleService.ts`](backend/src/services/adScheduleService.ts).

When the player loads, it requests the **master playlist**:
`GET /videos/:id/stream/hls/master.m3u8?t=<streamToken>`

On the **master** request, `buildAndStoreSession()` runs and decides the ad lineup for *this viewer*:

1. **Query eligible placements** — only those whose campaign is `ACTIVE` and within its date window,
   whose creative is `READY` with an `hlsBasePath`, and whose targeting matches this video/category.
2. **Frequency capping** (logged-in users only) — drop any creative the user has already seen ≥ its
   cap in the last 24h (counted from `AdImpression` rows). Anonymous viewers are **not** capped.
3. **CPM auction** — sort survivors by `cpmCents` descending (ties broken by older creative first).
4. **Pod filling** — for each break slot (PRE, each MID@offset, POST), keep only the top-N by CPM,
   where N = the slot winner's `maxAdsPerPod`.
5. **Slate fallback** — if a slot ends up empty (everything capped or filtered), substitute the
   pre-encoded slate clip at `ads/slate/hls` so the break still works. If there's no slate, no break.
6. **Store the session in Redis** under `adsession:<uuid>` with a 4-hour sliding TTL, and return the
   `sessionId`. The master playlist's variant URLs get `&session=<id>` appended.

The result is an `AdSession`: a list of `adBreaks`, each with offset, creativeId, duration, skip
offset, placementId, and HLS path. **This is decided once per playback and cached** — so every
variant request reuses the same lineup.

### Stage 6 — Variant playlist is stitched
When the player picks a quality and requests e.g.
`GET /videos/:id/stream/hls/360p/index.m3u8?t=...&session=...`,
`stitchVariantPlaylist()` rewrites the playlist:

- Walks the content segments, tracking elapsed time.
- Inserts each ad break at the right spot: **PRE** before segment 0, **MID** after the segment that
  reaches the offset, **POST** right before `#EXT-X-ENDLIST`.
- For each break it emits an **ad block**: `CUE-OUT`, `DISCONTINUITY`, the `DATERANGE` cues (badge +
  skip), the ad's `.ts` segment URLs, then `CUE-IN`, `DISCONTINUITY`.
- Rewrites every segment URL (content **and** ad) to point back through the authenticated stream
  proxy, carrying `t`, `session`, and (for ads) `placement` query params.

So the player downloads one playlist that seamlessly interleaves content and ad segments.

### Stage 7 — Segments are served + impressions tracked
Every `.ts` request hits the same `streamHls` handler. If the path starts with `ads/`, it's an ad
segment: the handler streams the bytes from S3 **and**, fire-and-forget, looks up the session,
figures out which milestone this segment represents (`inferAdEvent`), and writes an `AdImpression`
row — without ever delaying the video bytes.

- Segment index `0` → `IMPRESSION`
- ~25/50/75% → `Q1/Q2/Q3`
- last segment → `COMPLETE`

Slate segments are skipped (no DB records exist for them).

### Stage 8 — The player UI (badge + skip)
[`frontend/src/pages/Player.tsx`](frontend/src/pages/Player.tsx). The player (video.js + VHS) parses
the `EXT-X-DATERANGE` cues into a metadata text track. On every `timeupdate` it checks active cues:
- `ad-break-*` cue (carries `X-AD-BREAK=1`) → show the **"Advertisement"** badge.
- `ad-skip-*` cue (carries `X-SKIP-OFFSET=N`) → show the **skip countdown**, then a **"Skip Ad ›"**
  button once enough time has elapsed. Clicking it seeks past the ad break.

> There's a clever bit in `streamController.ts`: it injects `#EXT-X-PROGRAM-DATE-TIME:1970-01-01...`
> as an epoch anchor so VHS can map each DATERANGE to the correct position in the stitched timeline.
> Each `DATERANGE`'s `START-DATE` is `epoch 0 + breakOffsetSec`. This is what makes the badge/skip
> appear at exactly the right moment.

### Stage 9 — Analytics
[`frontend/src/pages/admin/AdAnalytics.tsx`](frontend/src/pages/admin/AdAnalytics.tsx) →
**`GET /api/v1/admin/ad-analytics`**. The backend reads `AdImpression` rows in the date range
(optionally filtered by campaign/creative) and aggregates: total impressions, completions, skips,
a per-creative breakdown, and impressions-by-day. The dashboard renders KPIs, a bar chart, and a table.

---

## 4. API reference (every ad endpoint)

All admin endpoints are under `/api/v1/admin` and require **auth + ADMIN role**
(`adminRouter.use(requireAuth, requireAdmin)` in [`backend/src/routes/admin.ts`](backend/src/routes/admin.ts)).
The serving endpoint is public (token-gated).

### Creatives

| Method & Path | What it does | Behind the scenes |
|---|---|---|
| `GET /admin/ad-creatives/upload-url` | Get a presigned S3 PUT URL. | Generates a UUID + S3 key `ads/<uuid>/input.mp4`, presigns a 15-min PUT. Returns `{uploadUrl, key, creativeId}`. **No DB row yet.** |
| `POST /admin/ad-creatives` | Register the uploaded ad + start transcode. | Validates body (Zod), creates `AdCreative` (`PENDING`), **enqueues a BullMQ `ad-transcode` job**, writes an audit log. Body: `title, advertiserName, durationSec, inputKey, [clickUrl], [skipOffsetSec]`. |
| `GET /admin/ad-creatives` | Paginated list. | Plain Prisma `findMany` + count. `?page&pageSize`. |
| `GET /admin/ad-creatives/:id` | One creative. | `findUnique`, 404 if missing. |
| `DELETE /admin/ad-creatives/:id` | Delete creative + its S3 assets. | Deletes the HLS prefix `ads/<id>/`, also the raw input prefix (different UUID path), then the DB row. Cascades to placements/impressions. |

### Campaigns

| Method & Path | What it does | Behind the scenes |
|---|---|---|
| `POST /admin/campaigns` | Create a campaign. | Validates `endDate > startDate`, creates row as `DRAFT`, audit-logs. |
| `PATCH /admin/campaigns/:id` | Update (incl. `status`). | Partial update; this is how you flip a campaign to `ACTIVE`. Requires ≥1 field. |
| `GET /admin/campaigns` | Paginated list (with placement counts). | `findMany` + `_count.placements`. |
| `GET /admin/campaigns/:id` | One campaign + its placements + creatives. | Deep `include`. |
| `DELETE /admin/campaigns/:id` | Delete campaign. | Cascades to its placements (`onDelete: Cascade`). |

### Placements

| Method & Path | What it does | Behind the scenes |
|---|---|---|
| `POST /admin/placements` | Create a targeting/bid rule. | Verifies campaign + creative exist and **creative is `READY`**; requires `midRollOffsetSec` for MID. |
| `GET /admin/placements` | Paginated list (optional `?campaignId`). | Joins campaign + creative summaries. |
| `DELETE /admin/placements/:id` | Delete a placement. | Plain delete. |

### Analytics

| Method & Path | What it does | Behind the scenes |
|---|---|---|
| `GET /admin/ad-analytics` | Aggregated metrics. | Query `from, to, [campaignId], [creativeId]`. Reads `AdImpression`, aggregates by event/creative/day. Defaults to the last 7 days. |

### Serving (public, token-gated — not under `/admin`)

| Method & Path | What it does | Behind the scenes |
|---|---|---|
| `GET /videos/:id/stream/hls/master.m3u8?t=<token>` | Master playlist + **session creation**. | Verifies the stream token; on first hit **builds the ad session** (auction + capping + slate) and stores it in Redis. |
| `GET /videos/:id/stream/hls/<rendition>/index.m3u8?t=&session=` | Variant playlist, **stitched with ads**. | Loads the session from Redis and splices ad blocks into the playlist. |
| `GET /videos/:id/stream/hls/ads/<creativeId>/hls/<rendition>/<seg>.ts?t=&session=&placement=` | Ad segment bytes + **impression tracking**. | Streams from S3; fire-and-forget records `IMPRESSION`/quartile/`COMPLETE`. |

> **Stream tokens** (`generateStreamToken` etc. in `streamController.ts`) are short-lived JWTs of
> type `stream` (logged-in), `stream_public` (anonymous browse), or `stream_share` (share link).
> Ads are served to **all three** — anonymous viewers just aren't frequency-capped.

---

## 5. Behind-the-scenes deep dives

### 5.1 Why direct-to-S3 upload (presigned URL)?
The MP4 could be hundreds of MB. Routing it through the API server would waste memory/bandwidth and
risk timeouts. The presigned URL lets the browser upload straight to S3; the API only ever sees the
small metadata `POST`. The S3 key uses a random UUID, while the transcoded output is keyed by the DB
`cuid` — `deleteCreative` knows about this mismatch and cleans up both prefixes.

### 5.2 The auction (CPM ranking)
`adScheduleService.ts` sorts eligible placements by `cpmCents` desc (older creative wins ties), then
fills each break slot up to the slot winner's `maxAdsPerPod`. This mimics how real ad servers rank
competing demand — highest bid gets the impression. It's a **first-price, single-round** auction;
there's no second-price logic or actual money movement (CPM is a ranking number here, see Issues).

### 5.3 Frequency capping
For logged-in users, it counts `IMPRESSION` rows for each creative in the last 24h and drops any
placement whose creative has hit `frequencyCapPerDay`. This is why the cap only works for identified
users — anonymous viewers have no stable identity to count against.

### 5.4 Slate fallback
If every slot empties out (all capped/filtered), `buildSlateBreaks` checks S3 for a pre-encoded clip
at `ads/slate/hls/master.m3u8`. If present, it fills each unique break slot with the slate (inferring
its duration from the 360p playlist). Slate is never skippable and is never tracked. If no slate
exists, the viewer simply gets no ads — playback is never broken.

### 5.5 SSAI manifest stitching (the core trick)
The server rewrites the HLS variant playlist so ad `.ts` segments sit inline between content
segments, wrapped in `CUE-OUT/CUE-IN` + `DISCONTINUITY` markers. The player has **no ad SDK** — it
just plays the playlist it's given. This is harder to ad-block than client-side ads and gives a
TV-like seamless experience. The `EXT-X-DATERANGE` + epoch `PROGRAM-DATE-TIME` anchor is what carries
the "Advertisement" badge and skip-offset to the client without a separate channel.

### 5.6 Fire-and-forget tracking
Impression writes use `setImmediate()` and never block segment delivery — a tracking DB error must
never stutter the video. The trade-off: tracking is best-effort (an error just logs and drops).

---

## 6. ⚠️ Issues found (raising the flag)

Ordered roughly by impact. None of these break basic playback; most are correctness/feature gaps
that matter if you push this past POC.

### High impact

1. **SKIP events are never recorded → "Skip Rate" is always 0%.**
   The enum has `SKIP`, analytics counts `SKIP`, and the dashboard shows a Skip Rate — but the
   skip button in [`Player.tsx`](frontend/src/pages/Player.tsx#L463) only calls
   `player.currentTime(endTime)` to seek past the ad. **No `SKIP` event is ever POSTed** (there is
   no endpoint to record one). So skip analytics are permanently zero and misleading.
   *Fix:* add a public `POST /api/v1/ad-events` endpoint and call it from the skip handler.

2. **CLICK is completely dead — `clickUrl` is collected but never used.**
   The creative form captures a `clickUrl`, it's stored in the DB, and `CLICK` is in the enum — but
   the player never renders a clickable "Learn more" overlay, and no `CLICK` event is ever recorded.
   Advertisers get zero click-throughs and zero click metrics. The whole click pathway is missing
   on the serving/UI side.

3. **Budget is collected but never enforced.**
   `AdCampaign.budgetCents` is entered in the UI and stored, but nothing tracks spend, decrements
   budget, paces delivery, or auto-completes a campaign when the budget is exhausted. Combined with
   the fact that CPM never moves real money, "budget" and "CPM" are currently cosmetic — fine for a
   POC, but worth knowing they don't *do* anything yet. Campaigns also never auto-flip to `DONE`
   when `endDate` passes (they just stop matching the date filter while still showing `ACTIVE`).

### Medium impact

4. **Analytics "to" date silently excludes the current day.**
   The dashboard sends date-only strings (e.g. `2026-06-05`). `z.coerce.date()` turns `to` into
   `2026-06-05T00:00:00Z` (midnight UTC), and the query filters `recordedAt <= to`. So **today's
   impressions are excluded** when "to" is today, and there's a timezone skew for non-UTC users.
   *Fix:* set `to` to end-of-day (or add 1 day) before querying.

5. **`frequencyCapPerDay = 0` means "never serve to logged-in users," not "unlimited."**
   The filter is `seen < cap`; with `cap = 0` that's `seen < 0` → always false → the placement is
   dropped for every logged-in viewer (anonymous still see it, since capping is user-only). The
   Placements form allows `min={0}`, so an admin could pick 0 expecting "no cap" and get the
   opposite. *Fix:* treat 0 as unlimited, or set the form min to 1.

6. **Dead code in `getAnalytics`.**
   [`adService.ts`](backend/src/services/adService.ts#L224-L231) builds a typed `where` object that
   is never used — the query constructs its own inline `where`. Harmless but confusing; remove it.

### Low impact / edge cases

7. **Mid-roll offset beyond the video length is silently dropped.** If `midRollOffsetSec` exceeds
   the content duration, the break never inserts (and isn't converted to a post-roll). The ad just
   doesn't play, with no warning to the admin.

8. **No validation that `skipOffsetSec < durationSec`.** An admin can set "skip after 30s" on a 15s
   ad; the skip button then never appears. Worth a form-level guard.

9. **Orphaned uploads.** If an admin gets an upload URL and PUTs the file but never calls
   `POST /ad-creatives`, the S3 object is never cleaned up. Minor; a lifecycle rule on the bucket
   would handle it.

10. **Quartile accuracy is approximate.** `inferAdEvent` maps milestones by *segment index* using a
    fixed 4s assumption, not actual playback position, and tracking fires when a segment is
    *fetched* (which can include buffer-ahead). Fine for a POC; not precise enough for billing.

---

## 7. Quick file map

| Concern | File |
|---|---|
| Ad data model | [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) |
| Admin CRUD controllers | [`backend/src/controllers/adController.ts`](backend/src/controllers/adController.ts) |
| Admin CRUD business logic | [`backend/src/services/adService.ts`](backend/src/services/adService.ts) |
| Ad session build (auction/capping/slate) | [`backend/src/services/adScheduleService.ts`](backend/src/services/adScheduleService.ts) |
| Impression/quartile tracking | [`backend/src/services/adTrackingService.ts`](backend/src/services/adTrackingService.ts) |
| Manifest stitching + serving | [`backend/src/controllers/streamController.ts`](backend/src/controllers/streamController.ts) |
| Admin routes | [`backend/src/routes/admin.ts`](backend/src/routes/admin.ts) |
| Ad transcode job queue | [`backend/src/queue/adQueue.ts`](backend/src/queue/adQueue.ts) |
| Ad transcode worker | [`worker/src/worker.ts`](worker/src/worker.ts) |
| Admin UI — creatives | [`frontend/src/pages/admin/Creatives.tsx`](frontend/src/pages/admin/Creatives.tsx) |
| Admin UI — campaigns | [`frontend/src/pages/admin/Campaigns.tsx`](frontend/src/pages/admin/Campaigns.tsx) |
| Admin UI — placements | [`frontend/src/pages/admin/Placements.tsx`](frontend/src/pages/admin/Placements.tsx) |
| Admin UI — analytics | [`frontend/src/pages/admin/AdAnalytics.tsx`](frontend/src/pages/admin/AdAnalytics.tsx) |
| Player ad UI (badge/skip) | [`frontend/src/pages/Player.tsx`](frontend/src/pages/Player.tsx) |
| Ad theory + original plan | [`AD_INSERTION.md`](AD_INSERTION.md) |
