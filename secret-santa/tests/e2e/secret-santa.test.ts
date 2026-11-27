/**
 * End-to-end check of the whole app in a real browser against a local Supabase.
 *
 *   npx supabase start        (needs Docker)
 *   npm run build && npm start -- --hostname 127.0.0.1
 *   npm run test:e2e
 *
 * Google sign-in cannot be automated, so test people are created with a password
 * through the admin API and their session cookies are handed to the browser.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const APP = process.env.E2E_APP_URL ?? "http://127.0.0.1:3000";
const API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
// Read from .env.local (the keys `npx supabase start` prints). Never written into this file.
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
if (!PUBLISHABLE || !SECRET) throw new Error("Set the local Supabase keys in .env.local before running the e2e tests.");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API)) throw new Error("The e2e tests only run against a local Supabase.");
const PASSWORD = "local-test-password-1";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

type Person = { name: string; id: string; context: BrowserContext; page: Page; api: SupabaseClient };

const admin = createClient(API, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
let browser: Browser;
const people: Record<string, Person> = {};
let partyId = "";
let inviteLink = "";

async function makePerson(name: string): Promise<Person> {
  const email = `${name.toLowerCase().replace(/\W+/g, ".")}.${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) throw error ?? new Error("no user");

  // Sign in the same way the app's server does, and collect the cookies it would set.
  const jar = new Map<string, string>();
  const session = createServerClient(API, PUBLISHABLE, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const signedIn = await session.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;

  const context = await browser.newContext();
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: APP })));
  const page = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());

  const api = createClient(API, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  await api.auth.signInWithPassword({ email, password: PASSWORD });

  return { name, id: data.user.id, context, page, api };
}

const notice = (page: Page) => page.getByRole("status").first();

beforeAll(async () => {
  browser = await chromium.launch();
  for (const name of ["Olive Organizer", "Sam Rivera", "Alex Kim", "Dana Lee", "Eve Late", "Stranger Dan"]) {
    people[name.split(" ")[0]] = await makePerson(name);
  }
}, 120_000);

afterAll(async () => {
  await browser?.close();
  for (const person of Object.values(people)) {
    await admin.auth.admin.deleteUser(person.id);
  }
});

test("a new visitor only has to type their name to get started", async () => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${APP}/me`);
  expect(new URL(page.url()).pathname).toBe("/");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/me");
  expect(await page.getByRole("button", { name: "Continue with Google" }).count()).toBe(0);

  await page.getByLabel("Your name").fill("Grandpa Joe");
  await page.getByRole("button", { name: /Get started/ }).click();
  await page.waitForURL((url) => url.pathname === "/me");
  expect(await page.getByLabel("My name").inputValue()).toBe("Grandpa Joe");
});

test("the organizer starts a party and gets an invite link", async () => {
  const { page } = people.Olive;
  await page.goto(APP);
  await page.getByLabel("Party name").fill("Family Christmas");
  expect(await page.getByLabel(/Budget/).inputValue()).toBe("$50 gift minimum - spend more if you wish");
  await page.getByRole("button", { name: /Start the party/ }).click();
  await page.waitForURL(/\/party\/[0-9a-f-]{36}\/manage/);
  partyId = page.url().split("/party/")[1].split("/")[0];
  inviteLink = (await page.locator("p.font-mono").innerText()).trim();
  expect(inviteLink).toMatch(/^http:\/\/127\.0\.0\.1:3000\/join\/[0-9a-f]{32}$/);
});

test("a signed-out visitor opening the invite sees who invited them and a name box", async () => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(inviteLink);
  expect(await page.getByRole("heading", { name: "Family Christmas" }).isVisible()).toBe(true);
  expect(await page.getByText("Olive Organizer invited you to").isVisible()).toBe(true);
  expect(await page.getByLabel("Your name").isVisible()).toBe(true);
});

test("a wrong invite link says it is no longer valid", async () => {
  const { page } = people.Sam;
  await page.goto(`${APP}/join/not-a-real-code`);
  expect(await page.getByText("This invite link is no longer valid.").isVisible()).toBe(true);
});

test("three people join with the link", async () => {
  for (const key of ["Sam", "Alex", "Dana"]) {
    const { page } = people[key];
    await page.goto(inviteLink);
    await page.getByRole("button", { name: /Join the party/ }).click();
    await page.waitForURL(new RegExp(`/party/${partyId}$`));
    expect(await page.getByText("Names haven't been drawn yet.").isVisible()).toBe(true);
    expect(await page.getByText("Budget: $50 gift minimum - spend more if you wish").isVisible()).toBe(true);
  }
  await people.Olive.page.goto(`${APP}/party/${partyId}`);
  expect(await people.Olive.page.getByRole("heading", { name: "Everyone (4)" }).isVisible()).toBe(true);
});

test("someone with an account but no invite cannot see the party in the app or through the API", async () => {
  const { page, api } = people.Stranger;
  const response = await page.goto(`${APP}/party/${partyId}`);
  expect(response?.status()).toBe(404);
  expect((await api.from("parties").select("id")).data).toEqual([]);
  expect((await api.from("party_members").select("user_id")).data).toEqual([]);
  expect((await api.from("profiles").select("id")).data).toEqual([{ id: people.Stranger.id }]);
  expect((await api.from("wishes").select("id")).data).toEqual([]);
});

test("a wish with a product link shows Open link and Compare prices to other members", async () => {
  const { page } = people.Sam;
  await page.goto(`${APP}/me`);
  const form = page.locator("form", { hasText: "Add a wish" });
  await form.getByLabel("What is it?").fill("LEGO Star Wars & Friends #75192?");
  await form.getByLabel(/Link to it/).fill("shop.example/lego?id=1");
  await form.getByLabel(/Price/).fill("$18");
  await form.getByRole("button", { name: /Add to my wishlist/ }).click();
  await expect.poll(() => page.getByRole("heading", { name: "What I'd love (1)" }).isVisible()).toBe(true);

  const olive = people.Olive.page;
  await olive.goto(`${APP}/people/${people.Sam.id}`);
  const open = olive.getByRole("link", { name: /Open link/ });
  expect(await open.getAttribute("href")).toBe("https://shop.example/lego?id=1");
  expect(await open.getAttribute("target")).toBe("_blank");
  expect(await open.getAttribute("rel")).toBe("noopener noreferrer");
  const compare = new URL((await olive.getByRole("link", { name: /Compare prices/ }).getAttribute("href"))!);
  expect(compare.origin + compare.pathname).toBe("https://www.google.com/search");
  expect(compare.searchParams.get("q")).toBe("LEGO Star Wars & Friends #75192?");
});

test("a dangerous link is refused", async () => {
  const { page, api, id } = people.Sam;
  await page.goto(`${APP}/me`);
  const form = page.locator("form", { hasText: "Add a wish" });
  await form.getByLabel("What is it?").fill("Sneaky");
  await form.getByLabel(/Link to it/).fill("javascript:alert(1)");
  await form.getByRole("button", { name: /Add to my wishlist/ }).click();
  await expect.poll(() => notice(page).innerText()).toContain("That link doesn't look right");
  const direct = await api.from("wishes").insert({ user_id: id, title: "Sneaky", url: "javascript:alert(1)" });
  expect(direct.error).not.toBeNull();
  expect((await api.from("wishes").select("title").eq("user_id", id)).data).toHaveLength(1);
});

test("a person can upload a profile picture, but not into someone else's folder", async () => {
  const { page, api } = people.Sam;
  await page.goto(`${APP}/me`);
  await page.getByLabel("Choose a profile picture").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(() => page.getByText("Picture updated.").isVisible(), { timeout: 15000 }).toBe(true);
  await expect
    .poll(() => page.locator("section[aria-label='My profile'] img").getAttribute("src"))
    .toContain(`/storage/v1/object/public/avatars/${people.Sam.id}/`);
  const src = await page.locator("section[aria-label='My profile'] img").getAttribute("src");
  expect((await fetch(src!)).status).toBe(200);

  const planted = await api.storage.from("avatars").upload(`${people.Olive.id}/x.png`, PNG, { contentType: "image/png" });
  expect(planted.error).not.toBeNull();
  const notAnImage = await api.storage.from("avatars").upload(`${people.Sam.id}/x.html`, "<script>", { contentType: "text/html" });
  expect(notAnImage.error).not.toBeNull();
});

test("only the organizer can open the manage page or draw", async () => {
  const { page, api } = people.Sam;
  await page.goto(`${APP}/party/${partyId}/manage`);
  expect(new URL(page.url()).pathname).toBe(`/party/${partyId}`);
  const rpc = await api.rpc("replace_assignments", { p_party: partyId, p_pairs: [] });
  expect(rpc.error).not.toBeNull();
  const insert = await api.from("assignments").insert({ party_id: partyId, giver_id: people.Sam.id, receiver_id: people.Alex.id });
  expect(insert.error).not.toBeNull();
});

test("the organizer keeps a couple apart and draws names", async () => {
  const { page } = people.Olive;
  await page.goto(`${APP}/party/${partyId}/manage`);
  await page.getByLabel("First person").selectOption({ label: "Sam Rivera" });
  await page.getByLabel("Second person").selectOption({ label: "Alex Kim" });
  await page.getByRole("button", { name: "Add pair" }).click();
  await expect.poll(() => page.getByText(/Alex Kim ↔ Sam Rivera|Sam Rivera ↔ Alex Kim/).isVisible()).toBe(true);

  await page.getByRole("button", { name: /Draw names/ }).click();
  await expect.poll(() => notice(page).innerText()).toContain("Names drawn for 4 people.");
  expect(await page.getByText(/for 4 people\./).first().isVisible()).toBe(true);
  expect(await page.getByText("With few people or many couples, matches are easier to guess.").isVisible()).toBe(true);
});

test("each person sees one match, hidden until tapped, and the couple did not get each other", async () => {
  const got: Record<string, string> = {};
  for (const key of ["Olive", "Sam", "Alex", "Dana"]) {
    const { page, api, id } = people[key];
    await page.goto(`${APP}/party/${partyId}`);
    const reveal = page.getByRole("button", { name: /Tap to reveal/ });
    expect(await reveal.isVisible()).toBe(true);
    const link = page.getByRole("link", { name: /^See .*'s wishlist$/ });
    expect(await link.count()).toBe(0);
    await reveal.click();
    got[key] = (await link.innerText()).replace(/^See /, "").replace(/'s wishlist$/, "");

    // Straight through the API: exactly one row, their own, even for the organizer.
    const rows = (await api.from("assignments").select("giver_id, receiver_id")).data ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].giver_id).toBe(id);
    expect((await api.from("assignments").select("*").neq("giver_id", id)).data).toEqual([]);
  }
  const names = Object.values(got);
  expect(new Set(names).size).toBe(4);
  for (const key of Object.keys(got)) expect(got[key]).not.toBe(people[key].name);
  expect(got.Sam).not.toBe("Alex Kim");
  expect(got.Alex).not.toBe("Sam Rivera");
  expect(names.sort()).toEqual(["Alex Kim", "Dana Lee", "Olive Organizer", "Sam Rivera"]);
});

test("the organizer's manage page never contains anyone's match", async () => {
  const { page } = people.Olive;
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (response.url().startsWith(APP)) bodies.push(await response.text().catch(() => ""));
  });
  await page.goto(`${APP}/party/${partyId}/manage`);
  await page.waitForLoadState("networkidle");
  expect(bodies.join("\n")).not.toMatch(/receiver_id|giver_id/);
});

test("someone who joins after the draw is told they are not in it yet", async () => {
  const { page } = people.Eve;
  await page.goto(inviteLink);
  await page.getByRole("button", { name: /Join the party/ }).click();
  await page.waitForURL(new RegExp(`/party/${partyId}$`));
  expect(await page.getByText("You're not in this draw yet — ask your organizer.").isVisible()).toBe(true);
  await people.Olive.page.goto(`${APP}/party/${partyId}/manage`);
  expect(await people.Olive.page.getByText(/Not in this draw: Eve Late/).isVisible()).toBe(true);
});

test("when a member leaves, their giver is told and the organizer is asked to redraw", async () => {
  const dana = people.Dana;
  const { data } = await admin.from("assignments").select("giver_id").eq("party_id", partyId).eq("receiver_id", dana.id).single();
  const giver = Object.values(people).find((p) => p.id === data!.giver_id)!;

  await dana.page.goto(`${APP}/party/${partyId}`);
  await dana.page.getByRole("button", { name: "Leave party" }).click();
  await expect.poll(() => notice(dana.page).innerText()).toContain("You left the party.");

  await giver.page.goto(`${APP}/party/${partyId}`);
  expect(await giver.page.getByText("Your match has left — your organizer needs to redraw.").isVisible()).toBe(true);
  await people.Olive.page.goto(`${APP}/party/${partyId}/manage`);
  expect(await people.Olive.page.getByText(/The draw is no longer complete/).isVisible()).toBe(true);
});

test("a redraw gives everyone a match again, including the late joiner", async () => {
  const { page } = people.Olive;
  await page.goto(`${APP}/party/${partyId}/manage`);
  await page.getByRole("button", { name: /Redraw/ }).click();
  await expect.poll(() => notice(page).innerText()).toContain("Names drawn for 4 people.");
  for (const key of ["Olive", "Sam", "Alex", "Eve"]) {
    expect((await people[key].api.from("assignments").select("receiver_id")).data).toHaveLength(1);
  }
});

test("rules that leave no possible draw are refused and the old matches stay", async () => {
  const { page, api } = people.Olive;
  const before = (await api.from("assignments").select("receiver_id")).data;
  await page.goto(`${APP}/party/${partyId}/manage`);
  // Untick Eve: three people left, two of them kept apart, so no draw exists.
  await page.getByLabel("Eve Late is in the draw").uncheck();
  await expect.poll(() => page.getByRole("heading", { name: /Who's in \(3 of 4\)/ }).isVisible()).toBe(true);
  await page.getByRole("button", { name: /Redraw/ }).click();
  await expect.poll(() => notice(page).innerText()).toContain("These rules leave no possible draw — remove a pair or add people.");
  expect((await api.from("assignments").select("receiver_id")).data).toEqual(before);
  // Eve is unticked but still in the current draw: the page says so, and does not offer to "include" her.
  expect(await page.getByText(/Unticked but still in the current draw: Eve Late/).isVisible()).toBe(true);
  expect(await page.getByText(/Not in this draw: Eve Late/).count()).toBe(0);
});

test("a family member joins with just the link and their name, and stays signed in", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(inviteLink);
  await page.getByLabel("Your name").fill("Nana Rose");
  await page.getByRole("button", { name: /Join the party/ }).click();
  await page.waitForURL(new RegExp(`/party/${partyId}$`));
  expect(await page.getByText("Nana Rose (you)").isVisible()).toBe(true);
  expect(await page.getByText("You're not in this draw yet — ask your organizer.").isVisible()).toBe(true);

  // Still signed in on a fresh visit from the same device.
  const again = await context.newPage();
  await again.goto(`${APP}/me`);
  expect(await again.getByLabel("My name").inputValue()).toBe("Nana Rose");

  // The organizer sees her and can include her with a redraw.
  await people.Olive.page.goto(`${APP}/party/${partyId}/manage`);
  expect(await people.Olive.page.getByText(/Not in this draw: Nana Rose/).isVisible()).toBe(true);

  // Signing out on a name-only account warns first, then really signs out.
  await again.on("dialog", (dialog) => void dialog.accept());
  await again.getByRole("button", { name: "Sign out" }).click();
  await again.waitForURL((url) => url.pathname === "/");
  expect(await again.getByLabel("Your name").isVisible()).toBe(true);
});

test("a blank name is not accepted", async () => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(inviteLink);
  await page.getByLabel("Your name").fill("   ");
  await page.getByRole("button", { name: /Join the party/ }).click();
  await page.waitForTimeout(800);
  expect(new URL(page.url()).pathname).toBe(new URL(inviteLink).pathname);
  expect(await page.getByLabel("Your name").isVisible()).toBe(true);
});

test("deleting an account removes the person and their data", async () => {
  const { page, id } = people.Eve;
  await page.goto(`${APP}/me`);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL((url) => url.pathname === "/" && url.searchParams.has("notice"));
  expect((await admin.auth.admin.getUserById(id)).data.user).toBeNull();
  expect((await admin.from("profiles").select("id").eq("id", id)).data).toEqual([]);
  expect((await admin.from("party_members").select("user_id").eq("user_id", id)).data).toEqual([]);
});

test("the organizer can delete the party", async () => {
  const { page } = people.Olive;
  await page.goto(`${APP}/party/${partyId}/manage`);
  await page.getByRole("button", { name: "Delete party" }).click();
  await expect.poll(() => notice(page).innerText()).toContain("Party deleted.");
  expect((await admin.from("parties").select("id").eq("id", partyId)).data).toEqual([]);
  expect((await admin.from("assignments").select("giver_id").eq("party_id", partyId)).data).toEqual([]);
});
