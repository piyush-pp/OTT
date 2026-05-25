import { Play } from "lucide-react";
import { Link } from "react-router-dom";
import { apiUrl, getAccessToken } from "../api/client";

export type ContinueItem = {
  positionSec: number;
  watchedAt: string;
  completedAt: string | null;
  video: {
    id: string;
    title: string;
    duration?: number | null;
    thumbnailUrl?: string | null;
    thumbnails?: { sm?: string; md?: string; lg?: string } | null;
    visibility?: string;
    userId?: string;
  };
};

function thumbnailSrc(
  videoId: string,
  thumbnailUrl: string | null | undefined
): string | null {
  if (!thumbnailUrl) return null;
  const token = getAccessToken();
  // Owner thumbnails sit at /videos/:id/thumbnail (needs auth);
  // public/browse thumbnails at /api/v1/browse/:id/thumbnail (no auth).
  const path = thumbnailUrl.startsWith("http") ? thumbnailUrl : apiUrl(thumbnailUrl);
  if (path.includes("/api/v1/browse/")) return path;
  return token
    ? `${path}${path.includes("?") ? "&" : "?"}auth=${encodeURIComponent(token)}`
    : path;
}

function formatRemaining(positionSec: number, durationSec?: number | null) {
  if (!durationSec || durationSec <= 0) return null;
  const remaining = Math.max(0, durationSec - positionSec);
  const min = Math.floor(remaining / 60);
  if (min === 0) return "<1 min left";
  return `${min} min left`;
}

export function ContinueWatchingCard({ item }: { item: ContinueItem }) {
  const v = item.video;
  const thumb = thumbnailSrc(v.id, v.thumbnailUrl);
  const pct =
    v.duration && v.duration > 0
      ? Math.min(100, Math.round((item.positionSec / v.duration) * 100))
      : null;
  const remaining = formatRemaining(item.positionSec, v.duration);

  return (
    <Link to={`/videos/${v.id}`} className="cw-card">
      <div className="cw-thumb">
        {thumb ? (
          <img src={thumb} alt={v.title} loading="lazy" />
        ) : (
          <div className="video-card-thumb-empty">
            <Play size={28} />
          </div>
        )}
        <div className="video-card-hover-overlay">
          <span className="video-card-play-icon">
            <Play size={22} fill="currentColor" />
          </span>
        </div>
        <div className="cw-progress-track">
          <div
            className="cw-progress-fill"
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      </div>
      <div className="cw-body">
        <div className="cw-title">{v.title}</div>
        <div className="cw-sub">{remaining ?? "Continue watching"}</div>
      </div>
    </Link>
  );
}
