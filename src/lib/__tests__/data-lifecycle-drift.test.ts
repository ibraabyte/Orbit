import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETE_TABLES } from "@/lib/account-deletion";
import { IMPORT_TABLES, SKIPPED_IMPORT_TABLES } from "@/lib/backup-import";
import { EXPORT_TABLES } from "@/lib/export";

const migrationText = readdirSync(join(process.cwd(), "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8"))
  .join("\n");

const INTENTIONALLY_SKIPPED_RESTORE_TABLES = ["push_subscriptions"] as const;

describe("personal data lifecycle drift", () => {
  it("exports every migration-created public table", () => {
    const exportedTables = sortedTableNames(EXPORT_TABLES);

    expect(exportedTables).toEqual(migrationTableNames());
    expect(tableOwnerColumns(EXPORT_TABLES)).toEqual(expectedOwnerColumns());
  });

  it("classifies every exported table as restorable or intentionally skipped", () => {
    const exportedTables = sortedTableNames(EXPORT_TABLES);
    const classifiedTables = sortedValues([...IMPORT_TABLES, ...SKIPPED_IMPORT_TABLES]);

    expect(classifiedTables).toEqual(exportedTables);
    expect(sortedValues(SKIPPED_IMPORT_TABLES)).toEqual(sortedValues(INTENTIONALLY_SKIPPED_RESTORE_TABLES));
    expect(intersection(IMPORT_TABLES, SKIPPED_IMPORT_TABLES)).toEqual([]);
  });

  it("deletes every exported table with the same owner column", () => {
    expect(sortedTableNames(ACCOUNT_DELETE_TABLES)).toEqual(sortedTableNames(EXPORT_TABLES));
    expect(tableOwnerColumns(ACCOUNT_DELETE_TABLES)).toEqual(tableOwnerColumns(EXPORT_TABLES));
  });
});

function migrationTableNames() {
  return unique(Array.from(migrationText.matchAll(/create table if not exists public\.([a-z_]+)/g)).map((match) => match[1]));
}

function expectedOwnerColumns() {
  return Object.fromEntries(migrationTableNames().map((table) => [table, table === "profiles" ? "id" : "user_id"]));
}

function sortedTableNames(tables: readonly { name: string }[]) {
  return sortedValues(tables.map((table) => table.name));
}

function tableOwnerColumns(tables: readonly { name: string; ownerColumn: string }[]) {
  return Object.fromEntries([...tables].sort((left, right) => left.name.localeCompare(right.name)).map((table) => [table.name, table.ownerColumn]));
}

function sortedValues(values: readonly string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function intersection(left: readonly string[], right: readonly string[]) {
  const rightValues = new Set(right);
  return sortedValues(left.filter((value) => rightValues.has(value)));
}

function unique(values: string[]) {
  return sortedValues([...new Set(values)]);
}
