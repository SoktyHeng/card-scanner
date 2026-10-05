"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";
export function createClient() {
  const { url, key } = getPublicEnv();
  return createBrowserClient<Database>(url, key);
}
