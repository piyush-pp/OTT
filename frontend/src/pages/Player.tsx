import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { api } from "../api/client";

type Video = {
  id: string;
  title: string;
  status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
  playbackUrl?: string | null;
  progress?: number;
  error?: string | null;
};

export function PlayerPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [video, setVideo] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const player = useRef<ReturnType<typeof videojs> | null>(null);

  const src = useMemo(() => video?.playbackUrl ?? null, [video?.playbackUrl]);

  async function refresh() {
    if (!id) return;
    try {
      setError(null);
      const v = await api<Video>(`/videos/${id}`);
      setVideo(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (!videoEl.current) return;
    if (!src) return;
    if (player.current) return;

    player.current = videojs(videoEl.current, {
      controls: true,
      preload: "auto",
      fluid: true,
      sources: [{ src, type: "application/x-mpegURL" }]
    });

    return () => {
      player.current?.dispose();
      player.current = null;
    };
  }, [src]);

  useEffect(() => {
    if (!player.current || !src) return;
    player.current.src({ src, type: "application/x-mpegURL" });
  }, [src]);

  return (
    <div className="grid">
      <div className="card">
        <div className="playerHeader">
          <h2>{video?.title ?? "Video"}</h2>
          <button
            className="btn danger"
            disabled={!video || deleting}
            onClick={async () => {
              if (!video) return;
              if (!confirm(`Delete "${video.title}"? This cannot be undone.`)) return;
              setDeleting(true);
              setError(null);
              try {
                await api(`/videos/${video.id}`, { method: "DELETE" });
                navigate("/videos");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Delete failed");
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Deleting..." : "Delete video"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}

        {video?.status !== "READY" ? (
          <p className="muted">
            Status: <strong>{video?.status ?? "..."}</strong>
            {typeof video?.progress === "number" ? ` • ${video.progress}%` : ""}
            {video?.status === "FAILED" && video.error ? <span className="error"> • {video.error}</span> : null}
          </p>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <video ref={videoEl} className="video-js vjs-big-play-centered coolPlayer" />
        </div>

        {src ? (
          <p className="muted" style={{ marginTop: 12 }}>
            HLS: <a href={src}>{src}</a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
