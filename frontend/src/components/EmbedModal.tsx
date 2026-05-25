import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";

type EmbedResp = {
  html: string;
  src: string;
};

export function EmbedModal({
  videoId,
  videoTitle,
  onClose
}: {
  videoId: string;
  videoTitle?: string;
  onClose: () => void;
}) {
  const [embed, setEmbed] = useState<EmbedResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<EmbedResp>(`/api/v1/videos/${videoId}/embed`);
        if (!cancelled) setEmbed(res);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load embed code");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleCopy() {
    if (!embed) return;
    try {
      await navigator.clipboard.writeText(embed.html);
      toast.success("Embed code copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-wide" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">Embed this video</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {videoTitle && <div className="modal-subtitle">{videoTitle}</div>}

        {loading ? (
          <div className="modal-empty">Loading embed code...</div>
        ) : embed ? (
          <>
            <div className="modal-section">
              <div className="modal-section-label">Embed code</div>
              <div className="modal-row" style={{ alignItems: "flex-start" }}>
                <textarea
                  className="input modal-textarea"
                  readOnly
                  rows={3}
                  value={embed.html}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button className="btn" onClick={handleCopy}>
                  <Copy size={14} />
                  Copy
                </button>
              </div>
            </div>

            <div className="modal-section">
              <div className="modal-section-label">Preview</div>
              <div className="embed-preview">
                <iframe
                  src={embed.src}
                  width="100%"
                  height="100%"
                  frameBorder={0}
                  allowFullScreen
                  title="Embed preview"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="modal-empty">No embed code available.</div>
        )}
      </div>
    </div>
  );
}
