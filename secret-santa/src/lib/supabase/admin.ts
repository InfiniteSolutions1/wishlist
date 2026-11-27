import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase client with the secret key. It bypasses row-level security, so it is
 * used in exactly two places: writing the draw, and deleting an account.
 * Always check who is asking before calling it.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
