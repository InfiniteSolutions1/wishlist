import Link from "next/link";
import { notFound } from "next/navigation";
import { leaveParty } from "@/app/actions/party";
import { Avatar } from "@/components/Avatar";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Notice } from "@/components/Notice";
import { RevealCard } from "@/components/RevealCard";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { revealState } from "@/lib/draw-state";
import { isUuid } from "@/lib/notice";
import { createServerClient } from "@/lib/supabase/server";
import type { Party, Profile } from "@/lib/types";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> };

const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" });

export default async function PartyPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { notice } = await searchParams;
  if (!isUuid(id)) notFound();
  const user = await requireUser(`/party/${id}`);

  const supabase = await createServerClient();
  const { data: party } = await supabase
    .from("parties")
    .select("id, name, owner_id, budget, exchange_date, note, drawn_at, pairs_changed_at")
    .eq("id", id)
    .maybeSingle<Party>();
  if (!party) notFound();

  const [{ data: memberRows }, { data: participant }, { data: match }] = await Promise.all([
    supabase.from("party_members").select("user_id").eq("party_id", id),
    supabase.from("draw_participants").select("user_id").eq("party_id", id).eq("user_id", user.id).maybeSingle(),
    // The database only ever returns the signed-in person's own match.
    supabase.from("assignments").select("receiver_id").eq("party_id", id).eq("giver_id", user.id).maybeSingle(),
  ]);

  const memberIds = (memberRows ?? []).map((m) => m.user_id as string);
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path, google_avatar_url")
    .in("id", memberIds.length ? memberIds : [user.id]);
  const people = ((profileRows ?? []) as Profile[]).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const receiver = people.find((person) => person.id === match?.receiver_id);

  const state = revealState({ drawnAt: party.drawn_at, isParticipant: Boolean(participant), hasMatch: Boolean(receiver) });
  const isOwner = party.owner_id === user.id;
  const details = [party.budget ? `Budget ${party.budget}` : null, party.exchange_date ? formatDate(party.exchange_date) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Shell>
      <Notice message={notice} />
      <h1 className="christmas-font text-5xl font-bold break-words text-santa">{party.name}</h1>
      {details ? <p className="mt-2 font-semibold text-gray-700">{details}</p> : null}
      {party.note ? <p className="mt-1 whitespace-pre-line break-words text-gray-700">“{party.note}”</p> : null}

      <section className="mt-6 rounded-lg border-2 border-pine/40 bg-green-50 p-5" aria-labelledby="match-heading">
        <h2 id="match-heading" className="text-xl font-bold text-green-900">
          You are buying for
        </h2>
        <div className="mt-3">
          {state === "ok" && receiver ? (
            <RevealCard>
              <div className="flex flex-col items-center gap-3 text-center">
                <Avatar person={receiver} size="lg" />
                <p className="christmas-font text-4xl font-bold break-words text-santa">{receiver.display_name}</p>
                <Link href={`/people/${receiver.id}`} className="btn-christmas">
                  See {receiver.display_name}'s wishlist
                </Link>
              </div>
            </RevealCard>
          ) : null}
          {state === "none" ? <p className="text-lg">Names haven't been drawn yet.</p> : null}
          {state === "not-in-draw" ? <p className="text-lg">You're not in this draw yet — ask your organizer.</p> : null}
          {state === "match-left" ? (
            <p className="text-lg">Your match has left — your organizer needs to redraw.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="everyone-heading">
        <h2 id="everyone-heading" className="text-2xl font-bold">
          Everyone ({people.length})
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {people.map((person) => (
            <li key={person.id}>
              <Link
                href={`/people/${person.id}`}
                className="flex items-center gap-3 rounded-lg border-2 border-gray-200 bg-white p-3 hover:border-santa"
              >
                <Avatar person={person} />
                <span className="min-w-0">
                  <span className="block truncate font-bold">
                    {person.display_name}
                    {person.id === user.id ? " (you)" : ""}
                  </span>
                  <span className="text-sm text-gray-600">
                    {person.id === party.owner_id ? "Organizer · " : ""}See wishlist
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 flex flex-wrap gap-3 border-t-2 border-gray-200 pt-6">
        <Link href="/me" className="btn-quiet">
          Edit my wishlist
        </Link>
        {isOwner ? (
          <Link href={`/party/${party.id}/manage`} className="btn-christmas">
            Manage party
          </Link>
        ) : (
          <form action={leaveParty}>
            <input type="hidden" name="partyId" value={party.id} />
            <ConfirmButton question={`Leave ${party.name}? If names are drawn, your organizer will need to redraw.`} className="btn-quiet btn-danger">
              Leave party
            </ConfirmButton>
          </form>
        )}
      </div>
    </Shell>
  );
}
