import { describe, expect, it } from "vitest";
import { buildSignOutOfflineQueueRescue, signOutOfflineQueuePrompt } from "@/lib/offline-queue-rescue";
import type { OfflineCaptureDraft } from "@/lib/offline-queue";

const queuedCapture: OfflineCaptureDraft = {
  id: "offline-1",
  type: "note",
  title: "Parking level",
  url: null,
  note: "P3 near elevator",
  tag_names: ["errand"],
  created_at: "2026-07-01T10:00:00.000Z"
};

describe("offline queue sign-out rescue", () => {
  it("explains that queued captures will be removed during sign-out", () => {
    expect(signOutOfflineQueuePrompt(1)).toBe("1 offline capture will be removed from this browser when you sign out. Download a rescue copy and continue?");
    expect(signOutOfflineQueuePrompt(2)).toBe("2 offline captures will be removed from this browser when you sign out. Download a rescue copy and continue?");
  });

  it("builds a dated rescue download for queued captures", async () => {
    const rescue = await buildSignOutOfflineQueueRescue("user-1", [queuedCapture], "2026-07-01T11:00:00.000Z");

    expect(rescue.filename).toBe("orbit-offline-queue-2026-07-01.json");
    expect(rescue.payload).toMatchObject({
      exportedAt: "2026-07-01T11:00:00.000Z",
      userId: "user-1",
      scope: "offline-capture-queue",
      summary: {
        captures: 1,
        files: 0
      },
      captures: [
        {
          id: "offline-1",
          title: "Parking level",
          type: "note"
        }
      ]
    });
  });
});
