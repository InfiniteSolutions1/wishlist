import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { runDraw } from "@/app/actions/draw";
import { addExclusion, deleteParty, removeExclusion, removeMember, resetInviteCode, updateParty } from "@/app/actions/party";
import { Avatar } from "@/components/Avatar";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";
import { InDrawCheckbox } from "@/components/InDrawCheckbox";
import { Notice } from "@/components/Notice";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { drawChanges, drawHealth } from "@/lib/draw-state";
import { isUuid } from "@/lib/notice";
import { createServerClient } from "@/lib/supabase/server";
import type { Party, Profile } from "@/lib/types";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> };

export default async function ManagePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { notice } = await searchParams;
  if (!isUuid(id)) notFound();
  const user = await requireUser(`/party/${id}/manage`);

  const supabase = await createServerClient();
  const { data: party } = await supabase
    .from("parties")
    .select("id, name, owner_id, budget, exchange_date, note, drawn_at, pairs_changed_at")
    .eq("id", id)
    .maybeSingle<Party>();
  if (!party) notFound();
  if (party.owner_id !== user.id) redirect(`/party/${id}`);

  const [{ data: memberRows }, { data: pairRows }, { data: participantRows }, { data: statusRows }, { data: code }] =
    await Promise.all([
      supabase.from("party_members").select("user_id, in_draw").eq("party_id", id),
      supabase.from("exclusions").select("user_a, user_b").eq("party_id", id),
      supabase.from("draw_participants").select("user_id").eq("party_id", id),
      supabase.rpc("draw_status", { p: id }),
      supabase.rpc("party_invite_code", { p: id }),
    ]);

  const members = (memberRows ?? []) as { user_id: string; in_draw: boolean }[];
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path, google_avatar_url")
    .in("id", members.map((m) => m.user_id));
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));
  const people = members
    .map((m) => ({ ...m, profile: profiles.get(m.user_id) }))
    .filter((m): m is typeof m & { profile: Profile } => Boolean(m.profile))
    .sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name));

  const pairs = (pairRows ?? []) as { user_a: string; user_b: string }[];
  const participants = new Set((participantRows ?? []).map((p) => p.user_id as string));
  const status = (statusRows as { participants: number; matches: number }[] | null)?.[0] ?? { participants: 0, matches: 0 };
  const health = drawHealth(status);
  const inDrawCount = people.filter((p) => p.in_draw).length;
  const changes = party.drawn_at
    ? drawChanges(people.map((p) => ({ id: p.user_id, inDraw: p.in_draw })), participants)
    : { waiting: [], tickedOut: [] };
  const names = (ids: string[]) => ids.map((personId) => profiles.get(personId)?.display_name ?? "Someone").join(", ");

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const inviteLink = code ? `${protocol}://${host}/join/${code}` : "";

  return (
    <Shell>
      <Notice message={notice} />
      <p>
        <Link href={`/party/${id}`} className="link">
          ← Back to {party.name}
        </Link>
      </p>
      <h1 className="christmas-font mt-2 text-5xl font-bold text-santa">Manage party</h1>

      <section className="mt-8" aria-labelledby="invite-heading">
        <h2 id="invite-heading" className="text-2xl font-bold">
          1. Invite people
        </h2>
        <p className="mt-1 text-gray-700">Send this link to everyone. They open it, continue with Google, tap Join, and they're in.</p>
        <p className="mt-3 rounded-lg border-2 border-gray-200 bg-gray-50 p-3 font-mono text-sm break-all">{inviteLink}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton value={inviteLink} />
          <form action={resetInviteCode}>
            <input type="hidden" name="partyId" value={id} />
            <ConfirmButton question="Make a new link? The old one will stop working." className="btn-quiet">
              Reset link
            </ConfirmButton>
          </form>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="who-heading">
        <h2 id="who-heading" className="text-2xl font-bold">
          2. Who's in ({inDrawCount} of {people.length})
        </h2>
        <p className="mt-1 text-gray-700">Untick anyone who isn't taking part in the gift exchange.</p>
        <ul className="mt-3 space-y-2">
          {people.map((person) => (
            <li key={person.user_id} className="flex items-center gap-3 rounded-lg border-2 border-gray-200 bg-white p-3">
              <InDrawCheckbox partyId={id} userId={person.user_id} checked={person.in_draw} name={person.profile.display_name} />
              <Avatar person={person.profile} size="sm" />
              <span className="min-w-0 flex-1 truncate font-bold">
                {person.profile.display_name}
                {person.user_id === user.id ? " (you)" : ""}
              </span>
              {person.user_id !== user.id ? (
                <form action={removeMember}>
                  <input type="hidden" name="partyId" value={id} />
                  <input type="hidden" name="userId" value={person.user_id} />
                  <ConfirmButton
                    question={`Remove ${person.profile.display_name} from the party? They can rejoin with the invite link unless you reset it. If names are drawn you will need to redraw.`}
                    className="btn-quiet btn-danger"
                  >
                    Remove
                  </ConfirmButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="apart-heading">
        <h2 id="apart-heading" className="text-2xl font-bold">
          3. Keep apart <span className="text-base font-normal text-gray-600">(optional)</span>
        </h2>
        <p className="mt-1 text-gray-700">Couples or housemates who shouldn't draw each other.</p>
        {pairs.length ? (
          <ul className="mt-3 space-y-2">
            {pairs.map((pair) => (
              <li key={`${pair.user_a}-${pair.user_b}`} className="flex items-center justify-between gap-3 rounded-lg border-2 border-gray-200 bg-white p-3">
                <span className="min-w-0 font-bold break-words">
                  {profiles.get(pair.user_a)?.display_name ?? "Someone"} ↔ {profiles.get(pair.user_b)?.display_name ?? "Someone"}
                </span>
                <form action={removeExclusion}>
                  <input type="hidden" name="partyId" value={id} />
                  <input type="hidden" name="userA" value={pair.user_a} />
                  <input type="hidden" name="userB" value={pair.user_b} />
                  <button type="submit" className="btn-quiet">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        {people.length >= 2 ? (
          <form action={addExclusion} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="partyId" value={id} />
            {(["userA", "userB"] as const).map((field, index) => (
              <select key={field} name={field} required defaultValue="" className="input-christmas" aria-label={index === 0 ? "First person" : "Second person"}>
                <option value="" disabled>
                  Pick a person
                </option>
                {people.map((person) => (
                  <option key={person.user_id} value={person.user_id}>
                    {person.profile.display_name}
                  </option>
                ))}
              </select>
            ))}
            <button type="submit" className="btn-quiet">
              Add pair
            </button>
          </form>
        ) : null}
      </section>

      <section className="mt-10 rounded-lg border-2 border-pine/40 bg-green-50 p-5" aria-labelledby="draw-heading">
        <h2 id="draw-heading" className="text-2xl font-bold text-green-900">
          4. Draw names
        </h2>
        {party.drawn_at ? (
          <p className="mt-2 font-semibold">
            Names drawn on {new Date(party.drawn_at).toLocaleDateString("en", { day: "numeric", month: "long" })} for{" "}
            {status.participants} people.
          </p>
        ) : (
          <p className="mt-2">Everyone gets one person to buy for. Nobody, including you, can see anyone else's match.</p>
        )}
        <ul className="mt-2 space-y-1 font-semibold text-amber-900">
          {health === "incomplete" ? <li>⚠️ The draw is no longer complete. Redraw so everyone has a match.</li> : null}
          {party.drawn_at && party.pairs_changed_at ? <li>⚠️ Keep-apart pairs changed. Redraw to apply.</li> : null}
          {changes.waiting.length ? <li>Not in this draw: {names(changes.waiting)}. Redraw to include them.</li> : null}
          {changes.tickedOut.length ? (
            <li>⚠️ Unticked but still in the current draw: {names(changes.tickedOut)}. Redraw to apply.</li>
          ) : null}
          {inDrawCount < 5 ? <li className="font-normal text-gray-700">With few people or many couples, matches are easier to guess.</li> : null}
        </ul>
        <form action={runDraw} className="mt-4">
          <input type="hidden" name="partyId" value={id} />
          {party.drawn_at ? (
            <ConfirmButton question="Everyone will get a new match. Redraw?" className="btn-christmas w-full text-lg">
              🎲 Redraw
            </ConfirmButton>
          ) : (
            <button type="submit" className="btn-christmas w-full text-lg">
              🎲 Draw names
            </button>
          )}
        </form>
      </section>

      <section className="mt-10" aria-labelledby="details-heading">
        <h2 id="details-heading" className="text-2xl font-bold">
          Party details
        </h2>
        <form action={updateParty} className="mt-4 space-y-4">
          <input type="hidden" name="partyId" value={id} />
          <label className="block font-bold">
            Party name
            <input name="name" required maxLength={80} defaultValue={party.name} className="input-christmas mt-1 font-normal" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block font-bold">
              Budget
              <input name="budget" maxLength={80} defaultValue={party.budget ?? ""} className="input-christmas mt-1 font-normal" />
            </label>
            <label className="block font-bold">
              Gift exchange date
              <input name="exchangeDate" type="date" defaultValue={party.exchange_date ?? ""} className="input-christmas mt-1 font-normal" />
            </label>
          </div>
          <label className="block font-bold">
            Note for everyone
            <textarea name="note" rows={2} maxLength={500} defaultValue={party.note ?? ""} className="input-christmas mt-1 font-normal" />
          </label>
          <button type="submit" className="btn-quiet">
            Save details
          </button>
        </form>
      </section>

      <section className="mt-10 border-t-2 border-gray-200 pt-6">
        <form action={deleteParty}>
          <input type="hidden" name="partyId" value={id} />
          <ConfirmButton question={`Delete ${party.name} for everyone? This removes all matches and can't be undone.`} className="btn-quiet btn-danger">
            Delete party
          </ConfirmButton>
        </form>
      </section>
    </Shell>
  );
}
