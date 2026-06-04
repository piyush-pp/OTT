/**
 * Ad Tracking Service
 *
 * Records impression and quartile events for ad segment playback.
 * All writes are fire-and-forget — tracking failures never delay segment delivery.
 */

import { prisma } from "../db/prisma.js";
import type { AdEventType } from "@prisma/client";

// ─── Event recording ──────────────────────────────────────────────────────────

export function recordAdEvent(params: {
  creativeId: string;
  placementId: string;
  videoId: string;
  sessionId: string;
  userId?: string;
  event: AdEventType;
}) {
  // Skip tracking for slate breaks — they have no real DB records
  if (params.creativeId === "slate" || params.placementId.startsWith("slate")) return;

  // Defer to next event-loop tick so we never block segment delivery
  setImmediate(() => {
    prisma.adImpression
      .create({
        data: {
          creativeId: params.creativeId,
          placementId: params.placementId,
          videoId: params.videoId,
          sessionId: params.sessionId,
          userId: params.userId ?? null,
          event: params.event,
          recordedAt: new Date()
        }
      })
      .catch((err) => console.error("[adTracking] failed to record event", err));
  });
}

// ─── Quartile inference ───────────────────────────────────────────────────────

/**
 * Infer which AdEventType to fire for a given segment filename.
 *
 * Returns null for segments that don't correspond to a tracking milestone
 * (i.e. we only fire IMPRESSION once at segment 0, quartiles at 25/50/75%,
 * and COMPLETE at the last segment — nothing in between).
 *
 * @param segmentFilename  e.g. "seg_00003.ts"
 * @param adDurationSec    total ad duration from the DB record
 * @param segmentDurationSec  nominal segment duration (default 4s, matches FFmpeg settings)
 */
export function inferAdEvent(
  segmentFilename: string,
  adDurationSec: number,
  segmentDurationSec = 4
): AdEventType | null {
  // Parse index from names like "seg_00003.ts" or "00003.ts"
  const match = segmentFilename.match(/(\d+)\.ts$/);
  if (!match) return null;
  const idx = parseInt(match[1]!, 10);

  const totalSegs = Math.max(1, Math.ceil(adDurationSec / segmentDurationSec));

  if (idx === 0) return "IMPRESSION";
  if (idx >= totalSegs - 1) return "COMPLETE";

  // Quartile thresholds (round to nearest segment index)
  const q1 = Math.round(totalSegs * 0.25);
  const q2 = Math.round(totalSegs * 0.5);
  const q3 = Math.round(totalSegs * 0.75);

  if (idx === q3) return "Q3";
  if (idx === q2) return "Q2";
  if (idx === q1) return "Q1";

  return null;
}
