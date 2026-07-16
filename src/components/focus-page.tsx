"use client";

import { FocusPanel } from "@/components/focus-panel";
import { LoadingBlock } from "@/components/loading-block";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export function FocusPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData();
  if (!user) return null;

  return (
    <div className="content-frame">
      <PageHeader title="Focus" subtitle="Plan and log focused work blocks tied to tasks or goals." />
      {loading ? <LoadingBlock /> : null}
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      {!loading ? (
        <FocusPanel
          userId={user.id}
          sessions={data.focusSessions}
          tasks={data.tasks}
          tags={data.tags}
          taggings={data.taggings}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}
