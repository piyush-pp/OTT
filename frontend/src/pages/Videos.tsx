import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  const [videos, setVideos] = useState<Video[]>([]);
  const [error, setError] = useState<string | null>(null);

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
            <Link key={v.id} to={`/videos/${v.id}`} className="card videoTile">
              {v.thumbnailUrl ? <img className="thumb" src={v.thumbnailUrl} alt={v.title} /> : <div className="thumb" />}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <strong>{v.title}</strong>
                <span className="muted">
                  {v.status}
                  {typeof v.progress === "number" ? ` • ${v.progress}%` : ""}
                </span>
                {v.status === "FAILED" && v.error ? <span className="error">{v.error}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
