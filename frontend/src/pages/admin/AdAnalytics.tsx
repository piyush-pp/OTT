import { useEffect, useState } from "react";
import { BarChart2 } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { api } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsResponse {
  totalImpressions: number;
  totalCompletions: number;
  totalSkips: number;
  byCreative: Record<string, Record<string, number>>;
  byDay: { date: string; count: number }[];
}

interface Campaign {
  id: string;
  name: string;
}

interface Creative {
  id: string;
  title: string;
}

interface Paginated<T> {
  data: T[];
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminAdAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCampaign, setFilterCampaign] = useState("");
  const [filterCreative, setFilterCreative] = useState("");
  const defaultFrom = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  };
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  async function loadFilters() {
    const [cRes, crRes] = await Promise.all([
      api<Paginated<Campaign>>("/api/v1/admin/campaigns?pageSize=200"),
      api<Paginated<Creative>>("/api/v1/admin/ad-creatives?pageSize=200")
    ]);
    setCampaigns(cRes.data);
    setCreatives(crRes.data);
  }

  async function loadAnalytics() {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (filterCampaign) params.set("campaignId", filterCampaign);
    if (filterCreative) params.set("creativeId", filterCreative);
    try {
      const res = await api<AnalyticsResponse>(`/api/v1/admin/ad-analytics?${params}`);
      setData(res);
    } catch {
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFilters();
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [filterCampaign, filterCreative, from, to]);

  const completionRate =
    data && data.totalImpressions > 0
      ? `${Math.round((data.totalCompletions / data.totalImpressions) * 100)}%`
      : "—";

  const skipRate =
    data && data.totalImpressions > 0
      ? `${Math.round((data.totalSkips / data.totalImpressions) * 100)}%`
      : "—";

  // Build per-creative table rows
  const creativeRows = data
    ? Object.entries(data.byCreative).map(([cid, events]) => ({
        id: cid,
        title: creatives.find((c) => c.id === cid)?.title ?? cid.slice(0, 12),
        impressions: events["IMPRESSION"] ?? 0,
        completions: events["COMPLETE"] ?? 0,
        skips: events["SKIP"] ?? 0,
        completionRate:
          (events["IMPRESSION"] ?? 0) > 0
            ? `${Math.round(((events["COMPLETE"] ?? 0) / (events["IMPRESSION"] ?? 1)) * 100)}%`
            : "—"
      }))
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Ad Analytics</h1>
          <p className="page-title-sub">Impressions, completions, and skip rates</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <input
          className="input"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={{ width: 160 }}
        />
        <span style={{ alignSelf: "center", color: "var(--text-muted)" }}>to</span>
        <input
          className="input"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={{ width: 160 }}
        />
        <select
          className="select"
          style={{ width: 200 }}
          value={filterCampaign}
          onChange={(e) => setFilterCampaign(e.target.value)}
        >
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: 200 }}
          value={filterCreative}
          onChange={(e) => setFilterCreative(e.target.value)}
        >
          <option value="">All creatives</option>
          {creatives.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      {/* KPI row */}
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <StatCard
          label="Impressions"
          value={loading ? "…" : (data?.totalImpressions ?? 0).toLocaleString()}
        />
        <StatCard
          label="Completion Rate"
          value={loading ? "…" : completionRate}
          sub={loading ? undefined : `${(data?.totalCompletions ?? 0).toLocaleString()} completions`}
        />
        <StatCard
          label="Skip Rate"
          value={loading ? "…" : skipRate}
          sub={loading ? undefined : `${(data?.totalSkips ?? 0).toLocaleString()} skips`}
        />
      </div>

      {/* Impressions by day chart */}
      {data && data.byDay.length > 0 ? (
        <div className="card" style={{ padding: "24px", marginBottom: 24 }}>
          <h2 style={{ marginBottom: 20, fontSize: 15 }}>Impressions by Day</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.byDay} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12
                }}
                cursor={{ fill: "rgba(229,51,74,0.08)" }}
              />
              <Bar dataKey="count" fill="#e5334a" radius={[3, 3, 0, 0]} name="Impressions" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !loading && (
          <div className="empty-state" style={{ marginBottom: 24 }}>
            <BarChart2 size={40} className="empty-state-icon" />
            <p className="empty-state-title">No impressions in this date range</p>
            <p className="empty-state-sub">Ads need to play for data to appear here</p>
          </div>
        )
      )}

      {/* Per-creative breakdown */}
      {creativeRows.length > 0 && (
        <div>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>By Creative</h2>
          <div className="card card-padless">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Creative", "Impressions", "Completions", "Completion Rate", "Skips"].map((h) => (
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
                {creativeRows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 500 }}>{row.title}</td>
                    <td style={{ padding: "12px 16px" }}>{row.impressions.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px" }}>{row.completions.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", color: "var(--success)" }}>{row.completionRate}</td>
                    <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>{row.skips.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
