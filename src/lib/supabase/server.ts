import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";
export async function createClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Workspace connection is unavailable.");
  const store = await cookies();
  return createServerClient(config.url, config.key, { cookies: {
    getAll: () => store.getAll(),
    setAll: (values) => {
      try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
      catch { /* Read-only Server Component; proxy refreshes cookies. */ }
    },
  } });
}
