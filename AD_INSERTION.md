# Ad Insertion — Deep Internals + Project Implementation Plan

---

## Part 1 — Understanding Ad Insertion (Netflix / Prime Level)

### 1.1 Why Ad Insertion Is Hard

Video ads are not like web banner ads. The player is consuming a continuous byte-stream of compressed video at 1–5 MB/s. Interrupting that stream, swapping to a different video (the ad), and returning seamlessly — without a loading spinner, without buffering, without allowing ad-blockers to intercept — requires careful coordination across five separate systems: the **content CDN**, the **ad decision server**, the **manifest server**, the **segment proxy**, and the **player**.

The two fundamentally different approaches are:

| Property | CSAI (Client-Side) | SSAI (Server-Side) |
|---|---|---|
| Where stitching happens | Browser/app | Server / CDN |
| Ad blocker vulnerable? | Yes | No (ads served from same origin) |
| Buffering at ad boundary | Often yes | No (single continuous stream) |
| Complexity | Low | High |
| Used by | YouTube (legacy), IMA SDK demos | Netflix, Prime, Hulu, Peacock |
| Tracking accuracy | Low (block-able) | High (server verifies) |

---

### 1.2 The HLS Ad Signaling Standard — SCTE-35

At the transport-stream level, an "ad opportunity" is signaled by a **SCTE-35 splice command** embedded inside the video stream. SCTE-35 is a binary protocol originally designed for broadcast TV satellite uplinks. It says: *"at timestamp X, break out of this content for Y seconds."*

In HLS, SCTE-35 cues appear in the `.m3u8` playlist as:

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXTINF:4.000,
seg_00010.ts          ← last content segment before break

#EXT-X-CUE-OUT:30      ← "ad break starts, 30 seconds long"
#EXT-X-DISCONTINUITY   ← codec/timeline reset warning to player
#EXTINF:4.000,
ad_seg_00001.ts        ← first ad segment
#EXTINF:4.000,
ad_seg_00002.ts
...
#EXT-X-CUE-IN          ← "ad break ends, resume content"
#EXT-X-DISCONTINUITY
#EXTINF:4.000,
seg_00011.ts          ← content resumes
```

**Key HLS tags used in ad insertion:**

| Tag | Meaning |
|---|---|
| `#EXT-X-CUE-OUT:<duration>` | Start of ad break, duration in seconds |
| `#EXT-X-CUE-IN` | End of ad break |
| `#EXT-X-DISCONTINUITY` | Timeline resets — codec, timestamps may differ |
| `#EXT-X-DATERANGE` | Richer metadata (SCTE-35 binary in base64) |
| `#EXT-X-PROGRAM-DATE-TIME` | Wall-clock anchor for tracking events |
| `#EXT-X-INDEPENDENT-SEGMENTS` | Every segment is self-contained (already set in this project) |

**Why `#EXT-X-DISCONTINUITY` matters:** Ad video files are encoded by the advertiser and almost certainly have different timecodes, keyframe intervals, and possibly different resolution/codec than the content. The player uses DISCONTINUITY to know it must reset its decoder state — without it, playback would corrupt.

---

### 1.3 VAST and VMAP — The Ad Industry's XML Standards

**VAST (Video Ad Serving Template)**
A VAST document is what an Ad Decision Server returns when you ask "what ad should I show here?" It's XML describing:
- The creative video URL (the actual MP4 or HLS ad)
- Duration
- Click-through URL
- Tracking pixels (impression, firstQuartile, midpoint, thirdQuartile, complete, skip)
- Optional wrapper (VAST can point to another VAST — "waterfall" bidding)

```xml
<VAST version="4.0">
  <Ad id="1">
    <InLine>
      <AdTitle>My Brand Ad</AdTitle>
      <Impression><![CDATA[https://tracker.example.com/imp?id=1]]></Impression>
      <Creatives>
        <Creative>
          <Linear>
            <Duration>00:00:15</Duration>  <!-- 15-second ad -->
            <TrackingEvents>
              <Tracking event="start"><![CDATA[https://tracker.example.com/start]]></Tracking>
              <Tracking event="firstQuartile">...</Tracking>
              <Tracking event="midpoint">...</Tracking>
              <Tracking event="thirdQuartile">...</Tracking>
              <Tracking event="complete">...</Tracking>
              <Tracking event="skip">...</Tracking>
            </TrackingEvents>
            <MediaFiles>
              <MediaFile type="video/mp4" width="1280" height="720">
                <![CDATA[https://cdn.example.com/ads/brand_720p.mp4]]>
              </MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>
```

**VMAP (Video Multiple Ad Playlist)**
VMAP describes the *schedule* of ad breaks for a piece of content — not just one ad but the whole ad timeline:

```xml
<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0">
  <!-- Pre-roll: at position 00:00:00 -->
  <vmap:AdBreak timeOffset="start" breakType="linear" breakId="preroll">
    <vmap:AdSource allowMultipleAds="true" followRedirects="true">
      <vmap:VASTData> <!-- inline VAST or AdTagURI --> </vmap:VASTData>
    </vmap:AdSource>
  </vmap:AdBreak>

  <!-- Mid-roll: at 5 minutes exactly -->
  <vmap:AdBreak timeOffset="00:05:00.000" breakType="linear" breakId="midroll-1">
    ...
  </vmap:AdBreak>

  <!-- Post-roll: at end of content -->
  <vmap:AdBreak timeOffset="end" breakType="linear" breakId="postroll">
    ...
  </vmap:AdBreak>
</vmap:VMAP>
```

VMAP is the document that the **SSAI server** fetches to know where to stitch ads into the content manifest.

---

### 1.4 The Ad Decision Server (ADS)

The ADS is the brain that decides **which specific ad to show** to **which user** at **which moment**. In production systems this is either an in-house server or a commercial platform (Google Ad Manager, FreeWheel, SpotX, Magnite).

**ADS Request (sent by the SSAI server on behalf of the player):**
```
GET https://ads.example.com/vast
  ?content_id=video_123
  &user_id=hashed_abc
  &ip=1.2.3.4
  &device=ctv
  &duration_available=30      ← how long the break is
  &max_ads=3                  ← max ads to fill the pod
  &floor_price=2.50           ← minimum CPM in dollars
  &geo=US
  &category=entertainment
```

**ADS Response:** A VAST document (possibly a wrapper pointing to the winning auction creative).

The ADS runs a **header bidding auction** (or waterfall) against registered advertisers in real time (typically < 200ms). The winning bid's creative URL goes into the VAST response.

---

### 1.5 Server-Side Ad Insertion (SSAI) — Full Flow

This is what Netflix, Prime, Hulu, and Peacock run. Here is the complete request lifecycle:

```
PLAYER                 SSAI SERVER              AD DECISION SERVER       CONTENT CDN
  │                        │                           │                      │
  │── GET /session ────────►│                           │                      │
  │   (content_id, user)   │                           │                      │
  │                        │── GET VMAP ───────────────►│                      │
  │                        │◄── VMAP (ad schedule) ────│                      │
  │                        │                           │                      │
  │◄── session_manifest_url│                           │                      │
  │                        │                           │                      │
  │── GET /manifest ───────►│                           │                      │
  │   ?session=abc123      │── GET content manifest ───────────────────────►│
  │                        │◄── original m3u8 ──────────────────────────────│
  │                        │                           │                      │
  │                        │   [stitch ad segments     │                      │
  │                        │    into manifest based    │                      │
  │                        │    on VMAP cue points]    │                      │
  │                        │                           │                      │
  │◄── stitched manifest ──│                           │                      │
  │   (content + ad segs)  │                           │                      │
  │                        │                           │                      │
  │── GET content_seg_10 ──►│────────────────────────────────────────────────►│
  │◄── content bytes ──────│────────────────────────────────────────────────◄│
  │                        │                           │                      │
  │── GET ad_seg_1 ─────────►│                           │                      │
  │                        │── GET ad creative seg ─────────────────────────►│ (ad CDN)
  │◄── ad bytes ───────────│────────────────────────────────────────────────◄│
  │                        │                           │                      │
  │   [player tracks quartile events]                  │                      │
  │── POST /tracking?event=start ────────────────────────────────────────────►│ (tracker)
```

**Key points:**
1. The player **never knows** it's watching an ad — it sees one continuous `.m3u8` playlist
2. All segments (content + ad) are served through the **same domain** — ad blockers cannot distinguish them
3. The SSAI server is stateful — it maintains a **session** per viewer so the same VMAP is consistent for that viewing session
4. Tracking events (impression, quartile) are fired **server-side** — they cannot be blocked

---

### 1.6 Ad Transcoding — Why Codec Matching Is Critical

This is the technical detail that most tutorials skip. When you stitch an ad segment into a content playlist, the ad MUST be encoded with:
- **Same codec** (H.264 profile/level compatible with the content)
- **Same keyframe interval** as the segment boundaries (4s in this project → ads must also be 4s segments)
- **Compatible resolution** for each rendition level (or at least safely decodable)
- **AAC audio at same sample rate** (48kHz standard)

If the codec parameters don't match, the `#EXT-X-DISCONTINUITY` tag tells the player to reset the decoder — this causes a brief black frame or flash between content and ad. To avoid even that, some systems (Netflix) **transcode all ad creatives offline** to exactly match the content encoding parameters before they're eligible to serve. This is called **ad normalization** or **creative normalization**.

**Ad normalization pipeline (what Netflix/Prime run):**
1. Advertiser submits raw ad MP4
2. System validates: duration, aspect ratio, no forbidden content
3. System transcodes to all supported renditions (360p/720p/1080p) using the same FFmpeg settings as content
4. Segments are stored in S3 under `ads/{creative_id}/hls/{rendition}/seg_*.ts`
5. Ad creative is marked "eligible to serve" in the ad database
6. SSAI server uses these pre-normalized segments when stitching

This is exactly what our worker already does for content — we would add a parallel ad transcoding job.

---

### 1.7 Client-Side Ad Insertion (CSAI) — Simpler but Weaker

CSAI is what simpler platforms do. The video player itself handles ad detection and playback:

1. **Cue point detection:** Player reads `#EXT-X-CUE-OUT` from the manifest
2. **Pause content:** Player pauses content playback at the cue point
3. **Request VAST:** Player sends a request to the ADS directly
4. **Play ad:** Player switches to a different video source (the ad URL from VAST)
5. **Resume content:** After ad ends, player switches back to content and sends `#EXT-X-CUE-IN`
6. **Tracking:** Player fires tracking pixels from the VAST document

**The Video.js ecosystem has two key libraries for CSAI:**
- **videojs-contrib-ads**: Foundation plugin that handles pause/resume state machine
- **videojs-ima**: Google's IMA SDK integration (connects to Google Ad Manager)

**CSAI weaknesses:**
- Ad blocker blocks the ADS request or the ad video URL → no ad served, no revenue
- The `#EXT-X-CUE-OUT` / `CUE-IN` round-trip causes a 1–3 second loading gap
- The player must switch video source → decoder reset is visible to user
- Tracking events can be suppressed by browser extensions

---

### 1.8 Admin Control — What a Real Ad Management Panel Does

A production ad management system gives admins control at five levels:

**Level 1 — Campaign**
- Campaign name, advertiser, budget (total / daily), start date, end date
- Status: draft / active / paused / completed

**Level 2 — Ad Creative**
- Upload MP4, set title, description, click-through URL, skip offset (seconds before skip allowed)
- Transcoding queue: creative goes through the same FFmpeg pipeline as content
- Status: pending_transcode / ready / rejected

**Level 3 — Placement Rules (where ads appear)**
- Target by: category, specific video, user role (free vs premium)
- Break type: pre-roll / mid-roll at position X:XX / post-roll
- Ad pod size: max number of ads per break (e.g., max 2 back-to-back)
- Break duration: max seconds per break

**Level 4 — Targeting Rules (who sees the ad)**
- User segment: all users / free users only / specific demographic
- Geography: country, region
- Device: mobile / tablet / desktop / CTV
- Time of day / day of week
- Frequency cap: max N impressions per user per 24h / 7 days

**Level 5 — Analytics**
- Impressions served vs requested (fill rate)
- Completion rate (% who watched to end)
- Click-through rate
- Skip rate (if skippable)
- Revenue per mille (RPM) — per 1000 impressions
- Per-video, per-campaign, per-creative breakdown

---

### 1.9 Session-Level Ad Personalization (How Netflix Does It)

Netflix does not use a generic VMAP — the ad schedule is **computed per session** in real time:

1. User presses Play
2. Netflix backend runs:
   - "How many ads has this user seen today?" (frequency capping)
   - "What is user's ad preference tier?" (targeting consent)
   - "What content is this?" (content category, duration, episode vs movie)
   - "What ad inventory is available?" (ADS auction)
3. Session-specific manifest URL is generated that encodes the ad decisions
4. SSAI server holds the session in memory / Redis
5. As the player advances through segments, the SSAI server replaces ad-slot segment URLs with the winning ad creative segments
6. Tracking events are fired server-side as the SSAI server sees the player consuming segments (by monitoring playlist fetch progress)

**This is the key insight:** In SSAI, the server knows the player is at a specific segment because the player keeps fetching `GET /segment?session=abc123` — the server can fire tracking events without any client cooperation.

---

### 1.10 Slate and Fallback

When an ad break is requested but **no ad fills** (no auction winner, ADS timeout, creative error), the platform needs to show *something* instead of a black screen. This is called **slate** — typically a short "We'll be right back" clip or a looping logo animation.

Slate is stored as a pre-encoded HLS stream (just like an ad creative) and is used as the fallback for any unfilled ad break.

---

## Part 2 — Phase-Wise Implementation Plan for This Project

### Current Architecture Summary

This project has:
- **HLS pipeline**: Worker transcodes content to 360p/720p/1080p, 4-second segments, uploaded to S3 under `videos/{id}/hls/`
- **Stream proxy**: `streamController.ts` fetches `.m3u8` from S3, rewrites segment URIs with signed tokens, pipes `.ts` segments
- **Player**: Video.js 8 with VHS tech, custom quality selector, heartbeat tracking
- **Admin**: RBAC (`requireAdmin`), `PATCH /api/v1/admin/videos/:id`, `GET /api/v1/admin/stats`
- **DB**: Prisma with User (role: USER|ADMIN), Video (visibility, category, featured), WatchHistory, AuditLog

### Implementation Strategy

We will build **SSAI** (server-side), not CSAI. Reason: the stream proxy (`streamController.ts`) already intercepts every `.m3u8` request and rewrites it — this is exactly where manifest stitching happens. We do not need a third-party ad server; we build a lightweight one.

We will proceed in 5 phases. Each phase is independently functional.

---

### Phase A — Ad Data Foundation (DB + Ad Creative Upload)

**Goal:** Schema, admin API, and ad creative storage. No actual serving yet.

**What to build:**

1. **Prisma schema additions:**
   ```
   AdCreative: id, title, advertiserName, clickUrl, skipOffsetSec, 
               durationSec, status (PENDING|PROCESSING|READY|FAILED),
               inputKey, hlsKey, thumbnailKey, createdAt, updatedAt
   
   AdCampaign: id, name, advertiserId, budgetCents, 
               startDate, endDate, status (DRAFT|ACTIVE|PAUSED|DONE),
               createdAt

   AdPlacement: id, campaignId, creativeId, breakType (PRE|MID|POST),
                midRollOffsetSec (nullable), targetCategory (nullable),
                targetVideoId (nullable), maxAdsPerPod, 
                frequencyCapPerDay, createdAt

   AdImpression: id, creativeId, placementId, videoId, userId (nullable),
                 sessionId, event (IMPRESSION|Q1|Q2|Q3|COMPLETE|SKIP|CLICK),
                 recordedAt
   ```

2. **S3 key pattern for ads:**
   ```
   ads/{creativeId}/input.mp4
   ads/{creativeId}/hls/master.m3u8
   ads/{creativeId}/hls/360p/index.m3u8
   ads/{creativeId}/hls/360p/seg_00001.ts
   ads/{creativeId}/hls/720p/...
   ads/{creativeId}/hls/1080p/...
   ads/{creativeId}/thumbnail.jpg
   ```

3. **Admin API endpoints** (all under `requireAuth + requireAdmin`):
   - `POST /api/v1/admin/ad-creatives/upload-url` — presigned PUT for raw MP4
   - `POST /api/v1/admin/ad-creatives/complete` — trigger transcoding job
   - `GET /api/v1/admin/ad-creatives` — list with pagination
   - `DELETE /api/v1/admin/ad-creatives/:id`
   - `POST /api/v1/admin/campaigns` — create campaign
   - `PATCH /api/v1/admin/campaigns/:id` — edit / pause / activate
   - `GET /api/v1/admin/campaigns` — list
   - `POST /api/v1/admin/placements` — create placement rule
   - `GET /api/v1/admin/placements` — list

4. **BullMQ queue extension:** New queue `ad-transcode` processed by the same worker. The worker runs the identical FFmpeg pipeline as for content — same 3 renditions, same 4s segments, same S3 upload pattern — just under `ads/{creativeId}/hls/` keys.

**Key files to create/modify:**
- `backend/prisma/schema.prisma` — add 4 new models
- `backend/src/routes/admin.ts` — extend with ad endpoints
- `backend/src/services/adService.ts` — new file, business logic
- `worker/src/worker.ts` — register `ad-transcode` queue handler
- `worker/src/transcode/ffmpeg.ts` — reuse `transcodeToHls()` as-is

**Acceptance criteria:**
- Admin can upload an MP4 ad creative via the presigned URL flow
- Worker transcodes it; `AdCreative.status` becomes READY
- Ad segments exist in S3 under `ads/{id}/hls/`
- Admin can create a campaign and a placement rule linking creative → campaign → target

---

### Phase B — Server-Side Manifest Stitching (Core SSAI)

**Goal:** When an authenticated user requests a video manifest, the stream proxy stitches ad segments into the playlist based on active placement rules.

**How it works (precise mechanics):**

The current `rewriteM3u8()` function in `streamController.ts` simply rewrites segment URIs. We extend it to:

1. **Before serving `master.m3u8`:** Create an **ad session** (short-lived, stored in Redis with TTL = video duration + 1h). The session holds: `{ videoId, userId, adSchedule: [{ offsetSec, creativeId, breakDurationSec }] }`

2. **Session ID is embedded in the manifest URL** as a query param: `?session=abc123&t=<jwt>`

3. **When serving `{rendition}/index.m3u8`:** The proxy reads the session from Redis. For any segment whose cumulative time crosses an ad break offset, it inserts:
   ```
   #EXT-X-CUE-OUT:<duration>
   #EXT-X-DISCONTINUITY
   {ad segments for this rendition from ads/{creativeId}/hls/{rendition}/}
   #EXT-X-CUE-IN
   #EXT-X-DISCONTINUITY
   ```

4. **When serving ad `.ts` segments:** The segment path will be `ads/{creativeId}/hls/{rendition}/seg_*.ts`. The stream proxy recognizes this path pattern and fetches from the `ads/` S3 prefix instead of `videos/`.

5. **Ad break positioning logic:**
   - Query `AdPlacement` for the video's category and specific videoId
   - Filter active campaigns (status=ACTIVE, within date range)
   - For PRE-ROLL: insert before segment 0
   - For MID-ROLL: find segment whose cumulative timestamp >= offsetSec
   - For POST-ROLL: insert after `#EXT-X-ENDLIST`

**Key files to modify:**
- `backend/src/controllers/streamController.ts` — extend `rewriteM3u8()` and `streamHls()`
- `backend/src/services/adScheduleService.ts` — new file, query placements, build session schedule
- `backend/src/routes/videos.ts` — session init logic on master.m3u8 request
- `backend/src/utils/env.ts` — no new vars needed (Redis already configured)

**What the player sees:** One continuous `.m3u8` — it has no idea ads are present. It just plays segments in order. The `#EXT-X-DISCONTINUITY` tells it to reset the decoder.

**Acceptance criteria:**
- Request `GET /api/v1/videos/:id/stream/hls/master.m3u8` → response headers contain `X-Ad-Session: {sessionId}`
- Request the 360p variant playlist → playlist contains ad segments spliced at configured offset
- Playing the video in the browser: ad plays seamlessly at the configured offset with no loading spinner
- Requesting the same manifest again without a session → no ads (cold cache path)

---

### Phase C — Ad Tracking (Impression & Quartile Events)

**Goal:** Record every impression, quartile completion, skip, and click server-side — without relying on the client.

**Server-side tracking mechanism:**

The SSAI server knows exactly which segments correspond to which ad creative, because it built the manifest. When the player fetches an ad `.ts` segment, the segment path encodes the creative ID and segment index. We use this to fire tracking events:

- Segment `ads/{creativeId}/hls/{rendition}/seg_00000.ts` fetched → fire IMPRESSION event
- Segment covering 25% of ad duration fetched → fire Q1 event
- 50% → MIDPOINT, 75% → Q3, 100% → COMPLETE
- If player stops fetching ad segments early → infer SKIP (optional, via session expiry)

**Where to hook this:**
- In `streamController.ts`, when a `.ts` segment is served and its path matches `ads/`, extract creativeId + segment index from the path
- Derive which quartile event to fire based on `(segmentIndex * segmentDuration) / adDuration`
- Write to `AdImpression` table asynchronously (fire-and-forget, use `setImmediate`)

**New API for analytics:**
- `GET /api/v1/admin/ad-analytics?campaignId=&creativeId=&from=&to=` — returns impressions, completion rates, fills, by day

**Key files to create/modify:**
- `backend/src/controllers/streamController.ts` — ad segment tracking hook
- `backend/src/services/adTrackingService.ts` — new file, writes AdImpression rows
- `backend/src/controllers/adminController.ts` — ad analytics endpoint

**Acceptance criteria:**
- `AdImpression` rows created with correct events when ad segments are fetched
- Admin analytics endpoint returns fill rate, completion rate, impressions per creative per day
- Events are fire-and-forget — tracking failure never delays segment delivery

---

### Phase D — Frequency Capping + Skip Support

**Goal:** Users don't see the same ad more than N times per day. Skippable ads supported.

**Frequency capping (server-side):**
- When building the ad session (Phase B), query `AdImpression` for the userId + creativeId in the last 24h
- If count >= `AdPlacement.frequencyCapPerDay`, skip that creative and try the next eligible one
- If no eligible creatives: serve **slate** (a pre-encoded "We'll be right back" HLS clip stored under `ads/slate/hls/`)

**Skippable ads:**
- `AdCreative.skipOffsetSec` (e.g., 5) is stored in the session schedule
- The SSAI proxy embeds skip metadata as an `#EXT-X-DATERANGE` tag in the manifest:
  ```
  #EXT-X-DATERANGE:ID="ad-break-1",CLASS="com.apple.hls.interstitial",START-DATE="...",X-SKIP-OFFSET=5
  ```
- The frontend player monitors `#EXT-X-DATERANGE` tags and shows a "Skip Ad" button after `skipOffsetSec` seconds
- On skip: player fast-forwards to the `#EXT-X-CUE-IN` point
- Backend infers SKIP from which segments were actually fetched

**Key files:**
- `backend/src/services/adScheduleService.ts` — add frequency check, slate fallback
- `backend/src/controllers/streamController.ts` — embed `#EXT-X-DATERANGE` in manifest
- `frontend/src/pages/Player.tsx` — parse `#EXT-X-DATERANGE` events from VHS tech, show/hide skip button
- `frontend/src/styles.css` — skip button overlay styles

**Acceptance criteria:**
- Admin sets `frequencyCapPerDay=1` on a placement; after one viewing, no ad on next play
- `skipOffsetSec=5` ad: skip button appears after 5s, clicking it seeks past ad immediately
- When all ads frequency-capped: slate plays instead of blank

---

### Phase E — Admin UI Panel (Frontend)

**Goal:** Full admin UI so non-technical admins can manage ads without touching the DB or API.

**New frontend routes** (all gated by `isAdmin` check):
- `/admin/creatives` — upload ad MP4, list creatives with status badges
- `/admin/campaigns` — CRUD campaigns with date pickers and budget fields
- `/admin/placements` — link creatives to campaigns, configure break type, mid-roll offset, frequency cap, targeting
- `/admin/analytics` — charts (impressions / completions / fill rate per day), creative performance table

**Admin navigation:** Add "Admin" section to the nav dropdown that appears only when `isAdminCached()` returns true.

**Key components to build:**
- `frontend/src/pages/admin/Creatives.tsx`
- `frontend/src/pages/admin/Campaigns.tsx`
- `frontend/src/pages/admin/Placements.tsx`
- `frontend/src/pages/admin/AdAnalytics.tsx`
- `frontend/src/components/AdUploadForm.tsx` — reuse Upload page patterns (presigned PUT, progress bar)

**Acceptance criteria:**
- Admin visits `/admin/creatives`, uploads a 15s MP4 → sees status change from PENDING → PROCESSING → READY
- Admin creates a campaign and attaches a placement (mid-roll at 2:00 for "Entertainment" category)
- Playing any Entertainment video shows a mid-roll ad at 2 minutes
- Analytics page shows impressions + completion rate for yesterday

---

### Phase F — Production Hardening

**Goal:** Make the system resilient enough for actual traffic.

**Items:**
1. **Ad segment caching at CDN level:** Ad segments are identical for all users (unlike content which has per-user tokens). They should be served from a CDN cache, not proxied through the backend on every request. Set `Cache-Control: public, max-age=31536000, immutable` on ad `.ts` responses, same as content segments.

2. **Session TTL management:** Redis ad sessions expire after `videoDuration + 3600s`. Implement session rotation so a user who pauses and resumes hours later gets a fresh ad schedule.

3. **Ad slot auction (optional):** If multiple campaigns target the same video, rank by CPM (cost per mille). The highest-bidding eligible campaign fills the slot. This is a simple sort by campaign `floorCpm` descending.

4. **Slate pre-encoding:** A short 10-second "We'll be right back" clip transcoded with identical parameters to content, stored permanently at `ads/slate/hls/`.

5. **SSAI observability:** Log session creation, fill rate (breaks requested vs filled), latency added per manifest request.

6. **Player ad UI polish:** Progress bar shows distinct color for ad segments (based on position in manifest). "Ad X of N" counter overlay. Mute button visible during ad.

---

## Implementation Order Summary

| Phase | Key Outcome | Depends On |
|---|---|---|
| A | Ad creatives upload & transcode | — |
| B | Ads actually stitch into HLS manifest | Phase A |
| C | Impression & quartile tracking | Phase B |
| D | Frequency capping + skippable ads | Phase C |
| E | Admin UI to manage everything | Phase A–D |
| F | Production hardening | Phase A–E |

Each phase can be shipped independently. Phase B is the highest-value delivery (ads actually play). Phase C is required before any revenue reporting.

---

## Critical Files to Modify (Summary)

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add AdCreative, AdCampaign, AdPlacement, AdImpression |
| `backend/src/controllers/streamController.ts` | Manifest stitching, session init, ad tracking hook |
| `backend/src/routes/admin.ts` | Ad creative/campaign/placement CRUD endpoints |
| `backend/src/services/adService.ts` | New — ad business logic |
| `backend/src/services/adScheduleService.ts` | New — session building, frequency capping |
| `backend/src/services/adTrackingService.ts` | New — impression recording |
| `worker/src/worker.ts` | Register ad-transcode queue |
| `worker/src/transcode/ffmpeg.ts` | Reuse as-is (no changes needed) |
| `frontend/src/pages/Player.tsx` | Skip button, ad progress bar, ad counter |
| `frontend/src/pages/admin/*.tsx` | New admin pages |
| `frontend/src/pages/App.tsx` | Admin nav routes |

## Reusable Patterns (Do Not Rewrite)

- FFmpeg transcode pipeline (`worker/src/transcode/ffmpeg.ts`) — reuse `transcodeToHls()` verbatim for ad creatives
- S3 upload pattern (`worker/src/s3/io.ts`) — `uploadFile()`, `putSmallObject()` used as-is
- Presigned upload flow (`backend/src/services/s3.ts` → `presignPutObject()`) — same pattern as content upload
- Pagination helper (`backend/src/utils/pagination.ts` → `paginate()`) — use for all ad list endpoints
- Audit logging (`backend/src/services/auditService.ts`) — log ad creation and deletion
- `requireAdmin` middleware (`backend/src/middleware/auth.ts:31`) — protect all ad endpoints
- BullMQ queue setup (existing `videoQueue.ts` pattern) — duplicate for `adQueue.ts`
- Upload page drag-drop and progress bar (`frontend/src/pages/Upload.tsx`) — copy pattern for ad creative upload
