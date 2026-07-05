"use client";

import { JournalPanel } from "@/components/journal-panel";
import { LoadingBlock } from "@/components/loading-block";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export function JournalPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData(user?.id);
  if (!user) return null;

  return (
    <div className="content-frame">
      <PageHeader title="Journal" subtitle="A quick daily reflection with mood history." />
      {loading ? <LoadingBlock /> : null}
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      {!loading ? <JournalPanel userId={user.id} entries={data.journalEntries} onChanged={refresh} /> : null}
    </div>
  );
}
