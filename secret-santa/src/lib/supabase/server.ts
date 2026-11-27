import { createServerClient as createSsrClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** A Supabase client that acts as the signed-in person. Row-level security applies. */
export async function createServerClient() {
  const cookieStore = await cookies();
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, which cannot write cookies.
            // The proxy refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
