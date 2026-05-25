import { Eye, Globe, Lock, Link as LinkIcon, Play, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { apiUrl, getAccessToken } from "../api/client";

export type CardVideo = {
  id: string;
  title: string;
  status?: "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
  visibility?: "PRIVATE" | "UNLISTED" | "PUBLIC";
  category?: string | null;
  viewCount?: number;
  thumbnailUrl?: string | null;
  thumbnails?: { sm?: string; md?: string; lg?: string } | null;
  createdAt?: string;
  progress?: number;
};

type Props = {
  video: CardVideo;
  /** "library" = own video (auth-tokened thumbnail, shows visibility + delete);
   *  "browse"  = public video (no auth needed, no delete) */
  variant?: "library" | "browse";
  onDelete?: (id: string) => void;
  deleting?: boolean;
};

function thumbnailSrc(video: CardVideo, variant: "library" | "browse"): string | null {
  // Prefer multi-size thumbnails when available
  const mediumPath = video.thumbnails?.md ?? video.thumbnailUrl;
  if (!mediumPath) return null;

  if (variant === "browse") {
    // Public path — try the public no-auth thumbnail endpoint first
    return apiUrl(`/api/v1/browse/${video.id}/thumbnail`);
  }

  // Owner view — needs auth token query param
  const token = getAccessToken();
  const path = mediumPath.startsWith("http") ? mediumPath : apiUrl(mediumPath);
  return token ? `${path}${path.includes("?") ? "&" : "?"}auth=${encodeURIComponent(token)}` : path;
}

function VisibilityBadge({ v }: { v?: "PRIVATE" | "UNLISTED" | "PUBLIC" }) {
  if (!v) return null;
  const Icon = v === "PUBLIC" ? Globe : v === "UNLISTED" ? LinkIcon : Lock;
  const label = v.charAt(0) + v.slice(1).toLowerCase();
  return (
    <span className="visibility-pill">
      <Icon size={11} />
      {label}
    </span>
  );
}

function StatusPill({ status, progress }: { status?: CardVideo["status"]; progress?: number }) {
  if (!status || status === "READY") return null;
  const cls = `status-pill ${status.toLowerCase()}`;
  return (
    <span className={cls}>
      {status === "PROCESSING" && typeof progress === "number"
        ? `Processing ${progress}%`
        : status === "UPLOADED"
        ? "Uploaded"
        : status === "FAILED"
        ? "Failed"
        : status}
    </span>
  );
}

function formatViews(n?: number): string | null {
  if (typeof n !== "number") return null;
  if (n < 1000) return `${n} ${n === 1 ? "view" : "views"}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K views`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M views`;
}

function formatRelativeDate(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  const day = 86400;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < day) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < day * 30) return `${Math.floor(diffSec / day)}d ago`;
  if (diffSec < day * 365) return `${Math.floor(diffSec / (day * 30))}mo ago`;
  return `${Math.floor(diffSec / (day * 365))}y ago`;
}

export function VideoCard({ video, variant = "browse", onDelete, deleting }: Props) {
  const thumb = thumbnailSrc(video, variant);
  const viewsLabel = formatViews(video.viewCount);
  const dateLabel = formatRelativeDate(video.createdAt);

  return (
    <Link to={`/videos/${video.id}`} className="video-card">
      <div className="video-card-thumb">
        {thumb ? (
          <img src={thumb} alt={video.title} loading="lazy" />
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

        {variant === "library" && video.visibility && (
          <div className="video-card-badge-tl">
            <VisibilityBadge v={video.visibility} />
          </div>
        )}

        {variant === "library" && onDelete && (
          <div className="video-card-corner">
            <button
              type="button"
              className="video-card-corner-btn"
              aria-label="Delete video"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(video.id);
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="video-card-body">
        <div className="video-card-title">{video.title}</div>
        <div className="video-card-meta">
          {variant === "library" ? (
            <StatusPill status={video.status} progress={video.progress} />
          ) : (
            <>
              {viewsLabel && (
                <>
                  <Eye size={11} />
                  <span>{viewsLabel}</span>
                </>
              )}
            </>
          )}
          {video.category && (
            <>
              {variant === "library" || viewsLabel ? (
                <span className="video-card-meta-dot">·</span>
              ) : null}
              <span>{video.category}</span>
            </>
          )}
          {dateLabel && (variant === "browse" || video.status === "READY") && (
            <>
              <span className="video-card-meta-dot">·</span>
              <span>{dateLabel}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export function VideoCardSkeleton() {
  return (
    <div className="skeleton">
      <div className="skeleton-thumb skeleton-shimmer" />
      <div className="skeleton-line skeleton-shimmer" />
      <div className="skeleton-line short skeleton-shimmer" />
    </div>
  );
}
