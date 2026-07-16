"use client";

import { PageHeader } from "@/components/page-header";
import { LibraryPanel } from "@/components/library-panel";
import { LoadingBlock } from "@/components/loading-block";
import { useAuth } from "@/components/auth-provider";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export function LibraryPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData();
  if (!user) return null;

  return (
    <div className="content-frame">
      <PageHeader title="Library" subtitle="Save TikTok, X/Twitter, articles, screenshots, notes, and links." />
      {loading ? <LoadingBlock /> : null}
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      {!loading ? (
        <LibraryPanel
          userId={user.id}
          captures={data.captures}
          attachments={data.attachments}
          tags={data.tags}
          taggings={data.taggings}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}
