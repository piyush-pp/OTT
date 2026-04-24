import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";

type Video = {
  id: string;
  title: string;
  status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
  createdAt: string;
  playbackUrl?: string | null;
  thumbnailUrl?: string | null;
  progress?: number;
  error?: string | null;
};

export function VideosPage() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    try {
      setError(null);
      const res = await api<{ videos: Video[] }>("/videos");
      setVideos(res.videos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="grid">
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2>Videos</h2>
            <p className="muted">Auto-refreshes every 5 seconds while transcodes run.</p>
          </div>
          <button className="btn" onClick={refresh}>
            Refresh
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="videos">
          {videos.map((v) => (
            <div key={v.id} className="card videoTile coolCard">
              <Link to={`/videos/${v.id}`}>
                {v.thumbnailUrl ? <img className="thumb" src={v.thumbnailUrl} alt={v.title} /> : <div className="thumb" />}
              </Link>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <strong>{v.title}</strong>
                <span className={`status ${v.status.toLowerCase()}`}>
                  {v.status}
                  {typeof v.progress === "number" ? ` • ${v.progress}%` : ""}
                </span>
                {v.status === "FAILED" && v.error ? <span className="error">{v.error}</span> : null}
              </div>
              <div className="tileActions">
                <button className="btn" onClick={() => navigate(`/videos/${v.id}`)}>
                  Open
                </button>
                <button
                  className="btn danger"
                  disabled={deletingId === v.id}
                  onClick={async () => {
                    if (!confirm(`Delete "${v.title}"? This cannot be undone.`)) return;
                    setDeletingId(v.id);
                    setError(null);
                    try {
                      await api(`/videos/${v.id}`, { method: "DELETE" });
                      setVideos((prev) => prev.filter((item) => item.id !== v.id));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Delete failed");
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                >
                  {deletingId === v.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
