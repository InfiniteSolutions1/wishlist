import "server-only";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

/** The signed-in person's id, verified against the sign-in token, or null. */
export async function getUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

/** Sends signed-out visitors to the front page, remembering where they were going. */
export async function requireUser(nextPath: string): Promise<{ id: string }> {
  const id = await getUserId();
  if (!id) redirect(`/?next=${encodeURIComponent(nextPath)}`);
  return { id };
}
