import { useEffect, useState } from "react";
import { Plus, Trash2, LayoutList, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type BreakType = "PRE" | "MID" | "POST";

interface PlacementItem {
  id: string;
  breakType: BreakType;
  midRollOffsetSec: number | null;
  targetCategory: string | null;
  targetVideoId: string | null;
  maxAdsPerPod: number;
  frequencyCapPerDay: number;
  cpmCents: number;
  createdAt: string;
  campaign: { id: string; name: string; status: string };
  creative: { id: string; title: string; status: string; durationSec: number };
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface Creative {
  id: string;
  title: string;
  status: string;
  durationSec: number;
}

// ─── Break type label ─────────────────────────────────────────────────────────

function BreakLabel({ type, offset }: { type: BreakType; offset: number | null }) {
  if (type === "PRE") return <span style={{ color: "var(--info)" }}>Pre-roll</span>;
  if (type === "POST") return <span style={{ color: "var(--warning)" }}>Post-roll</span>;
  return (
    <span style={{ color: "var(--success)" }}>
      Mid-roll @ {offset != null ? `${offset}s` : "?"}
    </span>
  );
}

// ─── Create placement modal ───────────────────────────────────────────────────

interface CreateModalProps {
  campaigns: Campaign[];
  creatives: Creative[];
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}

function CreateModal({ campaigns, creatives, categories, onClose, onSaved }: CreateModalProps) {
  const [campaignId, setCampaignId] = useState("");
  const [creativeId, setCreativeId] = useState("");
  const [breakType, setBreakType] = useState<BreakType>("PRE");
  const [midOffset, setMidOffset] = useState("");
  const [targetCategory, setTargetCategory] = useState("");
  const [targetVideoId, setTargetVideoId] = useState("");
  const [maxAds, setMaxAds] = useState("1");
  const [freqCap, setFreqCap] = useState("3");
  const [cpm, setCpm] = useState("0");
  const [saving, setSaving] = useState(false);

  const readyCreatives = creatives.filter((c) => c.status === "READY");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaignId) return toast.error("Select a campaign");
    if (!creativeId) return toast.error("Select a creative");
    if (breakType === "MID" && !midOffset) return toast.error("Enter mid-roll offset");

    const body: Record<string, unknown> = {
      campaignId,
      creativeId,
      breakType,
      maxAdsPerPod: parseInt(maxAds, 10),
      frequencyCapPerDay: parseInt(freqCap, 10),
      cpmCents: Math.round(parseFloat(cpm || "0") * 100) // UI shows dollars, API takes cents
    };
    if (breakType === "MID") body.midRollOffsetSec = parseInt(midOffset, 10);
    if (targetCategory) body.targetCategory = targetCategory;
    if (targetVideoId.trim()) body.targetVideoId = targetVideoId.trim();

    setSaving(true);
    try {
      await api("/api/v1/admin/placements", {
        method: "POST",
        body: JSON.stringify(body)
      });
      toast.success("Placement created");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">New Placement</h2>
          <button type="button" className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-section">
            <div className="form-stack">

              <div>
                <label className="modal-section-label">Campaign *</label>
                <select className="select" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                  <option value="">— select campaign —</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="modal-section-label">Ad Creative *</label>
                <select className="select" value={creativeId} onChange={(e) => setCreativeId(e.target.value)}>
                  <option value="">— select creative (READY only) —</option>
                  {readyCreatives.map((c) => (
                    <option key={c.id} value={c.id}>{c.title} ({c.durationSec}s)</option>
                  ))}
                </select>
                {creatives.length > 0 && readyCreatives.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--warning)", marginTop: 4 }}>
                    No READY creatives yet — wait for transcoding to finish.
                  </p>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="modal-section-label">Break Type *</label>
                  <select className="select" value={breakType} onChange={(e) => setBreakType(e.target.value as BreakType)}>
                    <option value="PRE">Pre-roll (before video)</option>
                    <option value="MID">Mid-roll (at offset)</option>
                    <option value="POST">Post-roll (after video)</option>
                  </select>
                </div>
                {breakType === "MID" && (
                  <div>
                    <label className="modal-section-label">Offset (seconds) *</label>
                    <input className="input" type="number" min={1} value={midOffset} onChange={(e) => setMidOffset(e.target.value)} placeholder="120" />
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>
                  Targeting (all optional — leave blank to run everywhere)
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="modal-section-label">Target Category</label>
                    <select className="select" value={targetCategory} onChange={(e) => setTargetCategory(e.target.value)}>
                      <option value="">All categories</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="modal-section-label">Target Video ID</label>
                    <input className="input" value={targetVideoId} onChange={(e) => setTargetVideoId(e.target.value)} placeholder="Leave blank for any video" />
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label className="modal-section-label">Max Ads Per Pod</label>
                  <input className="input" type="number" min={1} max={5} value={maxAds} onChange={(e) => setMaxAds(e.target.value)} />
                </div>
                <div>
                  <label className="modal-section-label">Frequency Cap / Day</label>
                  <input className="input" type="number" min={0} value={freqCap} onChange={(e) => setFreqCap(e.target.value)} />
                </div>
                <div>
                  <label className="modal-section-label">Floor CPM (USD)</label>
                  <input className="input" type="number" min={0} step={0.01} value={cpm} onChange={(e) => setCpm(e.target.value)} placeholder="0.00" />
                </div>
              </div>

            </div>
          </div>
          <div className="modal-section" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Create Placement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminPlacementsPage() {
  const [placements, setPlacements] = useState<PlacementItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterCampaign, setFilterCampaign] = useState("");

  async function load() {
    setLoading(true);
    try {
      const query = filterCampaign ? `?campaignId=${filterCampaign}&pageSize=100` : "?pageSize=100";
      const [placementsRes, campaignsRes, creativesRes, catsRes] = await Promise.all([
        api<Paginated<PlacementItem>>(`/api/v1/admin/placements${query}`),
        api<Paginated<Campaign>>("/api/v1/admin/campaigns?pageSize=200"),
        api<Paginated<Creative>>("/api/v1/admin/ad-creatives?pageSize=200"),
        api<{ data: string[] }>("/api/v1/categories")
      ]);
      setPlacements(placementsRes.data);
      setCampaigns(campaignsRes.data);
      setCreatives(creativesRes.data);
      setCategories(catsRes.data);
    } catch {
      toast.error("Failed to load placements");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [filterCampaign]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this placement?")) return;
    try {
      await api(`/api/v1/admin/placements/${id}`, { method: "DELETE" });
      toast.success("Placement deleted");
      await load();
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Placements</h1>
          <p className="page-title-sub">Link creatives to campaigns and configure targeting</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} />
          New Placement
        </button>
      </div>

      {/* Campaign filter */}
      <div style={{ marginBottom: 16 }}>
        <select
          className="select"
          style={{ maxWidth: 300 }}
          value={filterCampaign}
          onChange={(e) => setFilterCampaign(e.target.value)}
        >
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {loading && placements.length === 0 ? (
        <div className="empty-state">
          <LayoutList size={40} className="empty-state-icon" />
          <p className="empty-state-title">Loading…</p>
        </div>
      ) : placements.length === 0 ? (
        <div className="empty-state">
          <LayoutList size={40} className="empty-state-icon" />
          <p className="empty-state-title">No placements yet</p>
          <p className="empty-state-sub">Create a placement to schedule an ad break</p>
        </div>
      ) : (
        <div className="card card-padless">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Creative", "Campaign", "Break", "Targeting", "Cap / Pod", "CPM", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {placements.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 500 }}>{p.creative.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.creative.durationSec}s</div>
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>
                    {p.campaign.name}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <BreakLabel type={p.breakType} offset={p.midRollOffsetSec} />
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>
                    {p.targetCategory ? (
                      <span>Category: {p.targetCategory}</span>
                    ) : p.targetVideoId ? (
                      <span>Video: {p.targetVideoId.slice(0, 12)}…</span>
                    ) : (
                      <span>All videos</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12 }}>
                    {p.frequencyCapPerDay}/day · max {p.maxAdsPerPod}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>
                    {p.cpmCents > 0 ? `$${(p.cpmCents / 100).toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      className="btn btn-danger btn-sm btn-icon"
                      title="Delete"
                      onClick={() => handleDelete(p.id)}
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

      {showCreate && (
        <CreateModal
          campaigns={campaigns}
          creatives={creatives}
          categories={categories}
          onClose={() => setShowCreate(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
