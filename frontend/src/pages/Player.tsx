import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { ArrowLeft, Code2, Eye, Globe, Lock, Link as LinkIcon, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiUrl, getAccessToken, getApiBaseUrl, isLoggedIn } from "../api/client";
import { ShareModal } from "../components/ShareModal";
import { EmbedModal } from "../components/EmbedModal";
import { mountQualitySelector } from "../components/qualitySelector";

type Video = {
  id: string;
  title: string;
  description?: string | null;
  status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
  visibility?: "PRIVATE" | "UNLISTED" | "PUBLIC";
  category?: string | null;
  viewCount?: number;
  duration?: number | null;
  createdAt?: string;
  playbackUrl?: string | null;
  thumbnailUrl?: string | null;
  thumbnails?: { sm?: string; md?: string; lg?: string } | null;
  progress?: number;
  error?: string | null;
};

type SsePayload = {
  status?: Video["status"];
  progress?: number;
  error?: string;
};

function formatDuration(sec?: number | null) {
  if (typeof sec !== "number" || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatRelativeDate(iso?: string) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  const day = 86400;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
  if (diffSec < day) return `${Math.floor(diffSec / 3600)} hours ago`;
  if (diffSec < day * 30) return `${Math.floor(diffSec / day)} days ago`;
  if (diffSec < day * 365) return `${Math.floor(diffSec / (day * 30))} months ago`;
  return `${Math.floor(diffSec / (day * 365))} years ago`;
}

function VisibilityPill({ v }: { v?: Video["visibility"] }) {
  if (!v) return null;
  const Icon = v === "PUBLIC" ? Globe : v === "UNLISTED" ? LinkIcon : Lock;
  const label = v.charAt(0) + v.slice(1).toLowerCase();
  return (
    <span className="status-pill ready">
      <Icon size={11} />
      {label}
    </span>
  );
}

export function PlayerPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [video, setVideo] = useState<Video | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const player = useRef<ReturnType<typeof videojs> | null>(null);
  const lockedSrc = useRef<string | null>(null);
  const seekedOnce = useRef(false);

  const authed = isLoggedIn();

  async function fetchOnce() {
    if (!id) return;
    // Try authed endpoint first if logged in, else fall back to public
    try {
      const v = authed
        ? await api<Video>(`/api/v1/videos/${id}`)
        : await api<Video>(`/api/v1/browse/${id}`);
      setVideo(v);
      if (v.playbackUrl && !lockedSrc.current) {
        lockedSrc.current = v.playbackUrl.startsWith("http")
          ? v.playbackUrl
          : apiUrl(v.playbackUrl);
      }
      return v;
    } catch (e) {
      // If authed call failed (private/owner-only), try public
      if (authed) {
        try {
          const v = await api<Video>(`/api/v1/browse/${id}`);
          setVideo(v);
          if (v.playbackUrl && !lockedSrc.current) {
            lockedSrc.current = v.playbackUrl.startsWith("http")
              ? v.playbackUrl
              : apiUrl(v.playbackUrl);
          }
          return v;
        } catch {
          /* fall through */
        }
      }
      const msg = e instanceof Error ? e.message : "Failed to load video";
      if (
        !authed ||
        msg.toLowerCase().includes("session expired") ||
        msg.toLowerCase().includes("log in")
      ) {
        navigate("/auth");
        return null;
      }
      toast.error(msg);
      return null;
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Real-time progress: SSE first, fallback to polling if it fails or remains processing
  useEffect(() => {
    if (!id) return;
    if (video?.status === "READY" || video?.status === "FAILED") return;

    // Only owners can hit the SSE endpoint (requires auth + ownership/public).
    const token = getAccessToken();
    let es: EventSource | null = null;
    let sseFailed = false;

    if (authed && token) {
      try {
        const url = `${getApiBaseUrl()}/api/v1/videos/${id}/events?auth=${encodeURIComponent(token)}`;
        es = new EventSource(url);

        const handleUpdate = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as SsePayload;
            setVideo((prev) =>
              prev
                ? {
                    ...prev,
                    status: data.status ?? prev.status,
                    progress: data.progress ?? prev.progress,
                    error: data.error ?? prev.error
                  }
                : prev
            );
            if (data.status === "READY") {
              // Only re-fetch to get playbackUrl if we don't have it yet
              if (!lockedSrc.current) fetchOnce();
              es?.close();
            }
          } catch {
            /* malformed event */
          }
        };

        es.addEventListener("snapshot", handleUpdate as EventListener);
        es.addEventListener("update", handleUpdate as EventListener);
        es.onerror = () => {
          sseFailed = true;
          es?.close();
          es = null;
        };
      } catch {
        sseFailed = true;
      }
    } else {
      sseFailed = true;
    }

    // Polling fallback — only when SSE is unavailable and we don't yet have the playback URL
    const t = setInterval(() => {
      if (!sseFailed && es && es.readyState === EventSource.OPEN) return;
      if (lockedSrc.current) return; // Already have the URL — stop polling
      fetchOnce();
    }, 3000);

    return () => {
      es?.close();
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, video?.status, authed]);

  // Initialise player once we have a src + READY
  useEffect(() => {
    if (!videoEl.current || !lockedSrc.current || player.current) return;
    if (video?.status !== "READY") return;

    const p = videojs(videoEl.current, {
      controls: true,
      preload: "auto",
      fill: true,
      sources: [{ src: lockedSrc.current, type: "application/x-mpegURL" }]
    });
    player.current = p;
    const unmountQuality = mountQualitySelector(p);

    let resumePos: number | null = null;
    if (authed && id) {
      api<{ positionSec: number; completedAt: string | null }>(
        `/api/v1/me/history/${id}`
      )
        .then((h) => {
          if (h && h.positionSec > 5 && !h.completedAt) {
            resumePos = h.positionSec;
            // If metadata is already loaded, seek immediately
            try {
              if (!seekedOnce.current && p.readyState() >= 1) {
                p.currentTime(h.positionSec);
                seekedOnce.current = true;
              }
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => {
          // 404 (no history) is expected — ignore
        });
    }

    const onLoadedMeta = () => {
      if (resumePos != null && !seekedOnce.current) {
        try {
          p.currentTime(resumePos);
        } catch {
          /* ignore */
        }
        seekedOnce.current = true;
      }
    };
    p.on("loadedmetadata", onLoadedMeta);

    // Heartbeat every 10s for authed users
    let interval: number | undefined;
    const sendBeat = (completed = false) => {
      if (!authed || !id) return;
      const pos = Math.floor(p.currentTime() ?? 0);
      if (!completed && pos <= 0) return;
      api(`/api/v1/videos/${id}/heartbeat`, {
        method: "POST",
        body: JSON.stringify({ positionSec: pos, ...(completed ? { completed: true } : {}) })
      }).catch(() => {
        /* swallow */
      });
    };

    if (authed) {
      interval = window.setInterval(() => sendBeat(false), 10_000);
    }

    const onEnded = () => sendBeat(true);
    p.on("ended", onEnded);

    return () => {
      if (interval) window.clearInterval(interval);
      unmountQuality();
      try {
        p.off("loadedmetadata", onLoadedMeta);
        p.off("ended", onEnded);
      } catch {
        /* ignore */
      }
      p.dispose();
      player.current = null;
      seekedOnce.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.status]);

  async function handleDelete() {
    if (!video) return;
    if (!confirm(`Delete "${video.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api(`/api/v1/videos/${video.id}`, { method: "DELETE" });
      toast.success("Video deleted");
      navigate("/library");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const meta = video;
  const isOwnerView = authed && video?.status !== undefined && video?.visibility !== undefined;
  const canShare = isOwnerView; // share-link create requires ownership
  const canEmbed = video?.visibility === "PUBLIC";

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} />
        Back
      </button>

      <div className="player-page" style={{ marginTop: 16 }}>
        <div className="player-wrap">
          {video?.status === "READY" ? (
            <video
              ref={videoEl}
              className="video-js vjs-big-play-centered"
              playsInline
            />
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 13,
                flexDirection: "column",
                gap: 12,
                padding: 24
              }}
            >
              {video?.status === "FAILED" ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "var(--danger)", fontWeight: 600, marginBottom: 4 }}>
                    Transcoding failed
                  </div>
                  {video.error && <div>{video.error}</div>}
                </div>
              ) : (
                <>
                  <div>
                    Status: <strong style={{ color: "var(--text)" }}>{video?.status ?? "Loading..."}</strong>
                  </div>
                  {typeof video?.progress === "number" && (
                    <div style={{ width: "min(360px, 80%)" }} className="progress-block">
                      <div className="progress-label">
                        <span>Transcoding</span>
                        <span>{video.progress}%</span>
                      </div>
                      <div className="progress">
                        <div className="progress-bar" style={{ width: `${video.progress}%` }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="player-info">
          <div className="player-header">
            <h1 className="player-title">{meta?.title ?? "Loading..."}</h1>
            <div className="player-actions">
              {canShare && (
                <button className="btn" onClick={() => setShowShare(true)}>
                  <Share2 size={14} />
                  Share
                </button>
              )}
              {canEmbed && (
                <button className="btn" onClick={() => setShowEmbed(true)}>
                  <Code2 size={14} />
                  Embed
                </button>
              )}
              {isOwnerView && (
                <button
                  className="btn btn-danger"
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  <Trash2 size={14} />
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>

          {meta && (
            <div className="player-meta">
              <VisibilityPill v={meta.visibility} />
              {meta.category && (
                <>
                  <span className="player-meta-sep">·</span>
                  <span>{meta.category}</span>
                </>
              )}
              {typeof meta.viewCount === "number" && (
                <>
                  <span className="player-meta-sep">·</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Eye size={12} />
                    {meta.viewCount.toLocaleString()} views
                  </span>
                </>
              )}
              {formatDuration(meta.duration) && (
                <>
                  <span className="player-meta-sep">·</span>
                  <span>{formatDuration(meta.duration)}</span>
                </>
              )}
              {formatRelativeDate(meta.createdAt) && (
                <>
                  <span className="player-meta-sep">·</span>
                  <span>Uploaded {formatRelativeDate(meta.createdAt)}</span>
                </>
              )}
            </div>
          )}

          {meta?.description && (
            <div className="player-description">{meta.description}</div>
          )}
        </div>
      </div>

      {showShare && video && (
        <ShareModal
          videoId={video.id}
          videoTitle={video.title}
          onClose={() => setShowShare(false)}
        />
      )}
      {showEmbed && video && (
        <EmbedModal
          videoId={video.id}
          videoTitle={video.title}
          onClose={() => setShowEmbed(false)}
        />
      )}
    </div>
  );
}
