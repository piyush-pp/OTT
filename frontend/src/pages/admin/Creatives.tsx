import { useEffect, useRef, useState } from "react";
import { Trash2, UploadCloud, X, Film } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdCreative {
  id: string;
  title: string;
  advertiserName: string;
  clickUrl: string | null;
  skipOffsetSec: number | null;
  durationSec: number;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  error: string | null;
  createdAt: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: AdCreative["status"] }) {
  const cls = status === "READY" ? "ready" : status === "FAILED" ? "failed" : "processing";
  return <span className={`status-pill ${cls}`}>{status}</span>;
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function UploadModal({ onClose, onCreated }: UploadModalProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [advertiser, setAdvertiser] = useState("");
  const [clickUrl, setClickUrl] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [skipOffsetSec, setSkipOffsetSec] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [uploadPct, setUploadPct] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("Select an MP4 file first");
    if (!title.trim()) return toast.error("Title is required");
    if (!advertiser.trim()) return toast.error("Advertiser name is required");
    const dur = parseInt(durationSec, 10);
    if (!dur || dur < 1) return toast.error("Duration must be at least 1 second");

    try {
      // Step 1: get presigned upload URL
      setPhase("uploading");
      const { uploadUrl, key, creativeId } = await api<{
        uploadUrl: string;
        key: string;
        creativeId: string;
      }>("/api/v1/admin/ad-creatives/upload-url");

      // Step 2: PUT the file directly to S3
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadPct(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("S3 upload failed")));
        xhr.onerror = () => reject(new Error("S3 upload failed"));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", "video/mp4");
        xhr.send(file);
      });

      // Step 3: create DB record + enqueue transcode
      setPhase("saving");
      await api("/api/v1/admin/ad-creatives", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          advertiserName: advertiser.trim(),
          clickUrl: clickUrl.trim() || undefined,
          durationSec: dur,
          skipOffsetSec: skipOffsetSec ? parseInt(skipOffsetSec, 10) : undefined,
          inputKey: key,
          creativeId
        })
      });

      toast.success("Creative uploaded — transcoding started");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setPhase("idle");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Upload Ad Creative</h2>
          <button type="button" className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-section">
            {/* File drop zone */}
            <div
              className="upload-dropzone"
              style={{
                border: "2px dashed var(--border-strong)",
                borderRadius: "var(--r-md)",
                padding: "32px",
                textAlign: "center",
                cursor: "pointer",
                marginBottom: "16px",
                background: file ? "var(--bg-hover)" : undefined
              }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4,video/*"
                style={{ display: "none" }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <UploadCloud size={32} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
              {file ? (
                <div>
                  <div style={{ fontWeight: 600 }}>{file.name}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--text-muted)" }}>
                  Click or drag an MP4 file here
                </div>
              )}
            </div>

            <div className="form-stack">
              <div>
                <label className="modal-section-label">Title *</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Summer Sale 15s"
                />
              </div>
              <div>
                <label className="modal-section-label">Advertiser Name *</label>
                <input
                  className="input"
                  value={advertiser}
                  onChange={(e) => setAdvertiser(e.target.value)}
                  placeholder="Acme Corp"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="modal-section-label">Duration (seconds) *</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={600}
                    value={durationSec}
                    onChange={(e) => setDurationSec(e.target.value)}
                    placeholder="15"
                  />
                </div>
                <div>
                  <label className="modal-section-label">Skip After (sec, optional)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={skipOffsetSec}
                    onChange={(e) => setSkipOffsetSec(e.target.value)}
                    placeholder="5"
                  />
                </div>
              </div>
              <div>
                <label className="modal-section-label">Click URL (optional)</label>
                <input
                  className="input"
                  type="url"
                  value={clickUrl}
                  onChange={(e) => setClickUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            </div>
          </div>

          {phase === "uploading" && (
            <div style={{ padding: "0 24px 16px" }}>
              <div style={{ background: "var(--bg-pressed)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${uploadPct}%`,
                    background: "var(--accent)",
                    transition: "width 200ms"
                  }}
                />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                Uploading… {uploadPct}%
              </div>
            </div>
          )}
          {phase === "saving" && (
            <div style={{ padding: "0 24px 16px", color: "var(--text-muted)", fontSize: 12 }}>
              Saving creative record…
            </div>
          )}

          <div className="modal-section" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={phase !== "idle"}
            >
              {phase === "idle" ? "Upload & Transcode" : "Working…"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminCreativesPage() {
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api<Paginated<AdCreative>>("/api/v1/admin/ad-creatives?pageSize=50");
      setCreatives(res.data);
    } catch {
      toast.error("Failed to load creatives");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Poll for status changes while any creative is PENDING or PROCESSING
  useEffect(() => {
    const hasPending = creatives.some((c) => c.status === "PENDING" || c.status === "PROCESSING");
    if (!hasPending) return;
    const t = setTimeout(() => void load(), 5_000);
    return () => clearTimeout(t);
  }, [creatives]);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete creative "${title}"? This cannot be undone.`)) return;
    try {
      await api(`/api/v1/admin/ad-creatives/${id}`, { method: "DELETE" });
      toast.success("Creative deleted");
      await load();
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Ad Creatives</h1>
          <p className="page-title-sub">Upload and manage ad video files</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
          <UploadCloud size={15} />
          Upload Creative
        </button>
      </div>

      {loading && creatives.length === 0 ? (
        <div className="empty-state">
          <Film size={40} className="empty-state-icon" />
          <p className="empty-state-title">Loading…</p>
        </div>
      ) : creatives.length === 0 ? (
        <div className="empty-state">
          <Film size={40} className="empty-state-icon" />
          <p className="empty-state-title">No ad creatives yet</p>
          <p className="empty-state-sub">Upload an MP4 to get started</p>
        </div>
      ) : (
        <div className="card card-padless">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Title", "Advertiser", "Duration", "Skip", "Status", "Created", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--text-muted)"
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {creatives.map((c) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td style={{ padding: "12px 16px", fontWeight: 500 }}>{c.title}</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>{c.advertiserName}</td>
                  <td style={{ padding: "12px 16px" }}>{c.durationSec}s</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>
                    {c.skipOffsetSec != null ? `${c.skipOffsetSec}s` : "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StatusPill status={c.status} />
                    {c.error && (
                      <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>
                        {c.error}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 12 }}>
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      className="btn btn-danger btn-sm btn-icon"
                      title="Delete creative"
                      onClick={() => handleDelete(c.id, c.title)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onCreated={() => void load()}
        />
      )}
    </div>
  );
}
