import type { ApiClient } from "@/lib/api";

// Same names as the tones in components/screen.tsx.
type Tone = "danger" | "warning" | "success" | "neutral";

// WHOOP lives only on Orbit's own server (backend/app/routers/whoop.py). Shapes mirror its JSON.

export type WhoopStatus = {
  configured: boolean;
  ai_configured: boolean;
  connected: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

export type WhoopDay = {
  date: string;
  recovery: number | null;
  recovery_zone: "green" | "yellow" | "red" | null;
  hrv: number | null;
  resting_hr: number | null;
  spo2: number | null;
  skin_temp: number | null;
  strain: number | null;
  average_hr: number | null;
  max_hr: number | null;
  kilojoule: number | null;
  sleep_hours: number | null;
  sleep_need_hours: number | null;
  sleep_performance: number | null;
  sleep_efficiency: number | null;
  sleep_consistency: number | null;
  respiratory_rate: number | null;
  deep_hours: number | null;
  rem_hours: number | null;
  workouts: number;
  workout_minutes: number;
};

export type WhoopMetricKey = "recovery" | "hrv" | "resting_hr" | "strain" | "sleep_hours" | "sleep_performance" | "sleep_efficiency" | "respiratory_rate";

export type WhoopMetric = {
  key: WhoopMetricKey;
  average: number | null;
  last7: number | null;
  prev7: number | null;
  change: number | null;
  higher_is_better: boolean | null;
};

type Latest = { value: number; date: string } | null;

export type WhoopSummary = {
  days: number;
  start: string;
  end: string;
  has_data: boolean;
  latest: Record<"recovery" | "hrv" | "resting_hr" | "strain" | "sleep_hours" | "sleep_performance", Latest>;
  daily: WhoopDay[];
  metrics: WhoopMetric[];
  recovery_zones: { green: number; yellow: number; red: number };
  workouts: { count: number; minutes: number; strain: number; by_sport: { sport: string; count: number; minutes: number; strain: number }[] };
  strain_vs_recovery: { high_strain_threshold: number; after_high_strain: number | null; after_lower_strain: number | null; high_strain_days: number };
};

export type WhoopInsight = {
  id: string;
  period_start: string;
  period_end: string;
  summary: string;
  highlights: string[];
  recommendations: string[];
  model: string;
  created_at: string;
};

type Api = Pick<ApiClient, "get" | "post" | "delete">;

export const whoopApi = {
  status: (api: Api) => api.get<WhoopStatus>("/whoop/status"),
  summary: (api: Api, days = 30) => api.get<WhoopSummary>(`/whoop/summary?days=${days}`),
  latestInsight: (api: Api) => api.get<WhoopInsight | null>("/whoop/insights/latest"),
  writeInsight: (api: Api) => api.post<WhoopInsight>("/whoop/insights"),
  sync: (api: Api) => api.post<{ counts: Record<string, number>; last_synced_at: string | null }>("/whoop/sync"),
  connectUrl: (api: Api, returnTo: string) => api.post<{ url: string }>("/whoop/connect", { return_to: returnTo }),
  disconnect: (api: Api, deleteData: boolean) => api.delete(`/whoop/connection?delete_data=${deleteData}`)
};

// What the server's redirect (orbit://whoop?status=...) means, in words for the screen.
export function connectResultMessage(url: string | null | undefined): { ok: boolean; message: string } | null {
  if (!url) return null;
  const match = /[?&]status=([a-z_]+)/.exec(url);
  const status = match?.[1];
  if (!status) return null;
  const messages: Record<string, string> = {
    connected: "WHOOP connected. Your data is syncing.",
    denied: "WHOOP access wasn't allowed.",
    expired: "That sign-in took too long. Try again.",
    error: "WHOOP sign-in failed. Try again.",
    not_configured: "WHOOP isn't set up on the server yet."
  };
  return { ok: status === "connected", message: messages[status] ?? "WHOOP sign-in didn't finish." };
}

export function recoveryTone(zone: WhoopDay["recovery_zone"] | undefined): Tone {
  if (zone === "green") return "success";
  if (zone === "yellow") return "warning";
  if (zone === "red") return "danger";
  return "neutral";
}

export function zoneFor(score: number | null | undefined): WhoopDay["recovery_zone"] {
  if (score === null || score === undefined) return null;
  return score >= 67 ? "green" : score >= 34 ? "yellow" : "red";
}

export function formatHours(hours: number | null | undefined) {
  if (hours === null || hours === undefined) return "-";
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export const metricLabels: Record<WhoopMetricKey, { label: string; format: (value: number) => string }> = {
  recovery: { label: "Recovery", format: (v) => `${Math.round(v)}%` },
  hrv: { label: "HRV", format: (v) => `${Math.round(v)} ms` },
  resting_hr: { label: "Resting HR", format: (v) => `${Math.round(v)} bpm` },
  strain: { label: "Strain", format: (v) => v.toFixed(1) },
  sleep_hours: { label: "Sleep", format: (v) => formatHours(v) },
  sleep_performance: { label: "Sleep performance", format: (v) => `${Math.round(v)}%` },
  sleep_efficiency: { label: "Sleep efficiency", format: (v) => `${Math.round(v)}%` },
  respiratory_rate: { label: "Respiratory rate", format: (v) => `${v.toFixed(1)} rpm` }
};

// "+6% vs prior week" with a tone: green when it moved the good way, red the bad way, grey when it's context.
export function describeChange(metric: WhoopMetric): { text: string; tone: Tone } | null {
  const { change, prev7, higher_is_better: higherIsBetter } = metric;
  if (change === null || prev7 === null) return null;
  const format = metricLabels[metric.key].format;
  // Hours read better as minutes when the change is small.
  const amount = metric.key === "sleep_hours" ? `${Math.round(Math.abs(change) * 60)}m` : format(Math.abs(change)).replace(/^-/, "");
  const steady = Math.abs(change) < (metric.key === "sleep_hours" ? 0.1 : metric.key === "strain" ? 0.3 : 1);
  if (steady) return { text: "steady vs prior week", tone: "neutral" };
  const up = change > 0;
  const tone: Tone = higherIsBetter === null ? "neutral" : up === higherIsBetter ? "success" : "danger";
  return { text: `${up ? "+" : "-"}${amount} vs prior week`, tone };
}

// Last n days for the recovery bars, oldest first; missing days stay as gaps.
export function recentRecovery(daily: WhoopDay[], n = 14) {
  return daily.slice(-n).map((day) => ({ date: day.date, value: day.recovery, zone: day.recovery_zone ?? zoneFor(day.recovery) }));
}

export function syncedAgo(lastSyncedAt: string | null, now = new Date()) {
  if (!lastSyncedAt) return "Not synced yet";
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(lastSyncedAt).getTime()) / 60000));
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Synced ${hours}h ago`;
  return `Synced ${Math.round(hours / 24)}d ago`;
}
