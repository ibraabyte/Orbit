import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationText = readdirSync(join(process.cwd(), "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8"))
  .join("\n");
const typesText = readFileSync(join(process.cwd(), "src", "lib", "types.ts"), "utf8");
const sourceText = [
  ...sourceFiles("src/app"),
  ...sourceFiles("src/components"),
  ...sourceFiles("src/hooks"),
  ...sourceFiles("src/lib")
]
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

describe("schema drift", () => {
  it("keeps migration-created public tables represented in the Supabase Database type", () => {
    expect(databaseTableKeys()).toEqual(migrationTableNames());
  });

  it("keeps Supabase table calls limited to typed public tables", () => {
    const tables = new Set(databaseTableKeys());
    const usedTables = supabaseFromTables();

    for (const table of usedTables) {
      expect(tables.has(table)).toBe(true);
    }
  });
});

function migrationTableNames() {
  return unique(Array.from(migrationText.matchAll(/create table if not exists public\.([a-z_]+)/g)).map((match) => match[1]));
}

function databaseTableKeys() {
  const tablesBlock = typesText.match(/Tables:\s*{([\s\S]*?)\n    };\n    Views:/)?.[1];
  if (!tablesBlock) throw new Error("Database public Tables block was not found.");
  return unique(Array.from(tablesBlock.matchAll(/^\s{6}([a-z_]+):\s*TableDefinition</gm)).map((match) => match[1]));
}

function supabaseFromTables() {
  const bucketNames = new Set(["orbit-attachments"]);
  return unique(
    Array.from(sourceText.matchAll(/\.from\(["']([a-z_][a-z0-9_-]*)["']\)/g))
      .map((match) => match[1])
      .filter((table) => !bucketNames.has(table))
  );
}

function sourceFiles(root: string): string[] {
  const absoluteRoot = join(process.cwd(), root);
  return readdirSync(absoluteRoot, { withFileTypes: true }).flatMap((entry) => {
    const path = join(absoluteRoot, entry.name);
    if (entry.isDirectory()) return sourceFiles(join(root, entry.name));
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}
