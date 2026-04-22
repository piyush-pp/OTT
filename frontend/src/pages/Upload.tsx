import { useState } from "react";
import { api } from "../api/client";
import { useNavigate } from "react-router-dom";

type UploadUrlResponse = {
  videoId: string;
  inputKey: string;
  uploadUrl: string;
};

export function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  return (
    <div className="grid">
      <div className="card">
        <h2>Upload</h2>
        <p className="muted">Uploads go directly to S3 (MinIO) using a presigned PUT URL.</p>

        <div className="row">
          <div>
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My video" />
          </div>
          <div>
            <label>Video file</label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
          <button
            className="btn primary"
            disabled={busy || !file || !title}
            onClick={async () => {
              if (!file) return;
              setBusy(true);
              setError(null);
              setOk(null);
              try {
                const { videoId, inputKey, uploadUrl } = await api<UploadUrlResponse>("/videos/upload-url", {
                  method: "POST",
                  body: JSON.stringify({ filename: file.name, contentType: file.type })
                });

                const putRes = await fetch(uploadUrl, {
                  method: "PUT",
                  headers: { "content-type": file.type },
                  body: file
                });
                if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

                await api("/videos/complete", {
                  method: "POST",
                  body: JSON.stringify({ videoId, title, inputKey })
                });

                setOk("Upload complete. Transcoding started.");
                navigate(`/videos/${videoId}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Uploading..." : "Upload & transcode"}
          </button>
          <button className="btn" disabled={busy} onClick={() => navigate("/videos")}>
            Back to videos
          </button>
        </div>

        {ok ? <p className="ok">{ok}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
