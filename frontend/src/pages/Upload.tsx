import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { File as FileIcon, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";

type UploadUrlResponse = {
  videoId: string;
  inputKey: string;
  uploadUrl: string;
};

type CategoriesResp = { data: string[] };

type Visibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/x-matroska",
  "video/mpeg",
  "video/ogg",
  "video/3gpp",
  "video/x-flv"
];

const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function validateFile(file: File): string | null {
  // Some browsers report empty MIME — accept anything starting with video/
  const acceptable =
    file.type.startsWith("video/") || ALLOWED_VIDEO_TYPES.includes(file.type);
  if (!acceptable) {
    return `Unsupported file type: ${file.type || "(unknown)"}.`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024 / 1024).toFixed(2)} GB). Max 2 GB.`;
  }
  return null;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "preparing" | "uploading" | "finalizing">("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    api<CategoriesResp>("/api/v1/categories")
      .then((res) => setCategories(res.data))
      .catch(() => {
        /* non-critical */
      });
  }, []);

  function setFileOrError(f: File | null) {
    if (!f) {
      setFile(null);
      return;
    }
    const err = validateFile(f);
    if (err) {
      toast.error(err);
      return;
    }
    setFile(f);
    if (!title) {
      const stripped = f.name.replace(/\.[^/.]+$/, "");
      setTitle(stripped);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFileOrError(dropped);
  }

  function uploadWithProgress(url: string, body: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      if (body.type) xhr.setRequestHeader("Content-Type", body.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadPct(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onabort = () => reject(new Error("Upload aborted"));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed: ${xhr.status}`));
      };
      xhr.send(body);
    });
  }

  async function handleUpload() {
    if (!file) {
      toast.error("Select a video file first");
      return;
    }
    if (!title.trim()) {
      toast.error("Add a title");
      return;
    }

    setBusy(true);
    setUploadPct(0);
    setPhase("preparing");

    try {
      const { videoId, inputKey, uploadUrl } = await api<UploadUrlResponse>(
        "/api/v1/videos/upload-url",
        {
          method: "POST",
          body: JSON.stringify({ filename: file.name, contentType: file.type || "video/mp4" })
        }
      );

      setPhase("uploading");
      await uploadWithProgress(uploadUrl, file);

      setPhase("finalizing");
      await api("/api/v1/videos/complete", {
        method: "POST",
        headers: { "Idempotency-Key": `upload-${videoId}` },
        body: JSON.stringify({
          videoId,
          title: title.trim(),
          inputKey,
          visibility,
          category: category || undefined,
          description: description.trim() || undefined
        })
      });

      toast.success("Upload complete. Transcoding started.");
      navigate(`/videos/${videoId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  const phaseLabel: Record<typeof phase, string> = {
    idle: "",
    preparing: "Preparing upload...",
    uploading: `Uploading ${uploadPct}%`,
    finalizing: "Starting transcode..."
  };

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Upload Video</h1>
          <p className="page-title-sub">
            Drag and drop, or click to select. Max 2 GB.
          </p>
        </div>
      </div>

      <div className="form-stack">
        {!file ? (
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onClick={() => !busy && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
          >
            <div className="dropzone-icon">
              <UploadCloud size={24} />
            </div>
            <div className="dropzone-title">Drag and drop your video here</div>
            <div className="dropzone-sub">or click to browse</div>
            <div className="dropzone-sub">MP4, MOV, AVI, WebM, MKV · Max 2 GB</div>
            <input
              ref={fileInputRef}
              className="dropzone-input"
              type="file"
              accept="video/*"
              onChange={(e) => setFileOrError(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : (
          <div className="file-info-card">
            <div className="file-info-meta">
              <span className="file-info-icon">
                <FileIcon size={18} />
              </span>
              <div className="file-info-text">
                <div className="file-info-name">{file.name}</div>
                <div className="file-info-sub">
                  {formatSize(file.size)} · {file.type || "video/*"}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Remove file"
              disabled={busy}
              onClick={() => {
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="upload-title">
            Title
          </label>
          <input
            id="upload-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A descriptive title"
            disabled={busy}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="upload-description">
            Description (optional)
          </label>
          <textarea
            id="upload-description"
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this video about?"
            disabled={busy}
            rows={3}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="upload-category">
            Category
          </label>
          <select
            id="upload-category"
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={busy}
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="field-label">Visibility</span>
          <div className="radio-group">
            {(["PRIVATE", "UNLISTED", "PUBLIC"] as Visibility[]).map((v) => (
              <label
                key={v}
                className={`radio-option ${visibility === v ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={v}
                  checked={visibility === v}
                  onChange={() => setVisibility(v)}
                  disabled={busy}
                />
                {v.charAt(0) + v.slice(1).toLowerCase()}
              </label>
            ))}
          </div>
          <span className="field-hint">
            {visibility === "PRIVATE" && "Only you can watch."}
            {visibility === "UNLISTED" && "Anyone with the link can watch."}
            {visibility === "PUBLIC" && "Listed on Browse for everyone."}
          </span>
        </div>

        {busy && (
          <div className="progress-block">
            <div className="progress-label">
              <span>{phaseLabel[phase]}</span>
              {phase === "uploading" && <span>{uploadPct}%</span>}
            </div>
            <div className="progress">
              <div
                className="progress-bar"
                style={{
                  width: phase === "uploading" ? `${uploadPct}%` : phase === "idle" ? "0%" : "100%"
                }}
              />
            </div>
          </div>
        )}

        <div className="upload-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => navigate("/library")}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !file || !title.trim()}
            onClick={handleUpload}
          >
            {busy ? "Working..." : "Upload & Transcode"}
          </button>
        </div>
      </div>
    </div>
  );
}
