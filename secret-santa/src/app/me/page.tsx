import { deleteAccount, removeAvatar, updateName } from "@/app/actions/profile";
import { addWish, deleteWish, moveWish, updateWish } from "@/app/actions/wishes";
import { Avatar } from "@/components/Avatar";
import { AvatarUploader } from "@/components/AvatarUploader";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Notice } from "@/components/Notice";
import { Shell } from "@/components/Shell";
import { WishCard } from "@/components/WishCard";
import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import type { Profile, Wish } from "@/lib/types";

export default async function MePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const user = await requireUser("/me");
  const supabase = await createServerClient();

  const [{ data: profile }, { data: wishRows }, { data: owned }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_path, google_avatar_url").eq("id", user.id).single<Profile>(),
    supabase
      .from("wishes")
      .select("id, user_id, title, url, price, note, position")
      .eq("user_id", user.id)
      .order("position")
      .order("created_at"),
    supabase.from("parties").select("name").eq("owner_id", user.id),
  ]);
  if (!profile) return null;
  const wishes = (wishRows ?? []) as Wish[];
  const ownedNames = (owned ?? []).map((party) => party.name as string);

  return (
    <Shell>
      <Notice message={notice} />
      <h1 className="christmas-font text-5xl font-bold text-santa">My wishlist</h1>

      <section className="mt-6 flex flex-wrap items-center gap-5" aria-label="My profile">
        <Avatar person={profile} size="lg" />
        <div className="min-w-0 flex-1 space-y-3">
          <form action={updateName} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 font-bold">
              My name
              <input name="name" required maxLength={60} defaultValue={profile.display_name} className="input-christmas mt-1 font-normal" />
            </label>
            <button type="submit" className="btn-quiet">
              Save
            </button>
          </form>
          <div className="flex flex-wrap items-start gap-2">
            <AvatarUploader userId={user.id} />
            {profile.avatar_path ? (
              <form action={removeAvatar}>
                <button type="submit" className="btn-quiet">
                  Remove picture
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="wishes-heading">
        <h2 id="wishes-heading" className="text-2xl font-bold">
          What I'd love ({wishes.length})
        </h2>
        <p className="mt-1 text-gray-700">Everyone in your parties can see this list.</p>

        <ul className="mt-4 space-y-3">
          {wishes.map((wish, index) => (
            <WishCard key={wish.id} wish={wish}>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
                <form action={moveWish}>
                  <input type="hidden" name="wishId" value={wish.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" className="btn-quiet" disabled={index === 0} aria-label={`Move ${wish.title} up`}>
                    ↑
                  </button>
                </form>
                <form action={moveWish}>
                  <input type="hidden" name="wishId" value={wish.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button type="submit" className="btn-quiet" disabled={index === wishes.length - 1} aria-label={`Move ${wish.title} down`}>
                    ↓
                  </button>
                </form>
                <form action={deleteWish}>
                  <input type="hidden" name="wishId" value={wish.id} />
                  <ConfirmButton question={`Delete "${wish.title}"?`} className="btn-quiet btn-danger">
                    Delete
                  </ConfirmButton>
                </form>
              </div>
              <details className="mt-3">
                <summary className="link cursor-pointer">Edit</summary>
                <form action={updateWish} className="mt-3 space-y-3">
                  <input type="hidden" name="wishId" value={wish.id} />
                  <WishFields wish={wish} />
                  <button type="submit" className="btn-quiet">
                    Save wish
                  </button>
                </form>
              </details>
            </WishCard>
          ))}
        </ul>

        <form action={addWish} className="mt-6 space-y-3 rounded-lg border-2 border-santa/40 bg-red-50 p-4">
          <h3 className="text-xl font-bold">Add a wish</h3>
          <WishFields />
          <button type="submit" className="btn-christmas w-full">
            🎁 Add to my wishlist
          </button>
        </form>
      </section>

      <section className="mt-12 border-t-2 border-gray-200 pt-6" aria-labelledby="delete-heading">
        <h2 id="delete-heading" className="text-xl font-bold">
          Delete my account
        </h2>
        <p className="mt-1 text-gray-700">
          This removes your name, picture, wishlist and matches for good.
          {ownedNames.length ? ` Parties you organize will be deleted for everyone: ${ownedNames.join(", ")}.` : ""}
        </p>
        <form action={deleteAccount} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="font-bold">
            Type DELETE to confirm
            <input name="confirm" autoComplete="off" className="input-christmas mt-1 font-normal" />
          </label>
          <ConfirmButton question="Delete your account and everything in it? This can't be undone." className="btn-quiet btn-danger">
            Delete my account
          </ConfirmButton>
        </form>
      </section>
    </Shell>
  );
}

function WishFields({ wish }: { wish?: Wish }) {
  return (
    <>
      <label className="block font-bold">
        What is it?
        <input name="title" required maxLength={150} defaultValue={wish?.title} className="input-christmas mt-1 font-normal" placeholder="Cosy wool socks, size M" />
      </label>
      <label className="block font-bold">
        Link to it <span className="font-normal text-gray-600">(optional)</span>
        <input name="url" inputMode="url" maxLength={2000} defaultValue={wish?.url ?? ""} className="input-christmas mt-1 font-normal" placeholder="https://…" />
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <label className="block font-bold">
          Price <span className="font-normal text-gray-600">(optional)</span>
          <input name="price" maxLength={40} defaultValue={wish?.price ?? ""} className="input-christmas mt-1 font-normal" placeholder="$18" />
        </label>
        <label className="block font-bold">
          Note <span className="font-normal text-gray-600">(optional)</span>
          <input name="note" maxLength={500} defaultValue={wish?.note ?? ""} className="input-christmas mt-1 font-normal" placeholder="Any colour but yellow" />
        </label>
      </div>
    </>
  );
}
