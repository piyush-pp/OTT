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

  const adBreaks: AdBreakEntry[] = placements
    .map((p) => ({
      breakType: p.breakType as "PRE" | "MID" | "POST",
      offsetSec:
        p.breakType === "PRE"
          ? 0
          : p.breakType === "POST"
            ? POST_SENTINEL
            : (p.midRollOffsetSec ?? 0),
      creativeId: p.creativeId,
      durationSec: p.creative.durationSec,
      skipOffsetSec: p.creative.skipOffsetSec ?? undefined,
      placementId: p.id,
      hlsBasePath: p.creative.hlsBasePath!
    }))
    .sort((a, b) => a.offsetSec - b.offsetSec);

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

  return session;
}

/** Retrieve an ad session from Redis. Returns null on miss or error. */
export async function getSession(sessionId: string): Promise<AdSession | null> {
  try {
    const raw = await redis().get(`adsession:${sessionId}`);
    if (!raw) return null;
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
