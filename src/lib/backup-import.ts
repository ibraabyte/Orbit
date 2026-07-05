"use client";

import { EXPORT_TABLES, type FullExportAttachmentFile, type FullExportData } from "@/lib/export";
import { normalizeDashboardWidgets } from "@/lib/dashboard-widgets";
import { getSupabase } from "@/lib/supabase";

const IMPORT_BATCH_SIZE = 100;
const ATTACHMENT_BUCKET = "orbit-attachments";
const ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;

export const IMPORT_TABLES = [
  "profiles",
  "tasks",
  "captures",
  "tags",
  "meals",
  "meal_plans",
  "grocery_items",
  "people",
  "weight_logs",
  "workouts",
  "sleep_logs",
  "focus_sessions",
  "expenses",
  "bills",
  "habits",
  "goals",
  "journal_entries",
  "reminders",
  "attachments",
  "taggings",
  "habit_logs",
  "goal_milestones"
] as const;

export const SKIPPED_IMPORT_TABLES = ["push_subscriptions"] as const;

type ImportTableName = (typeof IMPORT_TABLES)[number];
type SkippedImportTableName = (typeof SKIPPED_IMPORT_TABLES)[number];
type ExportTableName = (typeof EXPORT_TABLES)[number]["name"];
type BackupRow = Record<string, unknown>;

export type BackupImportPlan = {
  exportedAt: string | null;
  sourceUserId: string | null;
  version: number;
  data: FullExportData;
  attachmentFiles: FullExportAttachmentFile[];
  counts: Record<ExportTableName, number>;
  importableTotal: number;
  skippedTotal: number;
};

export type BackupImportResult = {
  imported: Record<ImportTableName, number>;
  skipped: Record<SkippedImportTableName, number>;
  skippedAttachmentMetadata: number;
  skippedInvalidReferences: number;
  reusedTags: number;
  totalImported: number;
  totalSkipped: number;
};

type ImportClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => PromiseLike<{
        data: BackupRow[] | null;
        error: { message: string } | null;
      }>;
    };
    upsert: (
      rows: BackupRow[],
      options: { onConflict: string }
    ) => PromiseLike<{
      error: { message: string } | null;
    }>;
  };
  storage?: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: Blob,
        options: { contentType?: string; upsert?: boolean }
      ) => PromiseLike<{
        error: { message: string } | null;
      }>;
      remove: (paths: string[]) => PromiseLike<{
        error: { message: string } | null;
      }>;
    };
  };
};

const IMPORT_COLUMNS: Record<ImportTableName, readonly string[]> = {
  profiles: [
    "id",
    "display_name",
    "timezone",
    "weight_unit",
    "daily_calorie_target",
    "daily_protein_target",
    "daily_carbs_target",
    "daily_fat_target",
    "weekly_workout_minutes_target",
    "dashboard_modules",
    "created_at"
  ],
  tasks: ["id", "user_id", "title", "notes", "status", "priority", "due_at", "reminder_at", "reminder_sent_at", "recurrence", "created_at", "updated_at"],
  reminders: ["id", "user_id", "task_id", "title", "body", "remind_at", "status", "sent_at", "created_at"],
  captures: ["id", "user_id", "type", "url", "title", "note", "source", "created_at"],
  attachments: ["id", "user_id", "capture_id", "bucket", "object_path", "filename", "content_type", "size_bytes", "created_at"],
  tags: ["id", "user_id", "name", "color", "created_at"],
  taggings: ["id", "user_id", "tag_id", "target_type", "target_id", "created_at"],
  meals: ["id", "user_id", "name", "calories", "protein_g", "carbs_g", "fat_g", "logged_at", "created_at"],
  meal_plans: ["id", "user_id", "name", "plan_date", "meal_type", "calories", "protein_g", "carbs_g", "fat_g", "note", "status", "created_at", "updated_at"],
  grocery_items: ["id", "user_id", "meal_plan_id", "name", "quantity", "category", "status", "due_at", "created_at", "updated_at"],
  people: ["id", "user_id", "name", "relationship", "contact_method", "birthday", "last_contacted_at", "next_follow_up_at", "notes", "favorite", "created_at", "updated_at"],
  weight_logs: ["id", "user_id", "weight", "unit", "logged_at", "created_at"],
  workouts: ["id", "user_id", "type", "duration_minutes", "calories", "notes", "logged_at", "created_at"],
  sleep_logs: ["id", "user_id", "sleep_date", "duration_minutes", "quality", "bedtime_at", "woke_at", "note", "created_at"],
  focus_sessions: ["id", "user_id", "task_id", "title", "duration_minutes", "started_at", "ended_at", "status", "energy", "note", "created_at"],
  expenses: ["id", "user_id", "merchant", "amount", "currency", "category", "note", "spent_at", "created_at"],
  bills: ["id", "user_id", "name", "amount", "currency", "category", "due_at", "recurrence", "status", "autopay", "note", "created_at", "updated_at"],
  habits: ["id", "user_id", "name", "frequency", "target_count", "color", "archived_at", "created_at"],
  habit_logs: ["id", "user_id", "habit_id", "logged_at", "note", "created_at"],
  goals: ["id", "user_id", "title", "notes", "status", "target_at", "created_at", "updated_at"],
  goal_milestones: ["id", "user_id", "goal_id", "title", "completed_at", "created_at"],
  journal_entries: ["id", "user_id", "mood", "title", "body", "entry_date", "created_at", "updated_at"]
};

const UPSERT_CONFLICTS: Record<ImportTableName, string> = {
  profiles: "id",
  tasks: "id",
  reminders: "id",
  captures: "id",
  attachments: "id",
  tags: "id",
  taggings: "user_id,tag_id,target_type,target_id",
  meals: "id",
  meal_plans: "id",
  grocery_items: "id",
  people: "id",
  weight_logs: "id",
  workouts: "id",
  sleep_logs: "id",
  focus_sessions: "id",
  expenses: "id",
  bills: "id",
  habits: "id",
  habit_logs: "id",
  goals: "id",
  goal_milestones: "id",
  journal_entries: "user_id,entry_date"
};

const TAGGING_TARGET_TABLES = {
  task: "tasks",
  capture: "captures",
  meal: "meals",
  workout: "workouts",
  expense: "expenses",
  bill: "bills",
  sleep: "sleep_logs",
  focus_session: "focus_sessions",
  meal_plan: "meal_plans",
  grocery_item: "grocery_items"
} as const;

type TaggingTargetType = keyof typeof TAGGING_TARGET_TABLES;

type ImportReferenceState = {
  taskIds: Set<string>;
  captureIds: Set<string>;
  mealPlanIds: Set<string>;
  habitIds: Set<string>;
  goalIds: Set<string>;
  targetIdsByType: Record<TaggingTargetType, Set<string>>;
};

export function parseBackupPayload(payload: unknown): BackupImportPlan {
  if (!isRecord(payload)) {
    throw new Error("Backup file must be a JSON object.");
  }

  if ((payload.version !== 2 && payload.version !== 3) || payload.scope !== "full-database") {
    throw new Error("Only full database exports from Orbit version 2 or 3 are supported.");
  }

  const rawData = payload.data;
  if (!isRecord(rawData)) {
    throw new Error("Backup file is missing database table data.");
  }

  const data = Object.fromEntries(
    EXPORT_TABLES.map((definition) => {
      const rows = rawData[definition.name];
      if (!Array.isArray(rows)) {
        throw new Error(`Backup table ${definition.name} is missing or invalid.`);
      }
      return [definition.name, rows.filter(isRecord).map((row) => ({ ...row }))];
    })
  ) as FullExportData;

  const counts = Object.fromEntries(EXPORT_TABLES.map((definition) => [definition.name, data[definition.name].length])) as Record<
    ExportTableName,
    number
  >;

  return {
    exportedAt: typeof payload.exportedAt === "string" ? payload.exportedAt : null,
    sourceUserId: typeof payload.userId === "string" ? payload.userId : null,
    version: payload.version,
    data,
    attachmentFiles: parseAttachmentFiles(payload),
    counts,
    importableTotal: IMPORT_TABLES.reduce((sum, table) => sum + counts[table], 0),
    skippedTotal: SKIPPED_IMPORT_TABLES.reduce((sum, table) => sum + counts[table], 0)
  };
}

export function backupImportCountsForUser(plan: BackupImportPlan, userId: string) {
  const skippedAttachmentMetadata = skippedAttachmentMetadataCount(plan, userId);

  return {
    importableTotal: plan.importableTotal - skippedAttachmentMetadata,
    skippedTotal: plan.skippedTotal + skippedAttachmentMetadata,
    skippedAttachmentMetadata
  };
}

export async function importBackupData(
  userId: string,
  plan: BackupImportPlan,
  client: ImportClient = getSupabase() as unknown as ImportClient
): Promise<BackupImportResult> {
  const tagState = await buildTagImportState(userId, plan.data.tags, client);
  const referenceState = buildImportReferenceState(plan);
  const attachmentRows = attachmentRowsForImport(plan, userId);
  const imported = Object.fromEntries(IMPORT_TABLES.map((table) => [table, 0])) as Record<ImportTableName, number>;
  const skippedAttachmentMetadata = plan.data.attachments.length - attachmentRows.length;
  let skippedInvalidReferences = 0;

  for (const table of IMPORT_TABLES) {
    const rows = rowsForImportTable(table, plan, tagState.rowsToImport, attachmentRows);
    const normalized = rows
      .map((row) => normalizeImportRow(table, row, userId, plan.sourceUserId, tagState.idMap, referenceState))
      .filter(Boolean) as BackupRow[];
    skippedInvalidReferences += rows.length - normalized.length;
    if (table === "attachments") {
      imported[table] += await importAttachmentRows(client, normalized, plan.attachmentFiles);
    } else {
      imported[table] += await upsertRows(client, table, normalized);
    }
  }

  const skipped = Object.fromEntries(SKIPPED_IMPORT_TABLES.map((table) => [table, plan.data[table].length])) as Record<
    SkippedImportTableName,
    number
  >;

  return {
    imported,
    skipped,
    skippedAttachmentMetadata,
    skippedInvalidReferences,
    reusedTags: tagState.reused,
    totalImported: Object.values(imported).reduce((sum, count) => sum + count, 0),
    totalSkipped: Object.values(skipped).reduce((sum, count) => sum + count, 0) + skippedAttachmentMetadata + skippedInvalidReferences
  };
}

function rowsForImportTable(table: ImportTableName, plan: BackupImportPlan, tagRowsToImport: BackupRow[], attachmentRows: BackupRow[]) {
  if (table === "tags") return tagRowsToImport;
  if (table === "attachments") return attachmentRows;
  return plan.data[table];
}

async function importAttachmentRows(client: ImportClient, rows: BackupRow[], attachmentFiles: FullExportAttachmentFile[]) {
  if (!rows.length) return 0;

  const restoredFiles = await restoreAttachmentFiles(client, rows, attachmentFiles);
  try {
    return await upsertRows(client, "attachments", rows);
  } catch (error) {
    if (restoredFiles.length) await removeRestoredAttachmentFiles(client, restoredFiles);
    throw error;
  }
}

function normalizeImportRow(
  table: ImportTableName,
  row: BackupRow,
  userId: string,
  sourceUserId: string | null,
  tagIdMap: Map<string, string>,
  referenceState: ImportReferenceState
) {
  const normalized = filterColumns(row, IMPORT_COLUMNS[table]);

  if (table === "profiles") {
    normalized.id = userId;
    normalized.dashboard_modules = normalizeDashboardWidgets(normalized.dashboard_modules);
    return normalized;
  }

  normalized.user_id = userId;

  detachOptionalDanglingReferences(table, normalized, referenceState);
  if (!hasRequiredReferences(table, normalized, tagIdMap, referenceState)) return null;

  if (table === "attachments" && typeof normalized.object_path === "string") {
    normalized.object_path = rewriteOwnerPath(normalized.object_path, sourceUserId, userId);
  }

  if (table === "taggings" && typeof normalized.tag_id === "string") {
    normalized.tag_id = tagIdMap.get(normalized.tag_id) ?? normalized.tag_id;
  }

  return normalized;
}

function detachOptionalDanglingReferences(table: ImportTableName, row: BackupRow, referenceState: ImportReferenceState) {
  if (table === "reminders") detachDanglingReference(row, "task_id", referenceState.taskIds);
  if (table === "attachments") detachDanglingReference(row, "capture_id", referenceState.captureIds);
  if (table === "grocery_items") detachDanglingReference(row, "meal_plan_id", referenceState.mealPlanIds);
  if (table === "focus_sessions") detachDanglingReference(row, "task_id", referenceState.taskIds);
}

function detachDanglingReference(row: BackupRow, column: string, validIds: Set<string>) {
  const value = row[column];
  if (typeof value === "string" && !validIds.has(value)) {
    row[column] = null;
  }
}

function hasRequiredReferences(table: ImportTableName, row: BackupRow, tagIdMap: Map<string, string>, referenceState: ImportReferenceState) {
  if (table === "habit_logs") return hasReference(row.habit_id, referenceState.habitIds);
  if (table === "goal_milestones") return hasReference(row.goal_id, referenceState.goalIds);
  if (table !== "taggings") return true;

  if (typeof row.tag_id !== "string" || !tagIdMap.has(row.tag_id)) return false;
  const targetIds = taggingTargetIds(row.target_type, referenceState);
  return Boolean(targetIds && hasReference(row.target_id, targetIds));
}

function taggingTargetIds(targetType: unknown, referenceState: ImportReferenceState) {
  if (!isTaggingTargetType(targetType)) return null;
  return referenceState.targetIdsByType[targetType];
}

function isTaggingTargetType(value: unknown): value is TaggingTargetType {
  return typeof value === "string" && value in TAGGING_TARGET_TABLES;
}

function hasReference(value: unknown, validIds: Set<string>) {
  return typeof value === "string" && validIds.has(value);
}

function buildImportReferenceState(plan: BackupImportPlan): ImportReferenceState {
  return {
    taskIds: rowIds(plan.data.tasks),
    captureIds: rowIds(plan.data.captures),
    mealPlanIds: rowIds(plan.data.meal_plans),
    habitIds: rowIds(plan.data.habits),
    goalIds: rowIds(plan.data.goals),
    targetIdsByType: Object.fromEntries(
      Object.entries(TAGGING_TARGET_TABLES).map(([targetType, table]) => [targetType, rowIds(plan.data[table])])
    ) as Record<TaggingTargetType, Set<string>>
  };
}

function rowIds(rows: BackupRow[]) {
  return new Set(rows.map((row) => row.id).filter((id): id is string => typeof id === "string"));
}

async function buildTagImportState(userId: string, tags: BackupRow[], client: ImportClient) {
  const { data, error } = await client.from("tags").select("id,name").eq("user_id", userId);
  if (error) {
    throw new Error(`tags: ${error.message}`);
  }

  const existingByName = new Map(
    (data ?? [])
      .filter((tag) => typeof tag.id === "string" && typeof tag.name === "string")
      .map((tag) => [String(tag.name).toLowerCase(), String(tag.id)])
  );
  const idMap = new Map<string, string>();
  const rowsToImport: BackupRow[] = [];
  let reused = 0;

  for (const tag of tags) {
    if (typeof tag.id !== "string") continue;
    const name = typeof tag.name === "string" ? tag.name : "";
    const existingId = existingByName.get(name.toLowerCase());
    if (existingId) {
      idMap.set(tag.id, existingId);
      reused += 1;
      continue;
    }

    idMap.set(tag.id, tag.id);
    rowsToImport.push(tag);
  }

  return { idMap, rowsToImport, reused };
}

async function upsertRows(client: ImportClient, table: ImportTableName, rows: BackupRow[]) {
  let count = 0;
  for (let index = 0; index < rows.length; index += IMPORT_BATCH_SIZE) {
    const batch = rows.slice(index, index + IMPORT_BATCH_SIZE);
    if (!batch.length) continue;

    const { error } = await client.from(table).upsert(batch, { onConflict: UPSERT_CONFLICTS[table] });
    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }
    count += batch.length;
  }
  return count;
}

function filterColumns(row: BackupRow, columns: readonly string[]) {
  const allowed = new Set(columns);
  return Object.fromEntries(Object.entries(row).filter(([key, value]) => allowed.has(key) && value !== undefined));
}

function rewriteOwnerPath(path: string, sourceUserId: string | null, userId: string) {
  if (!sourceUserId || sourceUserId === userId) return path;
  const prefix = `${sourceUserId}/`;
  return path.startsWith(prefix) ? `${userId}/${path.slice(prefix.length)}` : path;
}

function attachmentRowsForImport(plan: BackupImportPlan, userId: string) {
  const rows = plan.sourceUserId === userId
    ? plan.data.attachments
    : plan.attachmentFiles.length
      ? plan.data.attachments.filter((row) => typeof row.id === "string" && new Set(plan.attachmentFiles.map((file) => file.attachmentId)).has(row.id))
      : [];

  return rows.filter((row) => isSafeAttachmentRowForImport(row, plan.sourceUserId, userId));
}

function skippedAttachmentMetadataCount(plan: BackupImportPlan, userId: string) {
  return plan.data.attachments.length - attachmentRowsForImport(plan, userId).length;
}

function isSafeAttachmentRowForImport(row: BackupRow, sourceUserId: string | null, userId: string) {
  if (typeof row.id !== "string" || typeof row.bucket !== "string" || typeof row.object_path !== "string") return false;
  if (row.bucket !== ATTACHMENT_BUCKET) return false;

  if (!sourceUserId || sourceUserId === userId) {
    return row.object_path.startsWith(`${userId}/`);
  }

  return row.object_path.startsWith(`${sourceUserId}/`);
}

function parseAttachmentFiles(payload: BackupRow): FullExportAttachmentFile[] {
  if (payload.version !== 3 || !isRecord(payload.files)) return [];
  const rawFiles = payload.files.attachments;
  if (!Array.isArray(rawFiles)) return [];

  return rawFiles.filter(isRecord).map(parseAttachmentFile).filter(Boolean) as FullExportAttachmentFile[];
}

function parseAttachmentFile(row: BackupRow) {
  if (
    typeof row.attachmentId !== "string" ||
    typeof row.bucket !== "string" ||
    typeof row.objectPath !== "string" ||
    typeof row.filename !== "string" ||
    typeof row.dataBase64 !== "string"
  ) {
    return null;
  }

  return {
    attachmentId: row.attachmentId,
    bucket: row.bucket,
    objectPath: row.objectPath,
    filename: row.filename,
    contentType: typeof row.contentType === "string" ? row.contentType : null,
    sizeBytes: typeof row.sizeBytes === "number" ? row.sizeBytes : null,
    sha256: typeof row.sha256 === "string" ? row.sha256 : null,
    dataBase64: row.dataBase64
  };
}

type RestoredAttachmentFile = {
  bucket: string;
  objectPath: string;
};

async function restoreAttachmentFiles(client: ImportClient, rows: BackupRow[], attachmentFiles: FullExportAttachmentFile[]) {
  if (!attachmentFiles.length) return [];
  if (!client.storage) throw new Error("attachments: backup contains files but storage is unavailable.");

  const byAttachmentId = new Map(attachmentFiles.map((file) => [file.attachmentId, file]));
  const restored: RestoredAttachmentFile[] = [];

  try {
    for (const row of rows) {
      if (typeof row.id !== "string" || typeof row.bucket !== "string" || typeof row.object_path !== "string") continue;
      const file = byAttachmentId.get(row.id);
      if (!file) continue;

      const decodedSize = assertRestorableAttachmentFile(file, row.object_path);
      const bytes = base64ToBytes(file.dataBase64);
      if (bytes.byteLength !== decodedSize) {
        throw new Error(`attachments: ${row.object_path}: restored file size does not match backup metadata`);
      }
      await assertRestorableAttachmentDigest(file, bytes, row.object_path);
      const blob = new Blob([bytes], { type: file.contentType ?? "application/octet-stream" });

      const { error } = await client.storage.from(row.bucket).upload(row.object_path, blob, {
        contentType: file.contentType ?? undefined,
        upsert: true
      });

      if (error) throw new Error(`attachments: ${row.object_path}: ${error.message}`);
      restored.push({ bucket: row.bucket, objectPath: row.object_path });
    }
  } catch (error) {
    if (restored.length) await removeRestoredAttachmentFiles(client, restored);
    throw error;
  }

  return restored;
}

function assertRestorableAttachmentFile(file: FullExportAttachmentFile, objectPath: string) {
  const decodedSize = base64DecodedByteLength(file.dataBase64);
  if (decodedSize === null) {
    throw new Error(`attachments: ${objectPath}: embedded file data is unreadable`);
  }

  if (typeof file.sizeBytes === "number" && file.sizeBytes !== decodedSize) {
    throw new Error(`attachments: ${objectPath}: restored file size does not match backup metadata`);
  }

  if (decodedSize > ATTACHMENT_MAX_FILE_BYTES) {
    throw new Error(`attachments: ${objectPath}: restored file exceeds the 10 MB attachment limit`);
  }

  return decodedSize;
}

async function assertRestorableAttachmentDigest(file: FullExportAttachmentFile, bytes: Uint8Array, objectPath: string) {
  if (!file.sha256) return;
  if (!globalThis.crypto?.subtle) {
    throw new Error(`attachments: ${objectPath}: checksum verification is unavailable`);
  }

  const actual = await sha256Hex(bytes);
  if (actual !== file.sha256.toLowerCase()) {
    throw new Error(`attachments: ${objectPath}: restored file checksum does not match backup metadata`);
  }
}

async function removeRestoredAttachmentFiles(client: ImportClient, files: RestoredAttachmentFile[]) {
  if (!client.storage) return;
  const pathsByBucket = new Map<string, string[]>();

  for (const file of files) {
    pathsByBucket.set(file.bucket, [...(pathsByBucket.get(file.bucket) ?? []), file.objectPath]);
  }

  await Promise.all(
    [...pathsByBucket].map(async ([bucket, paths]) => {
      await client.storage?.from(bucket).remove(paths);
    })
  );
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function base64DecodedByteLength(value: string) {
  const normalized = value.trim();
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return (normalized.length / 4) * 3 - padding;
}

async function sha256Hex(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength) as Uint8Array<ArrayBuffer>;
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is BackupRow {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
