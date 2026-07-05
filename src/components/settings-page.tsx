"use client";

import { PageHeader } from "@/components/page-header";
import { SettingsPanel } from "@/components/settings-panel";
import { LoadingBlock } from "@/components/loading-block";
import { useAuth } from "@/components/auth-provider";

export function SettingsPage() {
  const { user } = useAuth();
  if (!user) return <LoadingBlock />;

  return (
    <div className="content-frame">
      <PageHeader title="Settings" subtitle="Manage notifications, exports, and account controls." />
      <SettingsPanel userId={user.id} userEmail={user.email} />
    </div>
  );
}
