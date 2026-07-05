"use client";

import { getSupabase } from "@/lib/supabase";
import type { DashboardData, Database } from "@/lib/types";

const EXPORT_PAGE_SIZE = 1000;
const ATTACHMENT_BUCKET = "orbit-attachments";
const ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const REDACTED_EXPORT_VALUE = "[redacted]";
const PUSH_SUBSCRIPTION_REDACTED_FIELDS = ["endpoint", "p256dh", "auth"] as const;

export const EXPORT_TABLES = [
  { name: "profiles", ownerColumn: "id", orderColumn: "created_at", ascending: true },
  { name: "tasks", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "reminders", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "captures", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "attachments", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "tags", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "taggings", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "meals", ownerColumn: "user_id", orderColumn: "logged_at", ascending: true },
  { name: "meal_plans", ownerColumn: "user_id", orderColumn: "plan_date", ascending: true },
  { name: "grocery_items", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "people", ownerColumn: "user_id", orderColumn: "name", ascending: true },
  { name: "weight_logs", ownerColumn: "user_id", orderColumn: "logged_at", ascending: true },
  { name: "workouts", ownerColumn: "user_id", orderColumn: "logged_at", ascending: true },
  { name: "sleep_logs", ownerColumn: "user_id", orderColumn: "sleep_date", ascending: true },
  { name: "focus_sessions", ownerColumn: "user_id", orderColumn: "started_at", ascending: true },
  { name: "expenses", ownerColumn: "user_id", orderColumn: "spent_at", ascending: true },
  { name: "bills", ownerColumn: "user_id", orderColumn: "due_at", ascending: true },
  { name: "push_subscriptions", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "habits", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "habit_logs", ownerColumn: "user_id", orderColumn: "logged_at", ascending: true },
  { name: "goals", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "goal_milestones", ownerColumn: "user_id", orderColumn: "created_at", ascending: true },
  { name: "journal_entries", ownerColumn: "user_id", orderColumn: "entry_date", ascending: true }
] as const satisfies readonly ExportTableDefinition[];

type ExportTableName = (typeof EXPORT_TABLES)[number]["name"];

type ExportTableDefinition = {
  name: keyof Database["public"]["Tables"];
  ownerColumn: "id" | "user_id";
  orderColumn: string;
  ascending: boolean;
};

type ExportQuery = {
  select: (columns: string) => ExportQuery;
  eq: (column: string, value: string) => ExportQuery;
  order: (column: string, options: { ascending: boolean }) => ExportQuery;
  range: (from: number, to: number) => Promise<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>;
};

type ExportClient = {
  from: (table: string) => ExportQuery;
  storage?: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{
        data: Blob | null;
        error: { message: string } | null;
      }>;
    };
  };
};

export type FullExportData = Record<ExportTableName, Record<string, unknown>[]>;

export type FullExportAttachmentFile = {
  attachmentId: string;
  bucket: string;
  objectPath: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  sha256?: string | null;
  dataBase64: string;
};

export type CsvExportFile = {
  table: ExportTableName;
  filename: string;
  rowCount: number;
  content: string;
};

export function buildExportPayload(userId: string, data: DashboardData) {
  return {
    exportedAt: new Date().toISOString(),
    userId,
    version: 1,
    data
  };
}

export async function loadFullExportData(userId: string, client: ExportClient = getSupabase() as unknown as ExportClient): Promise<FullExportData> {
  const entries = await Promise.all(
    EXPORT_TABLES.map(async (definition) => {
      const rows = await fetchAllRows(client, definition, userId);
      return [definition.name, redactExportRows(definition.name, rows)] as const;
    })
  );

  return Object.fromEntries(entries) as FullExportData;
}

export function buildFullExportPayload(
  userId: string,
  data: FullExportData,
  exportedAt = new Date().toISOString(),
  attachmentFiles: FullExportAttachmentFile[] = []
) {
  const exportData = redactFullExportData(data);

  return {
    exportedAt,
    userId,
    version: attachmentFiles.length ? 3 : 2,
    scope: "full-database",
    summary: buildFullExportSummary(exportData),
    fileSummary: {
      attachments: attachmentFiles.length
    },
    files: {
      attachments: attachmentFiles
    },
    data: exportData
  };
}

export function buildFullExportSummary(data: FullExportData) {
  return Object.fromEntries(EXPORT_TABLES.map((definition) => [definition.name, data[definition.name].length])) as Record<ExportTableName, number>;
}

export function buildCsvExportFiles(data: FullExportData): CsvExportFile[] {
  const exportData = redactFullExportData(data);

  return EXPORT_TABLES.map((definition) => {
    const rows = exportData[definition.name];
    return {
      table: definition.name,
      filename: `${definition.name}.csv`,
      rowCount: rows.length,
      content: rowsToCsv(rows)
    };
  });
}

export function rowsToCsv(rows: Record<string, unknown>[]) {
  const columns = csvColumns(rows);
  if (!columns.length) return "";

  const lines = [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))
  ];

  return `${lines.join("\r\n")}\r\n`;
}

export function downloadJson(filename: string, payload: unknown) {
  downloadBlob(filename, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
}

export function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
  downloadBlob(filename, new Blob([content], { type }));
}

export function downloadCsvZip(filename: string, files: CsvExportFile[]) {
  downloadBlob(filename, new Blob([buildZipArchive(files.map((file) => ({ filename: file.filename, content: file.content })))], { type: "application/zip" }));
}

export function buildZipArchive(files: Array<{ filename: string; content: string }>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const filename = encoder.encode(file.filename);
    const content = encoder.encode(file.content);
    const crc = crc32(content);
    const localHeader = zipLocalHeader({ filename, content, crc });
    const centralHeader = zipCentralHeader({ filename, content, crc, offset });

    localParts.push(localHeader, content);
    centralParts.push(centralHeader);
    offset += localHeader.length + content.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = byteLength(centralParts);
  const end = zipEndOfCentralDirectory(files.length, centralDirectorySize, centralDirectoryOffset);

  return concatBytes([...localParts, ...centralParts, end]);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvColumns(rows: Record<string, unknown>[]) {
  const columns: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      columns.push(key);
    }
  }

  return columns;
}

function csvCell(value: unknown) {
  const text = csvValue(value);
  if (!/[",\r\n]/.test(text) && text.trim() === text) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function zipLocalHeader({
  filename,
  content,
  crc
}: {
  filename: Uint8Array;
  content: Uint8Array;
  crc: number;
}) {
  const header = new Uint8Array(30 + filename.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, content.length, true);
  view.setUint32(22, content.length, true);
  view.setUint16(26, filename.length, true);
  view.setUint16(28, 0, true);
  header.set(filename, 30);
  return header;
}

function zipCentralHeader({
  filename,
  content,
  crc,
  offset
}: {
  filename: Uint8Array;
  content: Uint8Array;
  crc: number;
  offset: number;
}) {
  const header = new Uint8Array(46 + filename.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, content.length, true);
  view.setUint32(24, content.length, true);
  view.setUint16(28, filename.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  header.set(filename, 46);
  return header;
}

function zipEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return header;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function byteLength(parts: Uint8Array[]) {
  return parts.reduce((total, part) => total + part.length, 0);
}

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(byteLength(parts));
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

export async function loadFullExportAttachmentFiles(
  userId: string,
  attachments: Record<string, unknown>[],
  client: ExportClient = getSupabase() as unknown as ExportClient
): Promise<FullExportAttachmentFile[]> {
  if (!attachments.length) return [];
  if (!client.storage) {
    throw new Error("Attachment export requires Supabase storage support.");
  }

  const files: FullExportAttachmentFile[] = [];

  for (const attachment of attachments) {
    const payload = attachmentExportDescriptor(attachment, userId);
    if (!payload) continue;

    const { data, error } = await client.storage.from(payload.bucket).download(payload.objectPath);
    if (error || !data) {
      throw new Error(`attachments: ${payload.objectPath}: ${error?.message ?? "file could not be downloaded"}`);
    }

    const buffer = await blobToArrayBuffer(data);
    assertDownloadedAttachmentSize(payload, buffer.byteLength);

    files.push({
      ...payload,
      sha256: await sha256Hex(buffer),
      dataBase64: arrayBufferToBase64(buffer)
    });
  }

  return files;
}

function assertDownloadedAttachmentSize(file: Omit<FullExportAttachmentFile, "dataBase64">, byteLength: number) {
  if (typeof file.sizeBytes === "number" && file.sizeBytes !== byteLength) {
    throw new Error(`attachments: ${file.objectPath}: downloaded file size does not match attachment metadata`);
  }

  if (byteLength > ATTACHMENT_MAX_FILE_BYTES) {
    throw new Error(`attachments: ${file.objectPath}: downloaded file exceeds the 10 MB attachment limit`);
  }
}

async function fetchAllRows(client: ExportClient, definition: ExportTableDefinition, userId: string) {
  const rows: Record<string, unknown>[] = [];
  let page = 0;

  while (true) {
    const from = page * EXPORT_PAGE_SIZE;
    const to = from + EXPORT_PAGE_SIZE - 1;
    const { data, error } = await client
      .from(definition.name)
      .select("*")
      .eq(definition.ownerColumn, userId)
      .order(definition.orderColumn, { ascending: definition.ascending })
      .range(from, to);

    if (error) {
      throw new Error(`${definition.name}: ${error.message}`);
    }

    const pageRows = (data ?? []) as Record<string, unknown>[];
    rows.push(...pageRows);

    if (pageRows.length < EXPORT_PAGE_SIZE) {
      return rows;
    }

    page += 1;
  }
}

function attachmentExportDescriptor(row: Record<string, unknown>, userId: string) {
  if (typeof row.id !== "string" || typeof row.bucket !== "string" || typeof row.object_path !== "string" || typeof row.filename !== "string") {
    return null;
  }
  if (row.bucket !== ATTACHMENT_BUCKET || !isSafeAttachmentObjectPath(row.object_path, userId)) {
    return null;
  }

  return {
    attachmentId: row.id,
    bucket: row.bucket,
    objectPath: row.object_path,
    filename: row.filename,
    contentType: typeof row.content_type === "string" ? row.content_type : null,
    sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : null
  };
}

function isSafeAttachmentObjectPath(path: string, userId: string) {
  const ownerId = userId.trim();
  if (!ownerId || ownerId.includes("/") || ownerId.includes("\\")) return false;
  if (!path.startsWith(`${ownerId}/`) || path.includes("\\")) return false;
  return path.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

export function redactFullExportData(data: FullExportData): FullExportData {
  return Object.fromEntries(EXPORT_TABLES.map((definition) => [definition.name, redactExportRows(definition.name, data[definition.name])])) as FullExportData;
}

function redactExportRows(table: ExportTableName, rows: Record<string, unknown>[]) {
  if (table !== "push_subscriptions") return rows;

  return rows.map((row) => {
    const next = { ...row };
    for (const field of PUSH_SUBSCRIPTION_REDACTED_FIELDS) {
      if (field in next) next[field] = REDACTED_EXPORT_VALUE;
    }
    return next;
  });
}

function blobToArrayBuffer(blob: Blob) {
  const withArrayBuffer = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof withArrayBuffer.arrayBuffer === "function") return withArrayBuffer.arrayBuffer();
  return new Response(blob).arrayBuffer();
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
}

async function sha256Hex(buffer: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Attachment export requires Web Crypto checksum support.");
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(buffer));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
