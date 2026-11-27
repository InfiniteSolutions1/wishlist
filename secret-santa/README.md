# Secret Santa

Your own Secret Santa app.

- **Join with a link and your name.** No password. Google sign-in is optional.
- **Profile pictures**, taken from Google or uploaded.
- **Wishlists** where every wish can link to the real product.
- **Compare prices** link on every wish (opens a shopping search).
- **Draw names** with one button. Couples can be kept apart.
- **Private matches**: each person can read only their own match. The organizer cannot see the others.

Built with Next.js (hosted on Vercel) and Supabase (database, Google sign-in, picture storage).

## One-time setup

### 1. Supabase

1. Create a Supabase project.
2. Run the three files in `supabase/migrations/` in order (SQL editor, or `npx supabase db push` after `npx supabase link`).
3. From **Project Settings → API Keys**, note the project URL, the **publishable** key and the **secret** key.

### 2. Sign-in

People join by opening the invite link and typing their name. There is no password and no email.

1. In Supabase open **Authentication → Sign In / Providers** and switch on **Allow anonymous sign-ins**.
2. In **Authentication → URL Configuration**, set **Site URL** to your site address.

Good to know: a person stays signed in on the phone or computer they joined from. If they clear their browser or switch device they join again as a new person, and the organizer removes the old one.

**Optional: add "Continue with Google"** so people can sign in on any device.

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project, then **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
2. Under **Authorised redirect URIs** add `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
3. Copy the client ID and client secret into Supabase: **Authentication → Sign In / Providers → Google**, and switch it on.
4. Add `https://YOUR-SITE/auth/callback` to Supabase's **Redirect URLs**.
5. Set `NEXT_PUBLIC_GOOGLE_SIGNIN=on` in Vercel and redeploy.

### 3. Vercel

1. Import this repository in Vercel and set **Root Directory** to `secret-santa`.
2. Add the environment variables from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server only; never give it a `NEXT_PUBLIC_` name)
3. Deploy.

## Running a Secret Santa

1. Sign in, start a party, and send the invite link from **Manage party** to everyone.
2. Each person opens the link, types their name, and fills in their wishlist.
3. Add any couples under **Keep apart**, then press **Draw names**.
4. Everyone opens the party and taps to reveal who they are buying for.

If someone joins or leaves after the draw, press **Redraw**; everyone gets a new match.

## How the secret is kept

- Matches live in a table that people can only read where they are the giver. Nobody signed in can write to it.
- Only the server writes matches, using the secret key, after checking that the organizer asked.
- The secret key is used in two places only: saving a draw and deleting an account.
- Honest limits: whoever owns the Supabase project can read the database directly. In a very small group, or one made mostly of couples, people can sometimes work out other matches from their own.
- Profile pictures are stored with unguessable file names in a public bucket, so someone who already has a picture's address can open it without signing in.

## Working on it

```bash
npm install
npm test                 # logic tests (randomizer, links, helpers)

# Privacy rules, tested as SQL against a throwaway local Postgres 16:
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:security

# Whole app in a real browser against a local Supabase (needs Docker):
npx supabase start
cp .env.example .env.local   # fill in the local URL and keys that `supabase start` prints
npm run build && npm start -- --hostname 127.0.0.1
npm run test:e2e
```

`npm run test:security` wipes and rebuilds the database it points at. Never point it at a real project.

## Credits

The festive look (night-blue background, red-bordered card, red buttons, falling snow and the "Mountains of Christmas" heading font) is adapted from [richard1912/SecretSanta](https://github.com/richard1912/SecretSanta), which its `package.json` licenses as MIT. Everything else is new.
