/**
 * Ad Schedule Service
 *
 * Builds a per-viewer ad session (list of ad breaks tied to a video), stores
 * it in Redis, and provides helpers to retrieve it and fetch ad segment lists
 * from S3.
 */

import IORedis from "ioredis";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { getObjectAsText } from "./s3.js";
import { env } from "../utils/env.js";

// ─── Redis singleton ──────────────────────────────────────────────────────────

let _redis: IORedis | null = null;

function redis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true
    });
    _redis.on("error", (err) => console.error("[adSchedule] redis error", err));
  }
  return _redis;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdBreakEntry {
  /** PRE=0, MID=offsetSec, POST=POST_SENTINEL */
  breakType: "PRE" | "MID" | "POST";
  offsetSec: number;
  creativeId: string;
  durationSec: number;
  skipOffsetSec?: number;
  placementId: string;
  /** S3 prefix, e.g. "ads/{creativeId}/hls" */
  hlsBasePath: string;
}

export interface AdSession {
  sessionId: string;
  videoId: string;
  userId?: string;
  adBreaks: AdBreakEntry[];
}

export interface AdSegmentEntry {
  duration: number;
  filename: string; // e.g. "seg_00000.ts"
}

/** Sentinel value for POST-ROLL offset — after the last content segment */
export const POST_SENTINEL = 9_999_999;

const SESSION_TTL_SEC = 4 * 3_600; // 4 hours

// ─── Session management ───────────────────────────────────────────────────────

/**
 * Query active placements for a video and build an ad session in Redis.
 * Returns null when there are no eligible ads (avoids creating empty sessions).
 */
export async function buildAndStoreSession(params: {
  videoId: string;
  userId?: string;
  category?: string | null;
}): Promise<AdSession | null> {
  const t0 = performance.now();
  const now = new Date();

  // Build targeting OR conditions: specific video > category-wide > run-of-network
  const orConditions: object[] = [{ targetVideoId: null, targetCategory: null }];
  if (params.category) {
    orConditions.push({ targetCategory: params.category, targetVideoId: null });
  }
  orConditions.unshift({ targetVideoId: params.videoId });

  const placements = await prisma.adPlacement.findMany({
    where: {
      campaign: {
        status: "ACTIVE",
        startDate: { lte: now },
        endDate: { gte: now }
      },
      creative: {
        status: "READY",
        hlsBasePath: { not: null }
      },
      OR: orConditions
    },
    include: { creative: true }
  });

  if (placements.length === 0) return null;

  // ── Frequency capping ──────────────────────────────────────────────────────
  // For authenticated users, skip any creative they've already seen >= cap times
  // in the last 24 hours.
  let eligible = placements;

  if (params.userId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const impressionCounts = await prisma.adImpression.groupBy({
      by: ["creativeId"],
      where: {
        userId: params.userId,
        event: "IMPRESSION",
        recordedAt: { gte: since }
      },
      _count: { creativeId: true }
    });

    const seenMap = new Map(
      impressionCounts.map((r) => [r.creativeId, r._count.creativeId])
    );

    eligible = placements.filter((p) => {
      const seen = seenMap.get(p.creativeId) ?? 0;
      return seen < p.frequencyCapPerDay;
    });

    const capped = placements.length - eligible.length;
    if (capped > 0) {
      console.log(
        `[adSchedule] frequency-capped ${capped} placement(s) for user ${params.userId}`
      );
    }
  }

  // ── CPM auction ───────────────────────────────────────────────────────────
  // Sort by CPM descending; ties broken by creation time (older wins)
  eligible.sort(
    (a, b) =>
      b.cpmCents - a.cpmCents ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Enforce maxAdsPerPod: for each break slot (PRE / MID@Xs / POST), only the
  // top N placements by CPM fill the pod, where N = the slot winner's maxAdsPerPod.
  const slotOffsetFor = (p: (typeof eligible)[0]) =>
    p.breakType === "PRE" ? 0 : p.breakType === "POST" ? POST_SENTINEL : (p.midRollOffsetSec ?? 0);

  const slotKey = (p: (typeof eligible)[0]) => `${p.breakType}:${slotOffsetFor(p)}`;
  const slotMax = new Map<string, number>();
  const slotCount = new Map<string, number>();

  const auctionWinners = eligible.filter((p) => {
    const key = slotKey(p);
    const cnt = slotCount.get(key) ?? 0;
    if (!slotMax.has(key)) slotMax.set(key, p.maxAdsPerPod);
    if (cnt >= slotMax.get(key)!) return false;
    slotCount.set(key, cnt + 1);
    return true;
  });

  // ── Build adBreaks from auction winners ───────────────────────────────────
  let adBreaks: AdBreakEntry[] = [];

  if (auctionWinners.length > 0) {
    adBreaks = auctionWinners
      .map((p) => ({
        breakType: p.breakType as "PRE" | "MID" | "POST",
        offsetSec: slotOffsetFor(p),
        creativeId: p.creativeId,
        durationSec: p.creative.durationSec,
        skipOffsetSec: p.creative.skipOffsetSec ?? undefined,
        placementId: p.id,
        hlsBasePath: p.creative.hlsBasePath!
      }))
      .sort((a, b) => a.offsetSec - b.offsetSec);
  } else {
    // All eligible creatives were filtered out by pod-cap — fall through to slate
  }

  // ── Slate substitution ────────────────────────────────────────────────────
  // When no real ads survive (either all frequency-capped or all filtered by
  // pod-cap), try to fill break slots with the pre-encoded slate clip.
  if (adBreaks.length === 0) {
    adBreaks = await buildSlateBreaks(placements);
    if (adBreaks.length === 0) return null; // no slate available either
  }

  if (adBreaks.length === 0) return null;

  const session: AdSession = {
    sessionId: randomUUID(),
    videoId: params.videoId,
    userId: params.userId,
    adBreaks
  };

  await redis().set(
    `adsession:${session.sessionId}`,
    JSON.stringify(session),
    "EX",
    SESSION_TTL_SEC
  );

  // ── Observability ─────────────────────────────────────────────────────────
  const totalSlots = new Set(adBreaks.map((b) => `${b.breakType}:${b.offsetSec}`)).size;
  console.log(
    `[ssai] session=${session.sessionId} video=${params.videoId} ` +
    `breaks=${adBreaks.length} slots=${totalSlots} ` +
    `capped=${placements.length - eligible.length} ` +
    `latency=${(performance.now() - t0).toFixed(1)}ms`
  );

  return session;
}

// ─── Slate helpers ────────────────────────────────────────────────────────────

const SLATE_HLS_BASE_PATH = "ads/slate/hls";
const SLATE_CREATIVE_ID = "slate";
const SLATE_PLACEMENT_ID = "slate";

/**
 * Build slate AdBreakEntry list to substitute when all real ad slots are empty.
 * Returns an empty array when the slate HLS does not exist in S3.
 */
async function buildSlateBreaks(
  originalPlacements: { breakType: string; midRollOffsetSec: number | null; id: string }[]
): Promise<AdBreakEntry[]> {
  // Verify slate HLS exists before committing to it
  try {
    await getObjectAsText({ bucket: env.S3_BUCKET, key: `${SLATE_HLS_BASE_PATH}/master.m3u8` });
  } catch {
    return []; // no slate available
  }

  // Infer slate duration from the 360p variant playlist; fall back to 10 s
  let slateDuration = 10;
  try {
    const m3u8 = await getObjectAsText({ bucket: env.S3_BUCKET, key: `${SLATE_HLS_BASE_PATH}/360p/index.m3u8` });
    const durations = [...m3u8.matchAll(/#EXTINF:([\d.]+)/g)].map((m) => parseFloat(m[1]!));
    if (durations.length) slateDuration = Math.round(durations.reduce((a, b) => a + b, 0));
  } catch {
    /* use default */
  }

  // One slate per unique break slot (deduplicated by PRE/MID@offset/POST)
  const seen = new Set<string>();
  const entries: AdBreakEntry[] = [];

  for (const p of originalPlacements) {
    const offsetSec =
      p.breakType === "PRE" ? 0
        : p.breakType === "POST" ? POST_SENTINEL
          : (p.midRollOffsetSec ?? 0);
    const slotKey = `${p.breakType}:${offsetSec}`;
    if (seen.has(slotKey)) continue;
    seen.add(slotKey);

    entries.push({
      breakType: p.breakType as "PRE" | "MID" | "POST",
      offsetSec,
      creativeId: SLATE_CREATIVE_ID,
      durationSec: slateDuration,
      placementId: `${SLATE_PLACEMENT_ID}-${p.id}`,
      hlsBasePath: SLATE_HLS_BASE_PATH
      // No skipOffsetSec — slate is never skippable
    });
  }

  if (entries.length) {
    console.log(`[ssai] slate substitution: ${entries.length} break(s) filled with slate`);
  }
  return entries.sort((a, b) => a.offsetSec - b.offsetSec);
}

/** Retrieve an ad session from Redis. Refreshes TTL on access (sliding expiry). */
export async function getSession(sessionId: string): Promise<AdSession | null> {
  try {
    const raw = await redis().get(`adsession:${sessionId}`);
    if (!raw) return null;
    // Slide the expiry window — supports pause/resume within the TTL budget
    void redis().expire(`adsession:${sessionId}`, SESSION_TTL_SEC).catch(() => {});
    return JSON.parse(raw) as AdSession;
  } catch {
    return null;
  }
}

// ─── Ad segment helpers ───────────────────────────────────────────────────────

/**
 * Fetch and parse an ad variant playlist to get the list of segments.
 * Returns an empty array when the playlist is missing (creative not ready).
 */
export async function getAdVariantSegments(
  hlsBasePath: string,
  rendition: string
): Promise<AdSegmentEntry[]> {
  const key = `${hlsBasePath}/${rendition}/index.m3u8`;
  let content: string;
  try {
    content = await getObjectAsText({ bucket: env.S3_BUCKET, key });
  } catch {
    return [];
  }

  const segments: AdSegmentEntry[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("#EXTINF:")) {
      const duration = parseFloat(line.slice(8).replace(/,.*$/, ""));
      const nextLine = lines[i + 1]?.trim() ?? "";
      if (nextLine && !nextLine.startsWith("#")) {
        segments.push({ duration, filename: nextLine });
        i++; // skip the URI we just consumed
      }
    }
  }
  return segments;
}
