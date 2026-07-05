"use client";

import { HabitsPanel } from "@/components/habits-panel";
import { LoadingBlock } from "@/components/loading-block";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export function HabitsPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData(user?.id);
  if (!user) return null;

  return (
    <div className="content-frame">
      <PageHeader title="Habits" subtitle="Track routines that should stay visible without becoming full tasks." />
      {loading ? <LoadingBlock /> : null}
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      {!loading ? <HabitsPanel userId={user.id} habits={data.habits} habitLogs={data.habitLogs} onChanged={refresh} /> : null}
    </div>
  );
}
