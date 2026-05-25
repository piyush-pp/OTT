import { useEffect, useState, useCallback } from "react";
import { Copy, Link2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";

type ShareItem = {
  id: string;
  videoId: string;
  expiresAt: string;
  createdAt: string;
};

type CreateResp = {
  id: string;
  shareUrl: string;
  token: string;
  expiresAt: string;
};

function formatExpiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 1) return "<1 hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function ShareModal({
  videoId,
  videoTitle,
  onClose
}: {
  videoId: string;
  videoTitle?: string;
  onClose: () => void;
}) {
  const [ttlHours, setTtlHours] = useState<number>(24);
  const [creating, setCreating] = useState(false);
  const [generated, setGenerated] = useState<CreateResp | null>(null);
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [loadingShares, setLoadingShares] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ data: ShareItem[] }>(`/api/v1/videos/${videoId}/shares`);
      setShares(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load share links");
    } finally {
      setLoadingShares(false);
    }
  }, [videoId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleGenerate() {
    setCreating(true);
    try {
      const res = await api<CreateResp>(`/api/v1/videos/${videoId}/share`, {
        method: "POST",
        body: JSON.stringify({ ttlHours })
      });
      setGenerated(res);
      toast.success("Share link created");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create share link");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.shareUrl);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await api(`/api/v1/shares/${id}`, { method: "DELETE" });
      toast.success("Link revoked");
      if (generated && shares.find((s) => s.id === id)) {
        // If the currently-displayed generated link was revoked, clear it.
        // We don't know its id directly until the list refresh; clear if id matches.
      }
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">Share this video</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {videoTitle && (
          <div className="modal-subtitle">{videoTitle}</div>
        )}

        <div className="modal-section">
          <div className="modal-section-label">Generate a new link</div>
          <div className="modal-row">
            <select
              className="modal-select"
              value={ttlHours}
              onChange={(e) => setTtlHours(Number(e.target.value))}
            >
              <option value={1}>Expires in 1 hour</option>
              <option value={24}>Expires in 24 hours</option>
              <option value={168}>Expires in 7 days</option>
            </select>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={creating}
            >
              <Link2 size={14} />
              {creating ? "Generating..." : "Generate Link"}
            </button>
          </div>

          {generated && (
            <>
              <div className="modal-row" style={{ marginTop: 12 }}>
                <input
                  className="input modal-input"
                  readOnly
                  value={generated.shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button className="btn" onClick={handleCopy}>
                  <Copy size={14} />
                  Copy
                </button>
              </div>
              <div className="modal-hint">
                Link expires in {formatExpiresIn(generated.expiresAt)}.
              </div>
            </>
          )}
        </div>

        <div className="modal-section">
          <div className="modal-section-label">Active links</div>
          {loadingShares ? (
            <div className="modal-empty">Loading...</div>
          ) : shares.length === 0 ? (
            <div className="modal-empty">No active share links.</div>
          ) : (
            <ul className="share-list">
              {shares.map((s) => (
                <li key={s.id} className="share-list-item">
                  <div className="share-list-meta">
                    <div className="share-list-label">
                      Expires in {formatExpiresIn(s.expiresAt)}
                    </div>
                    <div className="share-list-sub">
                      Created {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRevoke(s.id)}
                    disabled={revokingId === s.id}
                  >
                    <Trash2 size={12} />
                    {revokingId === s.id ? "Revoking..." : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
