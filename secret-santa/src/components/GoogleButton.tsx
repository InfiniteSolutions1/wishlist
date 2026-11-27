"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";

/** Starts Google sign-in and comes back to `next` afterwards. */
export function GoogleButton({ next = "/" }: { next?: string }) {
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const supabase = createBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) setBusy(false);
  }

  return (
    <button type="button" onClick={signIn} disabled={busy} className="btn-christmas w-full text-lg">
      <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-black text-[#4285F4]">
        G
      </span>
      {busy ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}
