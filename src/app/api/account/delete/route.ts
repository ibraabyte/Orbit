import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deleteAccountRows, deleteAccountStorageObjects } from "@/lib/account-deletion";
import type { Database } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  if (!url || !anonKey || !serviceRole) {
    return NextResponse.json({ error: "Missing Supabase server configuration" }, { status: 500 });
  }

  const userClient = createClient<Database>(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    auth: {
      persistSession: false
    }
  });

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const admin = createClient<Database>(url, serviceRole, {
    auth: {
      persistSession: false
    }
  });

  try {
    await deleteAccountStorageObjects(admin, data.user.id);
    await deleteAccountRows(admin, data.user.id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Account data deletion failed." }, { status: 500 });
  }

  const deleted = await admin.auth.admin.deleteUser(data.user.id);
  if (deleted.error) {
    return NextResponse.json({ error: deleted.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
