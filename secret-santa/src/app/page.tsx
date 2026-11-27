import Link from "next/link";
import { createParty } from "@/app/actions/party";
import { GoogleButton } from "@/components/GoogleButton";
import { NameSignIn } from "@/components/NameSignIn";
import { googleSignInEnabled } from "@/lib/sign-in-options";
import { Notice } from "@/components/Notice";
import { Shell } from "@/components/Shell";
import { getUserId } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { createServerClient } from "@/lib/supabase/server";
import type { Party } from "@/lib/types";

/** The house rule, filled in for every new party. The organizer can change it. */
const DEFAULT_BUDGET = "$50 gift minimum - spend more if you wish";

type Search = Promise<{ next?: string; notice?: string }>;

export default async function Home({ searchParams }: { searchParams: Search }) {
  const { next, notice } = await searchParams;
  const userId = await getUserId();

  if (!userId) {
    return (
      <Shell signedIn={false}>
        <Notice message={notice} />
        <div className="text-center">
          <h1 className="christmas-font text-6xl font-bold text-santa">Secret Santa</h1>
          <p className="mt-3 text-lg text-gray-700">
            Draw names, share wishlists with links to the real thing, and keep the surprise.
          </p>
        </div>
        <ul className="my-8 space-y-2 text-gray-800">
          <li>🎁 Everyone lists what they'd love, with links</li>
          <li>🎲 One button decides who buys for whom</li>
          <li>🤫 Only you can see who you got</li>
        </ul>
        <NameSignIn next={safeNext(next)} button="🎄 Get started" />
        {googleSignInEnabled ? (
          <div className="mt-4">
            <GoogleButton next={safeNext(next)} />
          </div>
        ) : null}
        <p className="mt-4 text-center text-sm text-gray-600">
          Got an invite link? Open that instead and you'll go straight into the party.
        </p>
      </Shell>
    );
  }

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("parties")
    .select("id, name, owner_id, exchange_date, drawn_at")
    .order("created_at", { ascending: false });
  const parties = (data ?? []) as Pick<Party, "id" | "name" | "owner_id" | "exchange_date" | "drawn_at">[];

  return (
    <Shell>
      <Notice message={notice} />
      <h1 className="christmas-font text-5xl font-bold text-santa">Your parties</h1>

      {parties.length === 0 ? (
        <p className="mt-4 text-gray-700">
          You're not in a party yet. Start one below, or open an invite link someone sent you.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {parties.map((party) => (
            <li key={party.id}>
              <Link
                href={`/party/${party.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border-2 border-gray-200 bg-white p-4 hover:border-santa"
              >
                <span>
                  <span className="block text-xl font-bold">{party.name}</span>
                  <span className="text-sm text-gray-600">
                    {party.owner_id === userId ? "You organize this · " : ""}
                    {party.drawn_at ? "Names drawn" : "Names not drawn yet"}
                  </span>
                </span>
                <span aria-hidden="true" className="text-2xl text-santa">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 border-t-2 border-gray-200 pt-6">
        <h2 className="text-2xl font-bold">Start a party</h2>
        <form action={createParty} className="mt-4 space-y-4">
          <label className="block font-bold">
            Party name
            <input name="name" required maxLength={80} className="input-christmas mt-1 font-normal" placeholder="Family Christmas 2026" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block font-bold">
              Budget <span className="font-normal text-gray-600">(optional)</span>
              <input name="budget" maxLength={80} defaultValue={DEFAULT_BUDGET} className="input-christmas mt-1 font-normal" />
            </label>
            <label className="block font-bold">
              Gift exchange date <span className="font-normal text-gray-600">(optional)</span>
              <input name="exchangeDate" type="date" className="input-christmas mt-1 font-normal" />
            </label>
          </div>
          <label className="block font-bold">
            Note for everyone <span className="font-normal text-gray-600">(optional)</span>
            <textarea name="note" rows={2} maxLength={500} className="input-christmas mt-1 font-normal" placeholder="No gift cards. Wrap it!" />
          </label>
          <button type="submit" className="btn-christmas w-full text-lg">
            🎅 Start the party
          </button>
        </form>
      </section>
    </Shell>
  );
}
