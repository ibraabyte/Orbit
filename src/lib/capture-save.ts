import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCaptureImageFilesWithinLimits, attachmentObjectPath } from "@/lib/capture-files";
import { getSupabase } from "@/lib/supabase";
import { createTaggings, ensureTags } from "@/lib/tag-actions";
import type { Capture, CaptureType, Database } from "@/lib/types";
import { sourceFromUrl } from "@/lib/url";

export type OnlineCaptureDraft = {
  userId: string;
  type: CaptureType;
  title: string;
  url: string | null;
  note: string | null;
  tagNames: string[];
  files?: File[];
  createdAt?: string;
};

export async function saveOnlineCapture(
  draft: OnlineCaptureDraft,
  supabase: SupabaseClient<Database> = getSupabase(),
  timestamp = Date.now()
) {
  const files = assertCaptureImageFilesWithinLimits(draft.files ?? []);
  let capture: Capture | null = null;
  const uploadedObjectPaths: string[] = [];
  let writesComplete = false;

  try {
    const { data, error } = await supabase
      .from("captures")
      .insert({
        user_id: draft.userId,
        type: files.length ? "screenshot" : draft.type,
        title: draft.title,
        url: draft.url,
        note: draft.note,
        source: sourceFromUrl(draft.url),
        created_at: draft.createdAt
      })
      .select()
      .single();

    if (error || !data) throw new Error(error?.message ?? "Capture could not be saved.");
    capture = data;

    if (files.length) {
      const attachmentRows = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const objectPath = attachmentObjectPath(draft.userId, capture.id, file, timestamp + index);
        const upload = await supabase.storage.from("orbit-attachments").upload(objectPath, file, {
          contentType: file.type || "application/octet-stream"
        });

        if (upload.error) throw new Error(upload.error.message);

        uploadedObjectPaths.push(objectPath);
        attachmentRows.push({
          user_id: draft.userId,
          capture_id: capture.id,
          bucket: "orbit-attachments",
          object_path: objectPath,
          filename: file.name,
          content_type: file.type || null,
          size_bytes: file.size
        });
      }

      const { error: attachmentError } = await supabase.from("attachments").insert(attachmentRows);
      if (attachmentError) throw new Error(attachmentError.message);
    }

    const tags = await ensureTags(draft.userId, draft.tagNames, supabase);
    await createTaggings(draft.userId, "capture", capture.id, tags, supabase);
    writesComplete = true;
    return capture;
  } catch (error) {
    if (capture && !writesComplete) {
      if (uploadedObjectPaths.length) await supabase.storage.from("orbit-attachments").remove(uploadedObjectPaths);
      if (files.length) await supabase.from("attachments").delete().eq("capture_id", capture.id).eq("user_id", draft.userId);
      await supabase.from("captures").delete().eq("id", capture.id).eq("user_id", draft.userId);
    }
    throw error;
  }
}
