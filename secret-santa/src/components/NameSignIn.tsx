"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinParty } from "@/app/actions/party";
import { createBrowserClient } from "@/lib/supabase/browser";

/**
 * The simple way in: type your name and go. No password, no email.
 * The person stays signed in on this device and browser.
 */
export function NameSignIn({ next = "/", joinCode, button }: { next?: string; joinCode?: string; button: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const fullName = name.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!fullName) return setProblem("Please type your name.");

    setBusy(true);
    setProblem(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInAnonymously({ options: { data: { full_name: fullName } } });
    if (error) {
      setBusy(false);
      return setProblem("That didn't work. Please try again in a moment.");
    }

    if (joinCode) {
      const form = new FormData();
      form.set("code", joinCode);
      await joinParty(form); // sends the person on to the party
    } else {
      router.push(next);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <label className="block font-bold">
        Your name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          autoComplete="name"
          className="input-christmas mt-1 font-normal"
          placeholder="e.g. Aunt Maria"
        />
      </label>
      <button type="submit" disabled={busy} className="btn-christmas w-full text-lg">
        {busy ? "One moment…" : button}
      </button>
      <p className="text-sm text-gray-700" aria-live="polite">
        {problem ?? "No password needed. You stay signed in on this phone or computer."}
      </p>
    </form>
  );
}
