# Secret Santa — design

Date: 2026-11-27. Status: draft, awaiting approval.

## Intent

Run a Secret Santa inside this Wishlist app. Each person lists what they want, with links to the actual products. The organizer presses one button and the app randomly decides who buys for whom. Each person sees only their own match, with that person's picture and a link to their wishlist.

People will not bother creating a username and password, so joining has to be one tap with a Google account.

## What already exists (no work needed)

- Wishes with product links: pasting a URL fetches the name, image and price (`src/routes/lists/[id]/create-item`, `src/routes/api/product`).
- Groups, group managers, claiming items so nothing is bought twice.
- Profile pictures: upload on the Account page (`src/lib/components/account/EditProfile.svelte`), shown through `src/lib/components/Avatar.svelte`.
- Sign-in with an outside account over OpenID Connect, including automatic account creation (`src/lib/server/openid.ts`, `src/routes/login/oidc/callback/+server.ts`, admin settings under Security). Google is a supported provider.

## Goals

1. A group manager can draw names for their group with one button.
2. Each member sees only their own match: name, picture, link to that person's wishlist, plus the budget and exchange date if set.
3. Nobody else can see the matches through the app, including the organizer.
4. A new person can join with their Google account in one tap and land in the group with an empty wishlist.
5. A Google account's picture becomes the profile picture when the person has not uploaded one.

## Non-goals (first version)

- Typing in names of people who have no account.
- "These two must not draw each other" rules (couples, households). See open question 1.
- Sign-in with Apple, Facebook or others.
- Reminders, gift tracking, anonymous messaging between giver and receiver.
- More than one active draw per group at a time.

## Anti-goals

- A match leaking: in a page's data, an API response, an email, a log line, or a real-time event sent to the wrong person.
- Anyone drawing themselves.
- Breaking existing wishlist behaviour for groups that never use Secret Santa.

## Approaches considered

1. **Draw from the group's members (chosen).** Everyone has an account, a wishlist and a picture. Reuses groups, lists and avatars. Chosen because the user wants links and pictures, both of which need accounts, and Google sign-in removes the sign-up friction.
2. **Organizer types a list of names, each gets a private link.** No accounts, quickest to start, but typed names have no wishlist or picture. Rejected for that reason.
3. **A separate small Secret Santa app.** Rejected: it would rebuild wishlists, links, pictures and sign-in that this repo already has.

## Design

### Data

Two new tables (Prisma, SQLite, new migration):

- `SecretSantaDraw`: `id`, `groupId` (unique, cascade delete with group), `createdById`, `createdAt`, `budget` (optional free text, e.g. "$25"), `exchangeDate` (optional), `note` (optional).
- `SecretSantaAssignment`: `id`, `drawId` (cascade), `giverId`, `receiverId` (both cascade with user). Unique on `(drawId, giverId)` and on `(drawId, receiverId)`.

One draw per group. Redrawing deletes the old draw and its assignments and creates a new one in a single transaction.

### The randomizer

A pure function in `src/lib/server/secret-santa.ts`: takes a list of user ids, returns giver→receiver pairs.

- Shuffle with a Fisher–Yates shuffle using Node's `crypto.randomInt` (not `Math.random`).
- Assign each person to the next one in the shuffled order, the last to the first. This is one closed loop, so nobody draws themselves and everyone gives one gift and gets one gift.
- Minimum three people. With two the result is not a secret; refuse with a clear message.

### Who is in the draw

Every member of the group by default (all `UserGroupMembership` rows for the group; the `active` flag only marks which group a person currently has selected and is ignored here). Before drawing, the manager sees the member list with a checkbox each and can leave people out.

The member screen and home banner show the draw for the group the person currently has selected.

### Organizer screen

New page `src/routes/admin/groups/[groupId]/secret-santa`, a tab beside Members and Settings, for group managers and admins.

```
Secret Santa
Budget (optional)  [ $25        ]
Exchange date      [ 2026-12-20 ]
Note (optional)    [ Wrap it!   ]

Who's in (6)
[x] (pic) Donna      [x] (pic) Sam
[x] (pic) Alex       [ ] (pic) Grandpa Joe
...
                         [ Draw names ]
```

After a draw: "Names drawn on 27 Nov for 5 people", the list of who is in (never who has whom), and a **Redraw** button behind a confirmation that warns everyone will get a new match. Budget, date and note stay editable without redrawing.

### Member screen

New page `src/routes/secret-santa`, with a link in the navigation and a banner on the home page when the active group has a draw.

```
You are buying for
   (picture)
    Sam Rivera
  [ See Sam's wishlist ]
Budget $25 · Exchange 20 Dec
"Wrap it!"
```

The match is hidden behind a "Tap to reveal" cover on each visit, so it is not shown to someone looking over a shoulder. If there is no draw yet: "Names haven't been drawn yet." If the person was left out or joined after the draw: "You're not in this draw — ask your organizer."

The wishlist button goes to the receiver's list in this group (`/lists/[id]`); if they have several, to their lists filtered by that person.

### Keeping it secret

- Assignments are only ever read on the server with `giverId = signed-in user`. No endpoint returns another person's assignment or the full set, for any role.
- The organizer screen loads participants only, never pairs.
- Nothing about a match is logged, emailed, or sent over the existing list events stream.
- Claimed items: today the rest of the group can see who claimed each item (`claims.showName`, `shouldShowName` in `src/lib/components/wishlists/util.ts`), which would give matches away. Drawing names turns "show who claimed" off for that group, and the organizer screen says so. Items still show as claimed, so nothing is bought twice. The manager can turn it back on in group settings. (My call.)
- Honest limit: whoever runs the server can open the database file and read the table. Stated in the README.

### Changes after the draw

Participants are whoever appears as a giver in the assignments; no extra table.

- The organizer screen lists members who are "Not in this draw" (left out or joined later, not told apart) and offers Redraw.
- Someone in the draw is removed from the group or deleted: the code that removes a member also deletes that draw's assignments where they are giver or receiver (user deletion already cascades). This leaves a gap. The organizer screen shows "The draw is no longer complete" and offers Redraw. No automatic repair.
- A participant whose match has gone sees "Your match has left the group — your organizer needs to redraw", detected as: they are a receiver in the draw but have no giver row. (Builder's call on the exact check.)

### Emails

If SMTP is set up, drawing sends each participant "Names have been drawn — sign in to see who you're buying for" with a link. The email never names the match. Without SMTP nothing is sent and the organizer tells people themselves.

### Google sign-in

Uses the existing OpenID Connect support; no new sign-in code path.

- Setup, done once by the site owner in Admin → Settings → Security: issuer `https://accounts.google.com`, a client ID and secret created in Google Cloud Console, provider name "Google", automatic registration on. Redirect URL registered with Google: `https://<site address>/login`. Written up step by step in the README. This needs a Google account and cannot be done from code.
- The login button reads "Continue with Google" when the provider name is Google (it already uses the provider name; confirm wording and add the Google mark).
- New: on first Google sign-in, and on later sign-ins while the person has no picture, download the `picture` from the Google profile through the existing safe image fetch in `src/lib/server/image-util.ts` and store it as the profile picture. An uploaded picture is never overwritten.
- New Google accounts land in the site's default group, as they do today (`createUser` in `src/lib/server/user.ts`). The Secret Santa group is therefore set as the default group. Joining a different group through an invite link plus Google is out of scope.
- Google gives no `preferred_username`, so the username falls back to the email address, as the existing code already does.
- Password sign-up stays available for anyone without a Google account.

### Text and languages

All new wording goes in `src/i18n/en.json`. Other languages fall back to English until translated through the project's usual translation flow.

## Constraints

- Stack stays as is: SvelteKit, Svelte 5, Prisma on SQLite, Skeleton UI, Playwright tests, pnpm.
- Google sign-in needs the site reachable at a public HTTPS address. See open question 2.
- The first account is still created with a password in the setup wizard (existing rule).

## Testing

- The randomizer: no self-matches, everyone gives once and receives once, refuses fewer than three, across many runs and sizes.
- Playwright: manager draws; each member sees exactly one match and it differs per member; a member's page data and network responses contain no one else's pair; non-managers cannot open the organizer screen or trigger a draw; redraw replaces matches; late joiner sees the "not in this draw" message.
- Google picture import with a stubbed provider, including "does not overwrite an upload".

## Left to the builder

- Exact component breakdown, wording, and styling within the existing look.
- Where the randomizer's tests run (Playwright's runner without a browser, or a small unit runner).
- How the "tap to reveal" cover is drawn.
- Email template layout in `templates/`.

## Open questions for the owner

1. Who may join? With Google sign-up on, anyone who finds the site address gets an account in the group and can see the wishlists. Proposed: joining needs the organizer's invite link, and "Continue with Google" from that link lands the person in the invited group (this replaces the "default group" rule above and adds work in the sign-in path). Alternative: leave it open.
2. Do any pairs need to be kept apart (for example couples who already buy for each other)?
3. Where will the site run so people can reach it (an existing server, or does it need hosting set up)?
