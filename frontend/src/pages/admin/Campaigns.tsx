import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Megaphone, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "DONE";

interface Campaign {
  id: string;
  name: string;
  advertiser: string;
  budgetCents: number;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  createdAt: string;
  _count?: { placements: number };
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(d: string) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const colors: Record<CampaignStatus, string> = {
    DRAFT: "var(--text-muted)",
    ACTIVE: "var(--success)",
    PAUSED: "var(--warning)",
    DONE: "var(--text-faint)"
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        fontWeight: 500,
        color: colors[status]
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: colors[status],
          flexShrink: 0
        }}
      />
      {status}
    </span>
  );
}

// ─── Campaign form modal ──────────────────────────────────────────────────────

interface CampaignModalProps {
  campaign?: Campaign;
  onClose: () => void;
  onSaved: () => void;
}

function CampaignModal({ campaign, onClose, onSaved }: CampaignModalProps) {
  const isEdit = Boolean(campaign);
  const [name, setName] = useState(campaign?.name ?? "");
  const [advertiser, setAdvertiser] = useState(campaign?.advertiser ?? "");
  const [budgetCents, setBudgetCents] = useState(
    campaign ? String(campaign.budgetCents / 100) : ""
  );
  const [startDate, setStartDate] = useState(campaign ? toISODate(campaign.startDate) : "");
  const [endDate, setEndDate] = useState(campaign ? toISODate(campaign.endDate) : "");
  const [status, setStatus] = useState<CampaignStatus>(campaign?.status ?? "DRAFT");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    if (!advertiser.trim()) return toast.error("Advertiser is required");
    if (!startDate || !endDate) return toast.error("Start and end dates are required");
    if (new Date(endDate) <= new Date(startDate))
      return toast.error("End date must be after start date");

    const body: Record<string, unknown> = {
      name: name.trim(),
      advertiser: advertiser.trim(),
      budgetCents: Math.round(parseFloat(budgetCents || "0") * 100),
      startDate,
      endDate
    };
    if (isEdit) body.status = status;

    setSaving(true);
    try {
      if (isEdit && campaign) {
        await api(`/api/v1/admin/campaigns/${campaign.id}`, {
          method: "PATCH",
          body: JSON.stringify(body)
        });
        toast.success("Campaign updated");
      } else {
        await api("/api/v1/admin/campaigns", {
          method: "POST",
          body: JSON.stringify(body)
        });
        toast.success("Campaign created");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? "Edit Campaign" : "New Campaign"}</h2>
          <button type="button" className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-section">
            <div className="form-stack">
              <div>
                <label className="modal-section-label">Campaign Name *</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Q4 Brand Awareness" />
              </div>
              <div>
                <label className="modal-section-label">Advertiser *</label>
                <input className="input" value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div>
                <label className="modal-section-label">Budget (USD)</label>
                <input className="input" type="number" min={0} step={0.01} value={budgetCents} onChange={(e) => setBudgetCents(e.target.value)} placeholder="0.00" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="modal-section-label">Start Date *</label>
                  <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="modal-section-label">End Date *</label>
                  <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              {isEdit && (
                <div>
                  <label className="modal-section-label">Status</label>
                  <select className="select" value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus)}>
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="modal-section" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Campaign | null | "new">(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api<Paginated<Campaign>>("/api/v1/admin/campaigns?pageSize=50");
      setCampaigns(res.data);
    } catch {
      toast.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete campaign "${name}"? All placements will also be deleted.`)) return;
    try {
      await api(`/api/v1/admin/campaigns/${id}`, { method: "DELETE" });
      toast.success("Campaign deleted");
      await load();
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Campaigns</h1>
          <p className="page-title-sub">Manage ad campaign schedules and budgets</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal("new")}>
          <Plus size={15} />
          New Campaign
        </button>
      </div>

      {loading && campaigns.length === 0 ? (
        <div className="empty-state">
          <Megaphone size={40} className="empty-state-icon" />
          <p className="empty-state-title">Loading…</p>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="empty-state">
          <Megaphone size={40} className="empty-state-icon" />
          <p className="empty-state-title">No campaigns yet</p>
          <p className="empty-state-sub">Create a campaign to start running ads</p>
        </div>
      ) : (
        <div className="card card-padless">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Name", "Advertiser", "Budget", "Dates", "Placements", "Status", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>{c.advertiser}</td>
                  <td style={{ padding: "12px 16px" }}>
                    {c.budgetCents > 0 ? `$${(c.budgetCents / 100).toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-muted)" }}>
                    {toISODate(c.startDate)} → {toISODate(c.endDate)}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>
                    {c._count?.placements ?? "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StatusBadge status={c.status} />
                  </td>
                  <td style={{ padding: "12px 16px", display: "flex", gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm btn-icon"
                      title="Edit"
                      onClick={() => setModal(c)}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      className="btn btn-danger btn-sm btn-icon"
                      title="Delete"
                      onClick={() => handleDelete(c.id, c.name)}
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

      {modal !== null && (
        <CampaignModal
          campaign={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
