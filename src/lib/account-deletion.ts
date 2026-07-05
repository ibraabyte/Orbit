import type { Database } from "@/lib/types";

type PublicTableName = keyof Database["public"]["Tables"];
type OwnerColumn = "id" | "user_id";
const STORAGE_PAGE_SIZE = 100;
const STORAGE_REMOVE_BATCH_SIZE = 100;

export type AccountDeleteTable = {
  name: PublicTableName;
  ownerColumn: OwnerColumn;
};

export const ACCOUNT_DELETE_TABLES = [
  { name: "attachments", ownerColumn: "user_id" },
  { name: "taggings", ownerColumn: "user_id" },
  { name: "reminders", ownerColumn: "user_id" },
  { name: "focus_sessions", ownerColumn: "user_id" },
  { name: "grocery_items", ownerColumn: "user_id" },
  { name: "habit_logs", ownerColumn: "user_id" },
  { name: "goal_milestones", ownerColumn: "user_id" },
  { name: "push_subscriptions", ownerColumn: "user_id" },
  { name: "captures", ownerColumn: "user_id" },
  { name: "tags", ownerColumn: "user_id" },
  { name: "tasks", ownerColumn: "user_id" },
  { name: "meal_plans", ownerColumn: "user_id" },
  { name: "meals", ownerColumn: "user_id" },
  { name: "people", ownerColumn: "user_id" },
  { name: "weight_logs", ownerColumn: "user_id" },
  { name: "workouts", ownerColumn: "user_id" },
  { name: "sleep_logs", ownerColumn: "user_id" },
  { name: "expenses", ownerColumn: "user_id" },
  { name: "bills", ownerColumn: "user_id" },
  { name: "habits", ownerColumn: "user_id" },
  { name: "goals", ownerColumn: "user_id" },
  { name: "journal_entries", ownerColumn: "user_id" },
  { name: "profiles", ownerColumn: "id" }
] as const satisfies readonly AccountDeleteTable[];

type DeleteClient = {
  from: (table: PublicTableName) => {
    delete: () => {
      eq: (
        column: OwnerColumn,
        value: string
      ) => PromiseLike<{
        error: { message: string } | null;
      }>;
    };
  };
};

type StorageObject = {
  name: string;
  id?: string | null;
  metadata?: unknown;
};

type StorageBucket = {
  list: (
    path: string,
    options?: { limit?: number; offset?: number; sortBy?: { column: string; order: "asc" | "desc" } }
  ) => PromiseLike<{
    data: StorageObject[] | null;
    error: { message: string } | null;
  }>;
  remove: (paths: string[]) => PromiseLike<{
    error: { message: string } | null;
  }>;
};

type StorageClient = {
  storage: {
    from: (bucket: string) => StorageBucket;
  };
};

export async function deleteAccountRows(client: DeleteClient, userId: string) {
  const ownerId = assertAccountOwnerId(userId);

  for (const table of ACCOUNT_DELETE_TABLES) {
    const { error } = await client.from(table.name).delete().eq(table.ownerColumn, ownerId);
    if (error) {
      throw new Error(`${table.name}: ${error.message}`);
    }
  }
}

export async function deleteAccountStorageObjects(client: StorageClient, userId: string, bucketName = "orbit-attachments") {
  const ownerId = assertAccountOwnerId(userId);
  const bucket = client.storage.from(bucketName);
  const paths = await collectStorageObjectPaths(bucket, ownerId);

  for (let index = 0; index < paths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = paths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
    const { error } = await bucket.remove(batch);
    if (error) {
      throw new Error(`storage remove: ${error.message}`);
    }
  }

  return paths.length;
}

function assertAccountOwnerId(userId: string) {
  const ownerId = userId.trim();
  if (!ownerId || ownerId.includes("/") || ownerId.includes("\\")) {
    throw new Error("Invalid account owner id.");
  }
  return ownerId;
}

async function collectStorageObjectPaths(bucket: StorageBucket, path: string): Promise<string[]> {
  const entries = await listAllStorageEntries(bucket, path);
  const paths: string[] = [];

  for (const entry of entries) {
    const entryPath = `${path}/${entry.name}`;
    if (isStorageFolder(entry)) {
      paths.push(...(await collectStorageObjectPaths(bucket, entryPath)));
    } else {
      paths.push(entryPath);
    }
  }

  return paths;
}

async function listAllStorageEntries(bucket: StorageBucket, path: string) {
  const entries: StorageObject[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await bucket.list(path, {
      limit: STORAGE_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" }
    });

    if (error) {
      throw new Error(`storage list ${path}: ${error.message}`);
    }

    const page = data ?? [];
    entries.push(...page);

    if (page.length < STORAGE_PAGE_SIZE) {
      return entries;
    }

    offset += STORAGE_PAGE_SIZE;
  }
}

function isStorageFolder(entry: StorageObject) {
  return entry.id === null || entry.metadata === null;
}
