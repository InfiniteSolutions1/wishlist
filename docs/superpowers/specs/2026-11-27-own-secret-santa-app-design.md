# Own Secret Santa app — design

Date: 2026-11-27. Status: draft, awaiting approval. Replaces the earlier design that built on the Wishlist app (see git history).

## Intent

The owner wants their own Secret Santa app, built from scratch, not an adaptation of someone else's. People join with a Google account in one tap, have a profile picture, list what they want with links to the actual products, and the organizer presses one button to randomly decide who buys for whom. Each person sees only their own match.

## Goals

1. Sign in with Google only. Joining a party is by an invite link the organizer shares.
2. Profile picture: taken from Google by default, replaceable by upload.
3. A wishlist per person; each wish has a title and optionally a product link, a price and a note.
4. A "Compare prices" link on every wish that opens a shopping search for that item.
5. The organizer draws names with one button; couples the organizer marks are never matched to each other.
6. Each person sees only their own match, with that person's picture and wishlist. Nobody else can read the matches through the app, including the organizer.
7. Runs on Vercel with Supabase, both of which the owner already has.

## Non-goals (first version)

- Typed-in names without accounts. Password or email sign-in. Other sign-in providers.
- Reading the title, picture or price automatically from a pasted link.
- Showing live cheapest prices inside the app (needs a paid service).
- Marking gifts as bought, reminders, emails, anonymous messages.
- Languages other than English.

## Anti-goals

- A match readable by anyone but the giver: through the database's public API, a page's data, or a log.
- Anyone drawing themselves, or a couple drawing each other.
- A stranger with a Google account seeing names, pictures or wishlists without an invite.

## Approaches considered

1. **New app on Vercel + Supabase (chosen).** Next.js on Vercel for the pages; Supabase for the database, Google sign-in and picture storage. Fits the accounts the owner has, nothing needs a disk, free plans cover a family-sized group.
2. **Extend the existing Wishlist app in this repo.** Rejected by the owner: it is someone else's app, and it cannot run on Vercel or Netlify without replacing its storage.
3. **Start from richard1912/SecretSanta.** Rejected: no accounts, wishlists, pictures or couples; the organizer can read every match; it also needs a disk. Its festive look and "share a link" simplicity are borrowed as ideas only; no code is copied.

Netlify would work equally well in place of Vercel; Vercel is picked because its Next.js support needs no extra setup. (My call.)

## Design

### Parts

- **Web app:** Next.js (App Router, TypeScript, Tailwind) on Vercel.
- **Supabase:** Postgres with row-level security, Auth with the Google provider, one Storage bucket `avatars`.
- The Supabase service key exists only in Vercel's server-side settings and is used only by the draw and the join step.

### Screens

```
/                 Signed out: what this is + [Continue with Google]
                  Signed in: my parties, [Start a party]
/join/CODE        Party name, organizer, [Continue with Google] -> joins -> party page
/party/ID         You are buying for  [ Tap to reveal ]
                     (picture) Sam Rivera   [ See Sam's wishlist ]
                     Budget $25 · 20 Dec · "Wrap it!"
                  Everyone (pictures + names, each links to their wishlist)
                  Organizer only: [Manage party]
/party/ID/manage  Details, invite link [Copy] [Reset link],
                  Who's in (checkboxes, [remove]), Keep apart (pairs),
                  [Draw names] / [Redraw]
/me               My picture [Change], my name, my wishlist (add, edit, reorder, delete)
/people/ID        Someone's wishlist: title, price, note, [Open link], [Compare prices]
```

Festive look: red, green and cream with a light snowfall that respects "reduce motion". Phone first.

### Data

- `profiles`: `id` (the auth user), `display_name`, `avatar_path` (uploaded) , `google_avatar_url`, `created_at`.
- `parties`: `id`, `name`, `owner_id`, `budget` (free text), `exchange_date`, `note`, `invite_code` (random, unique), `drawn_at`.
- `party_members`: `party_id`, `user_id`, `in_draw` (default true), `joined_at`. One row per person per party.
- `exclusions`: `party_id`, `user_a`, `user_b`, stored with `user_a < user_b`, unique.
- `wishes`: `id`, `user_id`, `title`, `url`, `price` (free text), `note`, `position`, `created_at`.
- `assignments`: `party_id`, `giver_id`, `receiver_id`; unique on (`party_id`, `giver_id`) and (`party_id`, `receiver_id`).

A person has one wishlist, shown in every party they are in. A person can be in several parties. (My calls.)

### Who can read and change what (row-level security)

- `profiles`, `wishes`: readable by the owner of the row and by anyone who shares a party with them; writable only by the owner of the row.
- `parties`, `party_members`, `exclusions`: readable by members of that party (`invite_code` and `exclusions` by the organizer only); party details, `in_draw`, removing members and exclusions writable only by the organizer.
- `assignments`: readable only where `giver_id` is the signed-in user. No insert, update or delete for any signed-in user; only the server writes them.
- Joining and drawing go through server actions that check the caller and then use the service key.
- Storage `avatars`: public bucket, files stored as `{user id}/{random name}` so addresses cannot be guessed; a person can write and delete only under their own id; images only, 5 MB limit. Replacing or removing a picture deletes the old file. Accepted limit: someone who already has a picture's address can open it without signing in until it is replaced. (My call.)

### Joining

The organizer copies the invite link from Manage party and shares it however they like. Opening `/join/CODE` signed out shows the party name and the Google button; after Google the person returns to the same link and is added. A wrong or reset code shows "This invite link is no longer valid." Joining after the draw is allowed: the person sees "You're not in this draw yet" and the organizer sees them under "Not in this draw" with Redraw offered.

Anyone can create a Google sign-in, but without an invite they are in no party and row-level security shows them nothing. Anyone signed in can start their own party.

### The randomizer

A pure TypeScript function: `drawNames(ids, excludedPairs, randomInt)`.

- Shuffle the receivers (Fisher–Yates, Node `crypto.randomInt`) and accept the result only if nobody has themselves and no excluded pair is matched in either direction. Retry up to 1000 times, then an exhaustive backtracking search over a shuffled order; if nothing is valid, refuse with "These rules leave no possible draw — remove a pair or add people."
- Two people drawing each other is allowed: it keeps the number of possible outcomes high, which is what makes matches hard to guess. (My call; it replaces the single-loop idea.)
- Minimum three people.
- Honest limit: in a very small group, or one made mostly of couples, people can work out other matches from their own. Manage party shows "With few people or many couples, matches are easier to guess" when fewer than five people are in the draw. Nothing is blocked.

The server action checks the caller is the organizer, loads members with `in_draw` and the exclusions, runs the function, and replaces the party's assignments and sets `drawn_at` in one database transaction (a Postgres function called with the service key). Redraw asks "Everyone will get a new match. Redraw?".

### Changes after the draw

- Removing a member deletes assignments where they give or receive. The organizer sees "The draw is no longer complete" and Redraw. A giver whose match has gone sees "Your match has left — your organizer needs to redraw."
- Changing pairs after a draw shows "Redraw to apply".

### Leaving and deleting

- "Leave party" on the party page: same effect as the organizer removing that person. The organizer cannot leave; they delete the party.
- "Delete party" in Manage party, behind a confirmation: removes the party, its members, pairs and matches.
- "Delete my account" on `/me`, behind a confirmation: removes the person's profile, wishes, memberships, matches, picture file and sign-in. Parties they organize are deleted too, and the confirmation says so.

### Pictures

On first sign-in the Google picture address is saved. Uploading replaces it; "Remove" goes back to the Google picture, or to initials if there is none.

### Compare prices

`comparePricesUrl(title)`: trims, cuts to 150 characters, opens a Google Shopping search for it in a new tab. Shown on every wish.

## Constraints and owner setup

- Google sign-in needs a Google Cloud "OAuth client" whose ID and secret are pasted into Supabase (Auth → Providers → Google). Only the owner can create this; the README gives the clicks. Google's sign-in screen will name the Supabase address unless a custom domain is added later.
- A Supabase project is needed. See open question 1.
- The code needs a GitHub repository connected to Vercel. See open question 2.

## Testing

- Randomizer: unit tests over many runs (no self-match, everyone gives once and receives once, couples apart, impossible rules refused, fewer than three refused).
- Security: tests that sign in as two different test users against the development database and prove user B cannot read user A's assignment, a non-member cannot read a party's profiles or wishes, and no signed-in user can write assignments.
- A browser test of the main path: organizer creates a party, three people join by link, draw, each sees a different match.

## Left to the builder

- Component breakdown, wording and styling within the look described.
- Exact library versions (current stable Next.js, `@supabase/ssr`); follow current Supabase and Vercel documentation.
- How test users sign in during tests (Google cannot be automated).
- Client-side image shrinking before upload.

## Open questions for the owner

1. Supabase: create a new project just for this app (recommended; may add a monthly charge on a paid plan), or put it inside an existing project?
2. GitHub: a new empty repository for the app (recommended; the owner creates it), or build it on a branch of `wishlist`?
