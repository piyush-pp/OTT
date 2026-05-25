import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Activity, Eye, Film, HardDrive, Timer, Users } from "lucide-react";
import { toast } from "sonner";
import { api, isAdminCached, probeAdmin } from "../api/client";

type Series = Array<{ date: string; count: number }>;

type MyStats = {
  uploads: number;
  totalViews: number;
  totalStorageBytes: string;
  totalWatchTimeSeconds: number;
  viewsLast7Days: Series;
};

type TopVideo = {
  id: string;
  title: string;
  viewCount: number;
  ownerEmail: string | null;
};

type AdminStats = {
  totalUsers: number;
  totalVideos: number;
  totalStorage: string;
  totalViews: number;
  viewsLast7Days: Series;
  uploadsLast7Days: Series;
  topVideos: TopVideo[];
};

function formatBytes(bytesStr: string | number): string {
  try {
    const n =
      typeof bytesStr === "number" ? bytesStr : Number(BigInt(String(bytesStr)));
    if (!Number.isFinite(n) || n < 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
  } catch {
    return "—";
  }
}

function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return "0 min";
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.round((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} min`;
}

function shortDay(iso: string): string {
  // "2026-05-15" → "May 15"
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

function KpiCard({
  label,
  value,
  icon
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  data
}: {
  title: string;
  data: Series;
}) {
  const chartData = data.map((d) => ({ ...d, label: shortDay(d.date) }));
  return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              stroke="#888"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            />
            <YAxis
              stroke="#888"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "#111",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 12
              }}
              labelStyle={{ color: "#ededed" }}
              cursor={{ fill: "rgba(99,102,241,0.08)" }}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function StatsPage() {
  const [mine, setMine] = useState<MyStats | null>(null);
  const [admin, setAdmin] = useState<AdminStats | null>(null);
  const [isAdmin, setIsAdmin] = useState(isAdminCached());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const my = await api<MyStats>("/api/v1/me/stats");
        if (!cancelled) setMine(my);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load stats");
        }
      }

      const adminFlag = isAdminCached() || (await probeAdmin().catch(() => false));
      if (cancelled) return;
      setIsAdmin(adminFlag);

      if (adminFlag) {
        try {
          const a = await api<AdminStats>("/api/v1/admin/stats");
          if (!cancelled) setAdmin(a);
        } catch (e) {
          if (!cancelled) {
            toast.error(
              e instanceof Error ? e.message : "Failed to load admin stats"
            );
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Stats</h1>
          <p className="page-title-sub">Engagement and storage at a glance.</p>
        </div>
      </div>

      <div className="section-label">Your stats</div>
      <div className="kpi-row">
        <KpiCard
          label="Uploads"
          value={mine ? mine.uploads.toLocaleString() : "—"}
          icon={<Film size={18} />}
        />
        <KpiCard
          label="Total views"
          value={mine ? mine.totalViews.toLocaleString() : "—"}
          icon={<Eye size={18} />}
        />
        <KpiCard
          label="Storage used"
          value={mine ? formatBytes(mine.totalStorageBytes) : "—"}
          icon={<HardDrive size={18} />}
        />
        <KpiCard
          label="Watch time"
          value={mine ? formatDuration(mine.totalWatchTimeSeconds) : "—"}
          icon={<Timer size={18} />}
        />
      </div>

      <div className="chart-grid one">
        <ChartCard
          title="Views — Last 7 days"
          data={mine?.viewsLast7Days ?? []}
        />
      </div>

      {isAdmin && (
        <>
          <div className="section-label" style={{ marginTop: 32 }}>
            Platform stats
          </div>
          <div className="kpi-row">
            <KpiCard
              label="Total users"
              value={admin ? admin.totalUsers.toLocaleString() : "—"}
              icon={<Users size={18} />}
            />
            <KpiCard
              label="Total videos"
              value={admin ? admin.totalVideos.toLocaleString() : "—"}
              icon={<Film size={18} />}
            />
            <KpiCard
              label="Total storage"
              value={admin ? formatBytes(admin.totalStorage) : "—"}
              icon={<HardDrive size={18} />}
            />
            <KpiCard
              label="Total views"
              value={admin ? admin.totalViews.toLocaleString() : "—"}
              icon={<Activity size={18} />}
            />
          </div>

          <div className="chart-grid two">
            <ChartCard
              title="Platform views — Last 7 days"
              data={admin?.viewsLast7Days ?? []}
            />
            <ChartCard
              title="Uploads — Last 7 days"
              data={admin?.uploadsLast7Days ?? []}
            />
          </div>

          <div className="section-label" style={{ marginTop: 24 }}>
            Top videos
          </div>
          <div className="top-videos-card">
            {admin && admin.topVideos.length > 0 ? (
              <table className="top-videos-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Owner</th>
                    <th style={{ textAlign: "right" }}>Views</th>
                  </tr>
                </thead>
                <tbody>
                  {admin.topVideos.map((v) => (
                    <tr key={v.id}>
                      <td className="top-videos-title">{v.title}</td>
                      <td className="top-videos-owner">{v.ownerEmail ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        {v.viewCount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="modal-empty">No videos yet.</div>
            )}
          </div>
        </>
      )}

      {loading && !mine && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="empty-state-title">Loading...</div>
        </div>
      )}
    </div>
  );
}
