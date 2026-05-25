import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload as UploadIcon, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import { CardVideo, VideoCard, VideoCardSkeleton } from "../components/VideoCard";
import { ContinueItem, ContinueWatchingCard } from "../components/ContinueWatchingCard";

type ListResp = {
  data: CardVideo[];
  meta: { total: number; page: number; pageSize: number; hasMore: boolean };
};

export function VideosPage() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<CardVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);

  async function refresh(initial = false) {
    if (initial) setLoading(true);
    try {
      const res = await api<ListResp>("/api/v1/videos?page=1&pageSize=100");
      setVideos((prev) =>
        res.data.map((newV) => {
          const existing = prev.find((v) => v.id === newV.id);
          return {
            ...newV,
            thumbnailUrl: existing?.thumbnailUrl ?? newV.thumbnailUrl
          };
        })
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load videos");
    } finally {
      if (initial) setLoading(false);
    }
  }

  async function refreshContinue() {
    try {
      const res = await api<{ data: ContinueItem[] }>(
        "/api/v1/me/history?continueWatching=true&page=1&pageSize=20"
      );
      setContinueItems(res.data);
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    refresh(true);
    refreshContinue();
    const t = setInterval(() => refresh(false), 5000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    return {
      total: videos.length,
      ready: videos.filter((v) => v.status === "READY").length,
      processing: videos.filter((v) => v.status === "PROCESSING" || v.status === "UPLOADED")
        .length,
      failed: videos.filter((v) => v.status === "FAILED").length
    };
  }, [videos]);

  async function handleDelete(id: string) {
    const target = videos.find((v) => v.id === id);
    if (!target) return;
    if (!confirm(`Delete "${target.title}"? This cannot be undone.`)) return;

    setDeletingId(id);
    try {
      await api(`/api/v1/videos/${id}`, { method: "DELETE" });
      setVideos((prev) => prev.filter((v) => v.id !== id));
      toast.success("Video deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page">
      {continueItems.length > 0 && (
        <div className="cw-section">
          <div className="cw-section-header">
            <div className="cw-section-title">Continue Watching</div>
          </div>
          <div className="cw-row">
            {continueItems.map((c) => (
              <ContinueWatchingCard key={c.video.id} item={c} />
            ))}
          </div>
        </div>
      )}

      <div className="page-header">
        <div className="page-title-block">
          <h1>My Library</h1>
          <p className="page-title-sub">Videos you've uploaded.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/upload")}
        >
          <UploadIcon size={14} />
          Upload Video
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ready</div>
          <div className="stat-value">{stats.ready}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Processing</div>
          <div className="stat-value">{stats.processing}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Failed</div>
          <div className="stat-value">{stats.failed}</div>
        </div>
      </div>

      {loading ? (
        <div className="video-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <UploadCloud size={24} />
          </div>
          <div className="empty-state-title">No videos yet</div>
          <p className="empty-state-sub">
            Upload your first video to get started. We'll transcode it for streaming automatically.
          </p>
          <button className="btn btn-primary" onClick={() => navigate("/upload")}>
            <UploadIcon size={14} />
            Upload your first video
          </button>
        </div>
      ) : (
        <div className="video-grid">
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              variant="library"
              onDelete={handleDelete}
              deleting={deletingId === v.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
