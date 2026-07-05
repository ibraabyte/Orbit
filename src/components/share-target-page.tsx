"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QuickCapture } from "@/components/quick-capture";
import { useAuth } from "@/components/auth-provider";
import { LoadingBlock } from "@/components/loading-block";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { PageHeader } from "@/components/page-header";
import { ListRow } from "@/components/ui/list-row";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { normalizeSharedCapture } from "@/lib/share-target";
import { readSharedCapture, removeSharedCapture, type StoredSharedCapture } from "@/lib/share-target-store";

export function ShareTargetPage() {
  const params = useSearchParams();
  const { user } = useAuth();
  const { refresh } = useDashboardData(user?.id);
  const shareId = params.get("shareId");
  const shareErrorParam = params.get("shareError");
  const titleParam = params.get("title");
  const textParam = params.get("text");
  const urlParam = params.get("url");
  const [storedShare, setStoredShare] = useState<StoredSharedCapture | null>(null);
  const [loadingShare, setLoadingShare] = useState(Boolean(shareId));
  const [shareError, setShareError] = useState<string | null>(() => shareTargetErrorMessage(shareErrorParam));

  useEffect(() => {
    let active = true;
    setStoredShare(null);

    if (!shareId) {
      setLoadingShare(false);
      setShareError(shareTargetErrorMessage(shareErrorParam));
      return () => {
        active = false;
      };
    }

    setLoadingShare(true);
    setShareError(null);

    readSharedCapture(shareId)
      .then((payload) => {
        if (!active) return;
        if (!payload) {
          setShareError("The shared file was not available. You can still choose it manually below.");
          return;
        }
        setStoredShare(payload);
      })
      .catch(() => {
        if (active) setShareError("The shared file could not be loaded. You can still choose it manually below.");
      })
      .finally(() => {
        if (active) setLoadingShare(false);
      });

    return () => {
      active = false;
    };
  }, [shareErrorParam, shareId]);

  const sharedFiles = useMemo(() => (storedShare?.files ?? []).filter((file) => file.type.startsWith("image/")), [storedShare?.files]);
  const draft = useMemo(
    () =>
      normalizeSharedCapture({
        title: storedShare?.title ?? titleParam,
        text: storedShare?.text ?? textParam,
        url: storedShare?.url ?? urlParam,
        fileNames: sharedFiles.map((file) => file.name)
      }),
    [sharedFiles, storedShare?.text, storedShare?.title, storedShare?.url, textParam, titleParam, urlParam]
  );

  async function handleSaved() {
    if (shareId) {
      await removeSharedCapture(shareId).catch(() => undefined);
    }
    await refresh();
  }

  if (!user) return <LoadingBlock />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Save shared item" subtitle="Review the shared content, then save it to Orbit." />
      <div className="flex flex-col gap-4">
        <ModuleCard title="Shared capture" kicker="PWA share target">
          {loadingShare ? <EmptyState>Loading shared file...</EmptyState> : null}
          {shareError ? <div className="mb-2 text-[13px] font-semibold text-urgent" role="alert">{shareError}</div> : null}
          {!loadingShare ? (
            <QuickCapture
              key={shareId ?? `${draft.type}:${draft.title}:${draft.url}:${draft.note}`}
              userId={user.id}
              onSaved={handleSaved}
              initialType={draft.type}
              initialTitle={draft.title}
              initialUrl={draft.url}
              initialNote={draft.note}
              initialTags={draft.tags}
              initialFiles={sharedFiles}
            />
          ) : null}
        </ModuleCard>
        <ModuleCard title="Review handoff" kicker="Before saving">
          <div className="flex flex-col gap-1.5">
            <ListRow title="Capture type" subtitle={sharedFiles.length ? "Screenshot" : draft.type} />
            <ListRow title="Title" subtitle={draft.title || "Add a clear title before saving."} />
            <ListRow title="Attached images" subtitle={sharedFiles.length ? `${sharedFiles.length} image${sharedFiles.length === 1 ? "" : "s"} ready` : "No shared images attached"} />
          </div>
        </ModuleCard>
      </div>
    </div>
  );
}

function shareTargetErrorMessage(errorCode: string | null) {
  if (!errorCode) return null;
  if (errorCode === "too-large") {
    return "Shared images are too large for Orbit's offline handoff. Share fewer screenshots or save smaller files.";
  }
  return "The shared file could not be loaded. You can still save the text or choose the file manually.";
}
