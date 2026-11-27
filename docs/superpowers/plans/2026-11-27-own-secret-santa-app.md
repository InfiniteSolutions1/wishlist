# Own Secret Santa App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Secret Santa web app: Google sign-in, invite links, profile pictures, wishlists with product links, compare-prices links, and a name draw that keeps couples apart and keeps every match private.

**Architecture:** Next.js (App Router) on Vercel renders the pages and runs server actions. Supabase holds the data in Postgres with row-level security, handles Google sign-in, and stores pictures. Matches are written only by the server with the service key and are readable only by the giver.

**Tech Stack:** Next.js (current stable, App Router, TypeScript), Tailwind CSS, `@supabase/supabase-js`, `@supabase/ssr`, Supabase Postgres/Auth/Storage, Vitest, Playwright, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-27-own-secret-santa-app-design.md`

## Global Constraints

- Blocked until the owner answers the spec's two open questions (which Supabase project, which GitHub repository). Do not create a Supabase project, a Vercel project or a repository without that answer.
- Before writing any Supabase code or SQL, load the `supabase:supabase` and `supabase:supabase-postgres-best-practices` skills and follow current documentation; do not rely on memory for `@supabase/ssr` or Next.js APIs.
- `SUPABASE_SERVICE_ROLE_KEY` is read only in `src/lib/supabase/admin.ts`, which starts with `import "server-only"`. It is never prefixed `NEXT_PUBLIC_` and never committed.
- Row-level security is enabled on every table in the same migration that creates it.
- `assignments` has no insert, update or delete policy and one select policy: `giver_id = (select auth.uid())`.
- No page, action, log line or error message includes a `receiver_id` other than the signed-in giver's own.
- Randomness: `crypto.randomInt` only. Minimum three people in a draw.
- English only. Phone-first layout. Snowfall is off under `prefers-reduced-motion`.
- No code is copied from richard1912/SecretSanta or from the Wishlist app.
- Exact user-facing sentences quoted in the spec are used verbatim.

## Review Focus

1. Draw pressed twice or from two tabs → one consistent set of matches (single transaction in `replace_assignments`). Test in Task 6.
2. A signed-in user calling the database API directly, bypassing the pages → cannot read another giver's row, cannot write `assignments`, cannot read a party they are not in. Tests in Task 2.
3. Invite link opened while signed out → after Google the person lands back on the same invite and is joined, not dropped on the home page. Test in Task 4.
4. Wish link that is not `http`/`https` (for example `javascript:`) → rejected on save and never rendered as a link. Test in Task 5.
5. Wish titles with `&`, `#`, `?`, emoji or 300+ characters → compare-prices link correctly encoded, query cut to 150 characters. Test in Task 5.

---

## File map

| Path | Responsibility |
|---|---|
| `supabase/migrations/*.sql` | Tables, policies, functions, storage bucket |
| `src/lib/supabase/{server,browser,admin}.ts` | The three Supabase clients |
| `src/lib/draw.ts` | Pure randomizer |
| `src/lib/compare-prices.ts`, `src/lib/wish-url.ts` | Pure helpers |
| `src/app/actions/{party,draw,wishes,profile}.ts` | Server actions |
| `src/app/(app)/...` | Screens listed in the spec |
| `src/components/` | Avatar, WishCard, RevealCard, Snowfall, ConfirmDialog |
| `tests/unit`, `tests/security`, `tests/e2e` | Vitest unit, Vitest security against the dev database, Playwright |

---

### Task 1: Project skeleton and Google sign-in

**Files:** new Next.js app at the repository root; `src/lib/supabase/{server,browser,admin}.ts`; `src/middleware.ts` (session refresh); `src/app/page.tsx`; `src/app/auth/callback/route.ts`; `.env.example`; `README.md`.

**Interfaces — Produces:**
- `createServerClient(): Promise<SupabaseClient>`, `createBrowserClient(): SupabaseClient`, `createAdminClient(): SupabaseClient` (service key).
- `requireUser(): Promise<{ id: string }>` in `src/lib/auth.ts` — redirects to `/` with `?next=<current path>` when signed out.
- `safeNext(next: string | null): string` — returns `next` only if it starts with a single `/`; otherwise `/`.
- Env names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the current publishable key name per docs), `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`.

- [ ] **Step 1:** Scaffold with `create-next-app` (TypeScript, Tailwind, App Router, `src/`), add Vitest and Playwright, `npm test` runs Vitest.
- [ ] **Step 2: Failing unit test** `tests/unit/safe-next.test.ts`: `/join/abc` → same; `//evil.com`, `https://evil.com`, `null`, `""` → `/`.
- [ ] **Step 3:** Implement `safeNext`, the three clients, middleware, and `auth/callback` (exchange code, redirect to `safeNext(next)`).
- [ ] **Step 4:** Home page: signed out shows the pitch and a `Continue with Google` button calling `signInWithOAuth({ provider: "google", options: { redirectTo: <site>/auth/callback?next=... } })`; signed in shows a placeholder and Sign out.
- [ ] **Step 5:** README "One-time setup": create the Google OAuth client, authorised redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`, paste ID and secret into Supabase Auth → Providers → Google, add the site address and `http://localhost:3000` to Supabase's allowed redirect URLs.
- [ ] **Step 6:** `npm test`, `npm run lint`, `npm run build` pass. Commit `feat: project skeleton with Google sign-in`.

---

### Task 2: Database, policies and security tests

**Files:** `supabase/migrations/0001_schema.sql`, `0002_policies.sql`, `0003_storage.sql`; `tests/security/helpers.ts`; `tests/security/rls.test.ts`.

**Interfaces — Produces (SQL):**
- Tables exactly as in the spec's Data section, all foreign keys `on delete cascade`, `exclusions` with `check (user_a < user_b)`.
- `private.shares_party(other uuid) returns boolean` — security definer, in a schema not exposed by the API.
- `private.is_party_owner(p uuid) returns boolean`, `private.is_party_member(p uuid) returns boolean`.
- `public.handle_new_user()` trigger on `auth.users` insert: creates the `profiles` row from the Google `name`/`full_name` and `avatar_url`/`picture` metadata.
- `public.replace_assignments(p_party uuid, p_pairs jsonb) returns void` — security definer, `revoke execute ... from public, anon, authenticated`; deletes the party's assignments, inserts the pairs, sets `parties.drawn_at = now()`.
- Organizer-only columns: expose `invite_code` through a view or a security-definer function `public.party_invite_code(p uuid)` callable only by the owner; members select from `parties` without it (column privileges).
- Bucket `avatars` (public, 5 MB, `image/*`), object policies: insert/update/delete only when the first path segment equals `auth.uid()`.

**Interfaces — Produces (tests):** `asUser(n: 1 | 2 | 3 | 4): Promise<SupabaseClient>` signs in pre-created email/password test users through the admin client (test users only exist in the development project); `resetData(): Promise<void>`.

- [ ] **Step 1: Failing security tests** (`tests/security/rls.test.ts`, run with `npm run test:security` against the dev database):
  - user 2 selecting `assignments` sees only rows where `giver_id` is user 2; filtering by user 1's id returns `[]`.
  - any user inserting, updating or deleting `assignments` gets an error or zero rows changed.
  - `rpc("replace_assignments", ...)` as a signed-in user fails with a permission error.
  - user 4 (in no party) selecting `profiles`, `wishes`, `parties`, `party_members` of users 1–3 gets `[]`.
  - user 2 (member, not owner) cannot read `invite_code` or `exclusions`, cannot update the party, cannot delete another member.
  - user 2 cannot update user 1's wish or profile.
  - user 2 cannot upload to `avatars/<user 1 id>/x.png`.
- [ ] **Step 2:** Write the migrations; apply to the dev project; run Supabase's security advisors and fix every finding.
- [ ] **Step 3:** `npm run test:security` passes. Commit `feat: schema, row-level security and security tests`.

---

### Task 3: Profile and picture

**Files:** `src/app/(app)/me/page.tsx`; `src/app/actions/profile.ts`; `src/components/Avatar.tsx`; `tests/unit/avatar-url.test.ts`.

**Interfaces — Produces:**
- `avatarUrl(p: { avatar_path: string | null; google_avatar_url: string | null }): string | null` — uploaded picture's public URL, else Google's, else `null` (component shows initials).
- Actions: `updateName(name: string)`, `setAvatar(path: string)`, `removeAvatar()`, `deleteAccount()`.

- [ ] **Step 1: Failing tests** for `avatarUrl` (three cases) and a security test: after `removeAvatar` the old storage object no longer exists.
- [ ] **Step 2:** Implement. Upload happens in the browser to `avatars/{uid}/{crypto.randomUUID()}.{ext}`, then `setAvatar(path)` validates the path starts with the caller's id and deletes the previous file. Names: trimmed, 1–60 characters.
- [ ] **Step 3:** `deleteAccount`: confirmation text names the parties that will be deleted; removes the storage folder, then deletes the auth user with the admin client (cascades do the rest); signs out.
- [ ] **Step 4:** Tests pass. Commit `feat: profile, picture upload and account deletion`.

---

### Task 4: Parties and invite links

**Files:** `src/app/actions/party.ts`; `src/app/(app)/page.tsx` (my parties); `src/app/join/[code]/page.tsx`; `src/app/(app)/party/[id]/page.tsx` (member list only for now); `src/app/(app)/party/[id]/manage/page.tsx` (details, invite link, members, pairs); `tests/security/party.test.ts`; `tests/e2e/join.spec.ts`.

**Interfaces — Produces:**
- `createParty(input: { name: string; budget?: string; exchangeDate?: string; note?: string }): Promise<{ id: string }>` — creator becomes owner and member.
- `updateParty(id, input)`, `deleteParty(id)`, `resetInviteCode(id): Promise<string>`.
- `joinParty(code: string): Promise<{ partyId: string } | { error: "invalid" }>` — uses the admin client after `requireUser`; idempotent.
- `setInDraw(partyId, userId, inDraw: boolean)`, `removeMember(partyId, userId)`, `leaveParty(partyId)` — removal also deletes that party's assignments where the user gives or receives; the owner cannot be removed or leave.
- `addExclusion(partyId, a, b)` (orders the ids; rejects `a === b` and non-members), `removeExclusion(partyId, a, b)`.
- Invite codes: 16 characters from `crypto.randomBytes`, URL-safe.

- [ ] **Step 1: Failing tests**
  - security: `joinParty` with a wrong code returns `invalid` and adds no row; joining twice leaves one row; after `resetInviteCode` the old code is `invalid`; a non-owner calling `updateParty`, `removeMember`, `addExclusion`, `deleteParty`, `resetInviteCode` is refused; `addExclusion(a, a)` refused; `(b, a)` after `(a, b)` leaves one row; owner cannot `leaveParty`.
  - e2e: signed-out visit to `/join/CODE` shows the party name and Google button, and the sign-in link carries `next=/join/CODE`; a signed-in test user visiting it lands on `/party/ID` as a member; a bad code shows `This invite link is no longer valid.`
- [ ] **Step 2:** Implement actions and screens. `/join/[code]` reads the party name and organizer through the admin client by code only.
- [ ] **Step 3:** Tests pass. Commit `feat: parties, invite links, members and keep-apart pairs`.

---

### Task 5: Wishlists and compare prices

**Files:** `src/lib/compare-prices.ts`; `src/lib/wish-url.ts`; `src/app/actions/wishes.ts`; wishlist section of `/me`; `src/app/(app)/people/[id]/page.tsx`; `src/components/WishCard.tsx`; `tests/unit/compare-prices.test.ts`; `tests/unit/wish-url.test.ts`.

**Interfaces — Produces:**
- `comparePricesUrl(title: string): string | null` — trim, collapse whitespace, cut to 150 characters, `null` if empty, else `https://www.google.com/search?udm=28&q=` + `encodeURIComponent(q)`. Confirm `udm=28` still opens Shopping; otherwise use the current Shopping search URL and update the test.
- `normalizeWishUrl(input: string): string | null` — accepts only `http:`/`https:`; adds `https://` to a bare domain; anything else `null`.
- Actions: `addWish({ title, url?, price?, note? })`, `updateWish(id, ...)`, `deleteWish(id)`, `moveWish(id, direction: "up" | "down")`. Limits: title 1–150, price 40, note 500, url 2000 characters; 100 wishes per person.

- [ ] **Step 1: Failing unit tests**
  - `comparePricesUrl("LEGO Star Wars & Friends #75192?")` → `q` decodes to the same string; emoji round-trips; 400 characters → decoded length 150; `"   "` → `null`.
  - `normalizeWishUrl`: `https://a.com/x` kept; `a.com/x` → `https://a.com/x`; `javascript:alert(1)`, `data:text/html,x`, `ftp://a.com`, `""` → `null`.
- [ ] **Step 2:** Implement helpers, actions and screens. `WishCard` shows title, price, note, `Open link` (only when the stored URL passes `normalizeWishUrl`) and `Compare prices`; both links use `target="_blank" rel="noopener noreferrer"`.
- [ ] **Step 3:** `/people/[id]` returns "not found" when row-level security yields no profile.
- [ ] **Step 4:** Tests pass. Commit `feat: wishlists with product links and compare prices`.

---

### Task 6: The draw

**Files:** `src/lib/draw.ts`; `src/app/actions/draw.ts`; draw section of Manage party; `tests/unit/draw.test.ts`; `tests/security/draw.test.ts`.

**Interfaces — Produces:**
```ts
export type Pair = { giverId: string; receiverId: string };
export class DrawError extends Error { code: "TOO_FEW" | "IMPOSSIBLE" }
export function drawNames(
  ids: string[],
  excluded: [string, string][] = [],
  randomInt: (max: number) => number = crypto.randomInt
): Pair[];

// src/app/actions/draw.ts
export async function runDraw(partyId: string): Promise<{ ok: true; count: number } | { ok: false; message: string }>;
```

- [ ] **Step 1: Failing unit tests**
  - sizes 3, 4, 7, 20 × 200 runs: givers and receivers are each a permutation of `ids`; no `giverId === receiverId`.
  - ids `a..f`, excluded `[["a","b"],["c","d"]]`, 500 runs: none of `a→b`, `b→a`, `c→d`, `d→c`.
  - `a,b,c,d` with both couples excluded returns 4 pairs, and over 2000 runs all 4 possible outcomes occur.
  - `[]`, `["a"]`, `["a","b"]` → `TOO_FEW`; `["a","a","b","c"]` → 3 pairs.
  - `a,b,c` with `[["a","b"]]` → `IMPOSSIBLE`.
  - fixed `randomInt` gives identical results twice.
- [ ] **Step 2:** Implement `drawNames` as the spec describes (rejection sampling up to 1000 shuffles, then backtracking).
- [ ] **Step 3: Failing security tests**
  - `runDraw` by a non-owner → refused, no rows.
  - `runDraw` with 2 people in the draw → message `You need at least 3 people to draw names.`
  - two `runDraw` calls in parallel → assignment count equals the number of people in the draw, and givers and receivers are each a permutation.
  - after a draw, each test user reads exactly one row; the owner reads exactly one row.
  - a failed draw (`IMPOSSIBLE`) leaves the previous matches untouched.
  - `removeMember` after a draw deletes that person's two rows.
- [ ] **Step 4:** Implement `runDraw`: `requireUser`, verify ownership with the user's own client, load `in_draw` members and exclusions, `drawNames`, `admin.rpc("replace_assignments", ...)`. Never log pairs.
- [ ] **Step 5:** Manage party: `Draw names` / `Redraw` (confirm `Everyone will get a new match. Redraw?`), status "Names drawn on <date> for N people", "Not in this draw" list, `The draw is no longer complete` when the number of matches differs from the people in the draw, `Redraw to apply` when pairs changed after `drawn_at`, and `With few people or many couples, matches are easier to guess` when fewer than five are in the draw.
- [ ] **Step 6:** Tests pass. Commit `feat: name draw with couples kept apart`.

---

### Task 7: Reveal and festive look

**Files:** `src/components/RevealCard.tsx`, `Snowfall.tsx`; `src/app/(app)/party/[id]/page.tsx`; theme tokens in `src/app/globals.css`; `tests/e2e/secret-santa.spec.ts`.

**Interfaces — Consumes:** the user's own client: `assignments` select returns at most one row for this party.

- [ ] **Step 1: Failing e2e test** (four test users, owner draws): each user's party page hides the name until `Tap to reveal`; the four revealed names are all different and none is the viewer; the page's HTML and network responses for user 2 contain no other user's match id beside a `giver_id`; `See <name>'s wishlist` opens `/people/<id>`.
- [ ] **Step 2:** Implement the four states with the spec's sentences: match shown; `Names haven't been drawn yet.`; `You're not in this draw yet`; `Your match has left — your organizer needs to redraw.` (the user is in the draw, `drawn_at` is set, and they have no row).
- [ ] **Step 3:** Theme: red `#B3202A`, green `#1F6B45`, cream `#FBF6EC`, one display font for headings; snowfall component disabled under reduced motion; check every screen at 375 px wide.
- [ ] **Step 4:** Tests pass. Commit `feat: reveal card and festive theme`.

---

### Task 8: Go live

**Blocked on the owner:** the Google OAuth client (only they can create it) and the two open questions.

- [ ] **Step 1:** Apply migrations to the production Supabase project; run the security advisors; confirm no test users exist there.
- [ ] **Step 2:** Create the Vercel project from the GitHub repository; set the four environment variables; set `NEXT_PUBLIC_SITE_URL` and Supabase's Site URL / redirect list to the production address.
- [ ] **Step 3:** Owner pastes the Google client ID and secret into Supabase.
- [ ] **Step 4: Live check** with two real Google accounts and one more person: invite link → Google → joined with Google picture; upload a picture; add a wish with a link; compare prices opens a shopping search; add a keep-apart pair; draw; each sees one match; a Google account with no invite sees no party.
- [ ] **Step 5:** Commit `docs: setup and go-live notes`.
