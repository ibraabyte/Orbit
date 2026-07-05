import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildServerReadinessItems, collectServerReadinessSnapshot } from "@/lib/readiness";
import type { Database } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorization = await authorizeReadinessRequest(request);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const snapshot = collectServerReadinessSnapshot(process.env);
  return NextResponse.json({
    items: buildServerReadinessItems(snapshot)
  });
}

async function authorizeReadinessRequest(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { authorized: true as const };
  }

  const token = request.headers.get("authorization")?.match(/^\s*Bearer\s+(.+?)\s*$/i)?.[1];
  if (!token) {
    return { authorized: false as const, status: 401, error: "Unauthorized" };
  }

  const supabase = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false
    }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { authorized: false as const, status: 401, error: "Unauthorized" };
  }

  return { authorized: true as const };
}
