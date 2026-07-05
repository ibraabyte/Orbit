"use client";

import { downloadJson } from "@/lib/export";
import { buildOfflineQueueExportPayload } from "@/lib/offline-queue-export";
import type { OfflineCaptureDraft } from "@/lib/offline-queue";

export type OfflineQueueRescueDownload = {
  filename: string;
  payload: Awaited<ReturnType<typeof buildOfflineQueueExportPayload>>;
};

export function signOutOfflineQueuePrompt(count: number) {
  return `${count} offline capture${count === 1 ? "" : "s"} will be removed from this browser when you sign out. Download a rescue copy and continue?`;
}

export async function buildSignOutOfflineQueueRescue(
  userId: string,
  drafts: OfflineCaptureDraft[],
  exportedAt = new Date().toISOString()
): Promise<OfflineQueueRescueDownload> {
  const payload = await buildOfflineQueueExportPayload(userId, drafts, exportedAt);

  return {
    filename: `orbit-offline-queue-${exportedAt.slice(0, 10)}.json`,
    payload
  };
}

export async function downloadSignOutOfflineQueueRescue(userId: string, drafts: OfflineCaptureDraft[]) {
  const rescue = await buildSignOutOfflineQueueRescue(userId, drafts);
  downloadJson(rescue.filename, rescue.payload);
  return rescue.payload.summary;
}
