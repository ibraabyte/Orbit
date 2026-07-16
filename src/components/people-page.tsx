"use client";

import { PeoplePanel } from "@/components/people-panel";
import { LoadingBlock } from "@/components/loading-block";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export function PeoplePage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData();
  if (!user) return null;

  return (
    <div className="content-frame">
      <PageHeader title="People" subtitle="Track birthdays, follow-ups, and relationship notes." />
      {loading ? <LoadingBlock /> : null}
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      {!loading ? <PeoplePanel userId={user.id} people={data.people} onChanged={refresh} /> : null}
    </div>
  );
}
