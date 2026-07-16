"use client";

import { GoalsPanel } from "@/components/goals-panel";
import { LoadingBlock } from "@/components/loading-block";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export function GoalsPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData();
  if (!user) return null;

  return (
    <div className="content-frame">
      <PageHeader title="Goals" subtitle="Keep long-term outcomes visible and break them into milestones." />
      {loading ? <LoadingBlock /> : null}
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      {!loading ? <GoalsPanel userId={user.id} goals={data.goals} milestones={data.goalMilestones} onChanged={refresh} /> : null}
    </div>
  );
}
