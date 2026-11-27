import { afterAll, beforeAll, expect, test } from "vitest";
import { as, asAnon, asService, pairsJson, partyOfThree, pool, resetDb, U1, U2, U3, U4 } from "./helpers";

let partyId: string;

beforeAll(async () => {
  await resetDb();
  ({ partyId } = await partyOfThree());
  await asService((run) =>
    run("select public.replace_assignments($1, $2::jsonb)", [partyId, pairsJson([[U1, U2], [U2, U3], [U3, U1]])]),
  );
  await as(U1, (run) => run("insert into public.wishes (user_id, title, url) values ($1, 'Kettle', 'https://shop.example/kettle')", [U1]));
});
afterAll(() => pool.end());

test("signing up creates a profile from the Google name and picture", async () => {
  const rows = await as(U2, (run) => run("select display_name, google_avatar_url from public.profiles where id = $1", [U2]));
  expect(rows).toEqual([{ display_name: "Sam Rivera", google_avatar_url: `https://pics.example.test/${U2}.jpg` }]);
});

test("each person reads exactly one match: their own", async () => {
  for (const [user, receiver] of [[U1, U2], [U2, U3], [U3, U1]]) {
    const rows = await as(user, (run) => run("select giver_id, receiver_id from public.assignments"));
    expect(rows).toEqual([{ giver_id: user, receiver_id: receiver }]);
  }
});

test("asking for someone else's match returns nothing, even for the organizer", async () => {
  expect(await as(U1, (run) => run("select * from public.assignments where giver_id = $1", [U2]))).toEqual([]);
  expect(await as(U2, (run) => run("select * from public.assignments where receiver_id = $1", [U2]))).toEqual([]);
});

test("nobody signed in can write matches", async () => {
  await expect(as(U1, (run) => run("insert into public.assignments values ($1, $2, $3)", [partyId, U1, U3]))).rejects.toThrow(/permission denied/);
  await expect(as(U1, (run) => run("update public.assignments set receiver_id = $1", [U3]))).rejects.toThrow(/permission denied/);
  await expect(as(U1, (run) => run("delete from public.assignments"))).rejects.toThrow(/permission denied/);
});

test("only the server can replace matches", async () => {
  const call = (run: Parameters<Parameters<typeof as>[1]>[0]) =>
    run("select public.replace_assignments($1, $2::jsonb)", [partyId, pairsJson([[U1, U3], [U3, U2], [U2, U1]])]);
  await expect(as(U1, call)).rejects.toThrow(/permission denied/);
  await expect(asAnon(call)).rejects.toThrow(/permission denied/);
});

test("a signed-out visitor reads nothing", async () => {
  for (const table of ["profiles", "parties", "party_members", "wishes", "assignments", "exclusions", "draw_participants"]) {
    await expect(asAnon((run) => run(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
  }
});

test("someone with an account but no invite sees no people, parties or wishes", async () => {
  const seen = await as(U4, async (run) => ({
    profiles: await run("select id from public.profiles"),
    parties: await run("select id from public.parties"),
    members: await run("select user_id from public.party_members"),
    wishes: await run("select id from public.wishes"),
    participants: await run("select user_id from public.draw_participants"),
  }));
  expect(seen.profiles).toEqual([{ id: U4 }]);
  expect(seen.parties).toEqual([]);
  expect(seen.members).toEqual([]);
  expect(seen.wishes).toEqual([]);
  expect(seen.participants).toEqual([]);
});

test("party members see each other's profiles and wishes", async () => {
  const rows = await as(U2, (run) => run("select title from public.wishes where user_id = $1", [U1]));
  expect(rows).toEqual([{ title: "Kettle" }]);
  const profiles = await as(U2, (run) => run("select id from public.profiles order by id"));
  expect(profiles.map((p) => p.id)).toEqual([U1, U2, U3]);
});

test("a person cannot change someone else's wish or profile", async () => {
  expect(await as(U2, (run) => run("update public.wishes set title = 'hacked' where user_id = $1 returning id", [U1]))).toEqual([]);
  expect(await as(U2, (run) => run("delete from public.wishes where user_id = $1 returning id", [U1]))).toEqual([]);
  expect(await as(U2, (run) => run("update public.profiles set display_name = 'hacked' where id = $1 returning id", [U1]))).toEqual([]);
  await expect(as(U2, (run) => run("insert into public.wishes (user_id, title) values ($1, 'planted')", [U1]))).rejects.toThrow(/row-level security/);
});

test("a person cannot change protected profile fields or delete a profile", async () => {
  await expect(as(U2, (run) => run("update public.profiles set google_avatar_url = 'https://evil' where id = $1", [U2]))).rejects.toThrow(/permission denied/);
  await expect(as(U2, (run) => run("delete from public.profiles where id = $1", [U2]))).rejects.toThrow(/permission denied/);
});

test("a wish link must be http or https", async () => {
  await expect(as(U2, (run) => run("insert into public.wishes (user_id, title, url) values ($1, 'x', 'javascript:alert(1)')", [U2]))).rejects.toThrow(/check constraint/);
});

test("a person can have at most 100 wishes", async () => {
  await as(U3, (run) => run("insert into public.wishes (user_id, title) select $1, 'w' || n from generate_series(1, 100) n", [U3]));
  await expect(as(U3, (run) => run("insert into public.wishes (user_id, title) values ($1, 'one more')", [U3]))).rejects.toThrow(/100 wishes/);
});

test("pictures can only be stored under your own folder", async () => {
  await as(U2, (run) => run("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${U2}/a.png`]));
  await expect(as(U2, (run) => run("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${U1}/a.png`]))).rejects.toThrow(/row-level security/);
  expect(await as(U1, (run) => run("delete from storage.objects where name = $1 returning id", [`${U2}/a.png`]))).toEqual([]);
  expect(await as(U2, (run) => run("delete from storage.objects where name = $1 returning name", [`${U2}/a.png`]))).toHaveLength(1);
});

test("the avatars bucket is limited to 5 MB images", async () => {
  const { rows } = await pool.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'");
  expect(rows[0].public).toBe(true);
  expect(Number(rows[0].file_size_limit)).toBe(5 * 1024 * 1024);
  expect(rows[0].allowed_mime_types).toEqual(["image/png", "image/jpeg", "image/webp", "image/gif"]);
});

test("the private helper functions cannot be called through the API schema", async () => {
  const { rows } = await pool.query(
    "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') and p.proname <> 'invite_preview'",
  );
  expect(rows).toEqual([]);
});

test("every public table has row-level security switched on", async () => {
  const { rows } = await pool.query("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity");
  expect(rows).toEqual([]);
});
