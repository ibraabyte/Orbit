"use client";

import { FinancePanel } from "@/components/finance-panel";
import { LoadingBlock } from "@/components/loading-block";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export function FinancePage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData(user?.id);
  if (!user) return null;

  return (
    <div className="content-frame">
      <PageHeader title="Finance" subtitle="Track spending, recurring bills, and subscriptions." />
      {loading ? <LoadingBlock /> : null}
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      {!loading ? (
        <FinancePanel
          userId={user.id}
          expenses={data.expenses}
          bills={data.bills}
          tags={data.tags}
          taggings={data.taggings}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}
