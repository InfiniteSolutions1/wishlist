import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Shell } from "@/components/Shell";
import { WishCard } from "@/components/WishCard";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/notice";
import { createServerClient } from "@/lib/supabase/server";
import type { Profile, Wish } from "@/lib/types";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireUser(`/people/${id}`);

  const supabase = await createServerClient();
  // The database returns a profile only for yourself or someone who shares a party with you.
  const { data: person } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path, google_avatar_url")
    .eq("id", id)
    .maybeSingle<Profile>();
  if (!person) notFound();

  const { data: wishRows } = await supabase
    .from("wishes")
    .select("id, user_id, title, url, price, note, position")
    .eq("user_id", id)
    .order("position")
    .order("created_at");
  const wishes = (wishRows ?? []) as Wish[];
  const isMe = person.id === user.id;

  return (
    <Shell>
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar person={person} size="lg" />
        <h1 className="christmas-font text-5xl font-bold break-words text-santa">
          {isMe ? "My wishlist" : `${person.display_name}'s wishlist`}
        </h1>
      </div>

      {wishes.length === 0 ? (
        <p className="mt-8 text-center text-lg text-gray-700">
          {isMe ? "You haven't added any wishes yet." : `${person.display_name} hasn't added any wishes yet.`}
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {wishes.map((wish) => (
            <WishCard key={wish.id} wish={wish} />
          ))}
        </ul>
      )}

      {isMe ? (
        <p className="mt-8 text-center">
          <Link href="/me" className="btn-christmas">
            Edit my wishlist
          </Link>
        </p>
      ) : null}
    </Shell>
  );
}
