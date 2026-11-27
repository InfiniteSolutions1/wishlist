# Secret Santa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Secret Santa name draw (with couples kept apart), invite-plus-Google joining, Google profile pictures and a compare-prices link to the existing Wishlist app.

**Architecture:** A dependency-free randomizer module, a server-only service that owns three new Prisma tables, and two new pages (organizer tab under group admin, member reveal page). Joining reuses the existing OpenID Connect flow and invite tokens; nothing new is added to the sign-in path except carrying the invite through it.

**Tech Stack:** SvelteKit 2, Svelte 5, Prisma on SQLite, Skeleton UI, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-27-secret-santa-design.md`

## Global Constraints

- No new runtime dependencies.
- A match is only ever read on the server with `giverId = signed-in user`. No endpoint, page load, log line, email or event returns another person's pair or the full set, for any role.
- Randomness comes from `node:crypto` `randomInt`, never `Math.random`.
- Minimum three people in a draw.
- All new wording goes in `src/i18n/en.json` only, under a new `secret-santa` section (plus `auth.*` / `wishes.*` keys where noted).
- Groups that never draw must behave exactly as today.
- Run `pnpm lint` and `pnpm check` before every commit; Playwright runs use `--trace off`.
- How to start the app for end-to-end tests: `DEVELOPMENT.md`.

## Review Focus

1. Draw pressed twice, or by two managers at once → exactly one draw exists afterwards (unique `groupId`, one transaction). Test in Task 2.
2. Tampered draw form containing a user id that is not a member of the group → rejected with 400, nothing saved. Test in Task 3.
3. Keep-apart pair entered as the same person twice, or as B–A when A–B exists → rejected / treated as a duplicate. Test in Task 2.
4. Google picture URL that is missing, not an image, or fails to download → sign-in still succeeds with no picture. Test in Task 7.
5. Wish names containing `&`, `#`, `?`, emoji, or 300+ characters → compare-prices link is correctly encoded and the query is cut to 150 characters. Test in Task 8.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/server/secret-santa/draw.ts` (new) | Pure randomizer. Imports only `node:crypto`. |
| `src/lib/server/secret-santa/index.ts` (new) | All database access for draws, pairs and matches. |
| `prisma/schema.prisma`, new migration | Three tables. |
| `src/routes/admin/groups/[groupId]/secret-santa/` (new) | Organizer screen. |
| `src/routes/secret-santa/` (new) | Member reveal screen. |
| `src/lib/server/openid.ts`, `src/routes/login/oidc/callback/+server.ts`, `src/routes/signup/` | Invite carried through Google; picture import. |
| `src/lib/item-util.ts`, `src/lib/components/wishlists/ItemCard/` | Compare-prices link. |
| `tests/unit/`, `tests/ui/secret-santa.spec.ts`, `tests/pageObjects/secret-santa*.page.ts` | Tests. |

---

### Task 1: Randomizer

**Files:**
- Create: `src/lib/server/secret-santa/draw.ts`
- Test: `tests/unit/secret-santa-draw.spec.ts` (import by relative path; uses Playwright's `test`/`expect` with no `page`)

**Interfaces:**
- Produces:
  ```ts
  export type Pair = { giverId: string; receiverId: string };
  export type DrawErrorCode = "TOO_FEW" | "IMPOSSIBLE";
  export class DrawError extends Error { code: DrawErrorCode }
  export function drawNames(
      ids: string[],
      excluded: [string, string][] = [],
      randomInt: (max: number) => number = crypto.randomInt
  ): Pair[];
  ```

- [ ] **Step 1: Write the failing tests**

  - `everyone gives once and receives once, nobody draws themselves`: for sizes 3, 4, 7, 20, 200 runs each; assert givers and receivers are each a permutation of `ids` and `giverId !== receiverId`.
  - `result is a single loop`: following receiver→giver from any id visits all ids.
  - `excluded pairs never draw each other`: ids `a..f`, excluded `[["a","b"],["c","d"]]`, 500 runs; no pair is `a→b`, `b→a`, `c→d`, `d→c`.
  - `two couples can still draw`: ids `a,b,c,d`, excluded `[["a","b"],["c","d"]]` returns 4 pairs.
  - `fewer than three throws TOO_FEW`: `[]`, `["a"]`, `["a","b"]`.
  - `duplicate ids are collapsed`: `["a","a","b","c"]` returns 3 pairs.
  - `impossible rules throw IMPOSSIBLE`: ids `a,b,c`, excluded `[["a","b"]]`.
  - `uses the injected random source`: a fixed `randomInt` gives the same result twice.

- [ ] **Step 2: Run** `pnpm exec playwright test tests/unit/secret-santa-draw.spec.ts --trace off` — expect FAIL, module not found.

- [ ] **Step 3: Implement `drawNames`**

  Dedupe ids; throw `TOO_FEW` under 3. Fisher–Yates shuffle with `randomInt(i + 1)`; pair each id with the next, last with first; accept if no neighbouring pair is excluded in either direction. Retry up to 500 shuffles. If none is accepted, run a backtracking search for a valid loop starting from a shuffled order (fix the first element, extend one valid neighbour at a time, check the closing edge); throw `IMPOSSIBLE` if the search is exhausted.

- [ ] **Step 4: Run the same command** — expect PASS.
- [ ] **Step 5: Commit** `feat: add Secret Santa randomizer`

---

### Task 2: Tables and service

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `pnpm exec prisma migrate dev --name secret_santa`
- Create: `src/lib/server/secret-santa/index.ts`
- Modify: `src/routes/api/groups/[groupId]/users/[userId]/+server.ts` (DELETE handler, beside `deleteLists`)
- Test: `tests/unit/secret-santa-service.spec.ts` if the service can be exercised against a scratch SQLite file; otherwise cover these cases through Task 3's end-to-end tests and say so in the commit.

**Interfaces:**
- Consumes: `drawNames`, `DrawError` from Task 1.
- Produces (schema): `SecretSantaDraw { id, groupId @unique, createdById, createdAt, budget String?, exchangeDate DateTime?, note String? }`, `SecretSantaAssignment { id, drawId, giverId, receiverId, @@unique([drawId, giverId]), @@unique([drawId, receiverId]) }`, `SecretSantaExclusion { id, groupId, userAId, userBId, @@unique([groupId, userAId, userBId]) }`. All relations `onDelete: Cascade`. Table names `secret_santa_draw`, `secret_santa_assignment`, `secret_santa_exclusion`.
- Produces (service):
  ```ts
  type Person = { id: string; name: string; picture: string | null };
  type DrawDetails = { budget?: string | null; exchangeDate?: Date | null; note?: string | null };
  type OrganizerView = {
      draw: (DrawDetails & { createdAt: Date; participantCount: number; complete: boolean }) | null;
      members: (Person & { inDraw: boolean })[];
      exclusions: { id: string; a: Person; b: Person }[];
  };
  type MyMatch =
      | { status: "none" }                 // no draw in this group
      | { status: "not-in-draw" }
      | { status: "match-left" }           // I receive but have no giver row
      | { status: "ok"; receiver: Person; listHref: string; details: DrawDetails };

  getOrganizerView(groupId: string): Promise<OrganizerView>
  runDraw(groupId: string, createdById: string, participantIds: string[], details: DrawDetails): Promise<void>  // throws DrawError, or Error("NOT_MEMBER")
  updateDetails(groupId: string, details: DrawDetails): Promise<void>
  addExclusion(groupId: string, userAId: string, userBId: string): Promise<void>   // throws Error("SAME_PERSON" | "NOT_MEMBER")
  removeExclusion(groupId: string, exclusionId: string): Promise<void>
  removeUserFromDraw(groupId: string, userId: string): Promise<void>
  getMyMatch(groupId: string, userId: string): Promise<MyMatch>
  hasDraw(groupId: string): Promise<boolean>
  ```

- [ ] **Step 1: Add the three models and generate the migration.** Verify `pnpm exec prisma migrate dev` applies cleanly and `pnpm check` passes.

- [ ] **Step 2: Write failing tests** (unit or deferred to Task 3, see Files):
  - `runDraw twice leaves one draw` — call twice in parallel with `Promise.allSettled`; `secretSantaDraw.count({ where: { groupId } }) === 1` and assignment count equals participant count.
  - `runDraw rejects a non-member id` — throws `NOT_MEMBER`, counts stay 0.
  - `runDraw failing with IMPOSSIBLE keeps the previous draw`.
  - `addExclusion(a, a)` throws `SAME_PERSON`; `addExclusion(b, a)` after `(a, b)` leaves one row.
  - `getMyMatch` returns only the caller's receiver; `OrganizerView` contains no `receiverId`/`giverId` key anywhere (`JSON.stringify` check).
  - `removeUserFromDraw` makes `complete` false and the affected giver's status `match-left`.

- [ ] **Step 3: Implement the service.**
  - Members = every `UserGroupMembership` row for the group; ignore `active`.
  - `runDraw`: validate ids ⊆ members, load exclusions, call `drawNames`, then in one `$transaction`: delete the group's existing draw, create the new draw and assignments, and write `claims.showName = false` for the group with `writeConfig({ claims: { showName: false } }, groupId)` (check the exact partial shape `writeConfig` accepts in `src/lib/server/config.ts`; do it outside the transaction if `writeConfig` cannot join one).
  - `addExclusion`: store the pair ordered so `userAId < userBId`.
  - `complete` = every giver is also a receiver and counts match.
  - `listHref`: the receiver's single list in this group → `/lists/{id}`; otherwise `/wishlists/{username}`.
  - Never log ids from assignments.

- [ ] **Step 4: Call `removeUserFromDraw(group.id, params.userId)` in the membership DELETE handler.**
- [ ] **Step 5: Run tests** — expect PASS. `pnpm check` clean.
- [ ] **Step 6: Commit** `feat: add Secret Santa tables and service`

---

### Task 3: Organizer screen

**Files:**
- Create: `src/routes/admin/groups/[groupId]/secret-santa/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/admin/groups/[groupId]/+layout@.svelte` (add `secretSanta` to `tabs`)
- Modify: `src/i18n/en.json`
- Create: `tests/pageObjects/secret-santa-admin.page.ts`
- Test: `tests/ui/secret-santa.spec.ts`

**Interfaces:**
- Consumes: Task 2 service; `requireAccessToGroup` from `src/routes/api/groups/[groupId]/auth.ts` (or `requireAdminOrManager` from `$lib/server/auth`, whichever the sibling `members` page uses).
- Produces: form actions `?/draw` (fields `participant` repeated, `budget`, `exchangeDate`, `note`), `?/details`, `?/addPair` (`userAId`, `userBId`), `?/removePair` (`exclusionId`). `data-testid`s: `ss-draw`, `ss-redraw`, `ss-member-{userId}`, `ss-pair-a`, `ss-pair-b`, `ss-add-pair`, `ss-status`.

- [ ] **Step 1: Write failing end-to-end tests** (create a group with four members using existing fixtures in `tests/fixtures/index.ts`):
  - `manager draws names` — tick all, press Draw; `ss-status` contains `4 people`.
  - `non-manager cannot open or post` — GET returns the app's 401/redirect; a direct POST to `?/draw` changes nothing.
  - `tampered participant id is rejected` — POST `?/draw` with an id from another group → 400, no draw.
  - `two people cannot be drawn` — untick two → error text `at least 3`.
  - `impossible pairs are refused` — three people, one pair → text `These rules leave no possible draw`.
  - `redraw asks for confirmation and replaces the draw`.
  - `page data never contains a pair` — load the page as manager after a draw; the serialized page data and every network response contain no `receiverId` or `giverId`.
  - `drawing turns off claimer names` — after the draw, group settings show "show who claimed" off.

- [ ] **Step 2: Run** `pnpm exec playwright test tests/ui/secret-santa.spec.ts --trace off` — expect FAIL.

- [ ] **Step 3: Implement the load and actions.** Validate with zod as other `+page.server.ts` files do. Map `DrawError.code` and `NOT_MEMBER`/`SAME_PERSON` to `fail(400, { message })`.

- [ ] **Step 4: Implement the page** per the spec's sketch: details fields, member checkboxes with `Avatar`, Keep apart list with two selects and Add pair, Draw button. After a draw: status line, "Not in this draw" list, "The draw is no longer complete" warning when `complete` is false, "Redraw to apply" hint when pairs changed after `createdAt`, Redraw behind the existing confirm modal pattern in `src/lib/components/modals`, and a note that claimer names were hidden. Exact copy:
  - `These rules leave no possible draw — remove a pair or add people.`
  - `You need at least 3 people to draw names.`
  - `Everyone will get a new match. Redraw?`

- [ ] **Step 5: Add the tab.**
- [ ] **Step 6: Run tests** — expect PASS.
- [ ] **Step 7: Commit** `feat: add Secret Santa organizer screen`

---

### Task 4: Member screen

**Files:**
- Create: `src/routes/secret-santa/+page.server.ts`, `+page.svelte`
- Modify: `src/lib/components/navigation/navigation.ts` (add the entry; follow how existing entries are conditionally shown), `src/routes/+page.server.ts` and the home page component (banner), `src/i18n/en.json`
- Create: `tests/pageObjects/secret-santa.page.ts`
- Test: `tests/ui/secret-santa.spec.ts` (extend)

**Interfaces:**
- Consumes: `getMyMatch`, `hasDraw`; the signed-in user's selected group as other pages obtain it (`getActiveMembership` in `src/lib/server/group-membership.ts`).
- Produces: `data-testid`s `ss-reveal`, `ss-receiver-name`, `ss-wishlist-link`, `ss-message`.

- [ ] **Step 1: Write failing tests**
  - `each member sees one match and no two members see the same person` — sign in as each of four members, reveal, collect names; set size is 4 and nobody sees their own name.
  - `match is hidden until tapped` — `ss-receiver-name` not visible before clicking `ss-reveal`.
  - `wishlist link opens the receiver's list`.
  - `a member's responses contain no one else's pair` — record all responses while loading; none contains another member's id next to `giverId`.
  - `late joiner` sees `You're not in this draw — ask your organizer.`
  - `no draw yet` sees `Names haven't been drawn yet.`
  - `match removed from group` sees `Your match has left the group — your organizer needs to redraw.`
  - `banner appears on home only when the selected group has a draw`.

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.** The load returns only the `MyMatch` object. The cover is client-side state that resets on every visit. Budget, date and note render only when set.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: add Secret Santa reveal page`

---

### Task 5: "Names are drawn" email

**Files:**
- Create: `templates/secret-santa.mjml`, `templates/secret-santa.html` (built the same way as `invite.html`)
- Modify: `src/lib/server/email.ts`, the `?/draw` action from Task 3

**Interfaces:**
- Produces: `sendSecretSantaDrawn(to: string, url: string, groupName: string): Promise<void>`

- [ ] **Step 1: Write the failing test** — a unit test that renders the template for a known `url` and asserts the output contains the url and the group name and does not accept a receiver parameter at all (type-level: the function has exactly three parameters).
- [ ] **Step 2: Implement** following `sendSignupLink`. Subject: `Secret Santa names have been drawn`. Body: `Sign in to see who you're buying for.` plus a button to `{ORIGIN}/secret-santa`.
- [ ] **Step 3: In `?/draw`,** after a successful draw and only when `config.smtp.enable`, send to each participant; failures are logged without recipient-pair information and do not fail the draw.
- [ ] **Step 4: Run tests, commit** `feat: email participants when names are drawn`

---

### Task 6: Invite link plus Google

**Files:**
- Modify: `src/lib/server/openid.ts` (new cookie constant and helpers), `src/routes/signup/+page.server.ts`, `src/routes/signup/+page.svelte`, `src/routes/login/oidc/callback/+server.ts`, `src/routes/login/+page.svelte`, `src/i18n/en.json`
- Test: `tests/unit/oidc-invite.spec.ts`; end-to-end with a real provider is a manual check (Task 9)

**Interfaces:**
- Produces:
  ```ts
  export const SIGNUP_TOKEN_COOKIE = "oidc_signup_token";   // http-only, sameSite lax, 10 minutes, path "/"
  export async function resolveInvite(tokenId: string | undefined): Promise<string | null>
  // returns the SignupToken id when it exists, is not redeemed and isTokenTimeValid(createdAt); else null
  export function canRegister(opts: { autoRegister: boolean; enableSignup: boolean; inviteId: string | null }): boolean
  // autoRegister && (enableSignup || inviteId !== null)
  ```

- [ ] **Step 1: Write failing tests** for `canRegister` (all eight combinations) and `resolveInvite` (missing, unknown, redeemed, expired, valid).
- [ ] **Step 2: Implement both functions.**
- [ ] **Step 3: Signup page:** when the `?token=` is valid and `oidcConfig.ready`, set `SIGNUP_TOKEN_COOKIE` to the token row's id in the load and show a button labelled with the existing `auth.sign-in-with` string that goes to `/login/oidc`.
- [ ] **Step 4: Callback:** before the auto-register branch, read and delete the cookie, call `resolveInvite`, then `canRegister`. If false: `error(400, $t("auth.ask-your-organizer-for-an-invite-link"))` with copy `Ask your organizer for an invite link.` If true: pass the invite id as the fourth argument of `createUser`. Existing-user branches are unchanged.
- [ ] **Step 5: Login page:** when `providerName` is `Google` (case-insensitive) show the label `Continue with Google` with an inline Google "G" mark; other providers unchanged.
- [ ] **Step 6: Run tests, `pnpm check`, commit** `feat: join by invite link with Google`

---

### Task 7: Google profile picture

**Files:**
- Modify: `src/routes/login/oidc/callback/+server.ts`
- Create: `src/lib/server/oidc-picture.ts`
- Test: `tests/unit/oidc-picture.spec.ts`

**Interfaces:**
- Consumes: `createImage(filename, image)` from `src/lib/server/image-util.ts` (accepts a URL string and already fetches through `getSafeUrl`).
- Produces: `importPictureIfMissing(user: { id: string; username: string; picture: string | null }, pictureClaim: unknown): Promise<void>` — never throws.

- [ ] **Step 1: Write failing tests** with `createImage` injected as a parameter default so it can be faked:
  - user already has a picture → `createImage` not called.
  - claim is `undefined`, a number, or not an `https:` URL → not called, resolves.
  - `createImage` rejects or returns null → resolves, user unchanged.
  - success → user's `picture` is set to the returned filename.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Call it** in the callback for the found-by-oauthId, found-by-email and newly-created paths, before `authenticate`. Add `picture: true` to the user selects.
- [ ] **Step 4: Run tests, commit** `feat: use Google picture when no profile picture is set`

---

### Task 8: Compare-prices link

**Files:**
- Modify: `src/lib/item-util.ts`, the shared part of the item card under `src/lib/components/wishlists/ItemCard/components` used by both `GridItemCard.svelte` and `ListItemCard.svelte`, `src/i18n/en.json`
- Test: `tests/unit/compare-prices.spec.ts`, plus one case in `tests/ui/list.spec.ts`

**Interfaces:**
- Produces: `comparePricesUrl(name: string): string | null` — trims, collapses whitespace, cuts to 150 characters, returns `null` for an empty result, otherwise `https://www.google.com/search?udm=28&q=` + `encodeURIComponent(query)`. Confirm `udm=28` still opens the Shopping tab at build time; if not, use the current Shopping search URL and update the test.

- [ ] **Step 1: Write failing tests**
  - `"LEGO Star Wars & Friends #75192?"` → the `q` parameter decodes back to the same string.
  - emoji name round-trips.
  - a 400-character name gives a decoded query of length 150.
  - `"   "` → `null`.
  - UI: a wish shows a link named `Compare prices` with `target="_blank"` and `rel="noopener noreferrer"`.
- [ ] **Step 2: Implement the function and the link** (hidden when the function returns `null`).
- [ ] **Step 3: Run tests, commit** `feat: add compare-prices link to wishes`

---

### Task 9: Documentation, hosting and live check

**Files:**
- Modify: `README.md`

**Blocked on the owner:** hosting choice. The app needs a host that runs a Docker container with a persistent disk; Netlify and Vercel do not provide one. Do not start the hosting steps until the owner has chosen.

- [ ] **Step 1: README — Secret Santa section:** how to draw, keep-apart pairs, what redraw does, that drawing hides claimer names, and the honest limit that whoever runs the server can read the database.
- [ ] **Step 2: README — Google sign-in section:** Google Cloud Console → OAuth client (Web), authorised redirect URI `https://<site address>/login`; in Admin → Settings → Security set issuer `https://accounts.google.com`, client ID, client secret, provider name `Google`, automatic registration on; turn public sign-up off; send invite links from the group's Members tab.
- [ ] **Step 3: Deploy** the existing `Dockerfile` to the chosen host with volumes for `/usr/src/app/data` and `/usr/src/app/uploads`, `ORIGIN` set to the public HTTPS address.
- [ ] **Step 4: Manual live check** with two real Google accounts: invite link → Continue with Google → lands in the invited group with Google picture; Google sign-in with no invite is refused; draw with a keep-apart pair; each person sees one match; compare-prices link opens a shopping search.
- [ ] **Step 5: Commit** `docs: Secret Santa and Google sign-in setup`
