import { afterAll, beforeEach, expect, test } from "vitest";
import { as, asAnon, partyOfThree, pool, resetDb, U1, U2, U3, U4, U5 } from "./helpers";

let partyId: string;
let code: string;

beforeEach(async () => {
  await resetDb();
  ({ partyId, code } = await partyOfThree());
});
afterAll(() => pool.end());

const memberIds = async () =>
  (await pool.query("select user_id from public.party_members where party_id = $1 order by user_id", [partyId])).rows.map((r) => r.user_id);

test("the person who starts a party becomes its first member", async () => {
  expect(await memberIds()).toEqual([U1, U2, U3]);
});

test("the budget can be a full sentence", async () => {
  const budget = "$50 gift minimum - spend more if you wish";
  const rows = await as(U1, (run) => run("update public.parties set budget = $2 where id = $1 returning budget", [partyId, budget]));
  expect(rows).toEqual([{ budget }]);
  await expect(as(U1, (run) => run("update public.parties set budget = $2 where id = $1", [partyId, "x".repeat(81)]))).rejects.toThrow(/check constraint/);
});

test("a party cannot be created in someone else's name", async () => {
  await expect(as(U2, (run) => run("insert into public.parties (name, owner_id) values ('x', $1)", [U1]))).rejects.toThrow(/row-level security/);
});

test("a wrong invite code joins nothing", async () => {
  const [row] = await as(U4, (run) => run("select public.join_party('not-a-real-code') as id"));
  expect(row.id).toBeNull();
  expect(await memberIds()).toEqual([U1, U2, U3]);
});

test("joining twice leaves one membership", async () => {
  await as(U2, (run) => run("select public.join_party($1)", [code]));
  expect(await memberIds()).toEqual([U1, U2, U3]);
});

test("a signed-out visitor cannot join", async () => {
  await expect(asAnon((run) => run("select public.join_party($1)", [code]))).rejects.toThrow(/permission denied/);
});

test("nobody can add a member by writing the table directly", async () => {
  await expect(as(U4, (run) => run("insert into public.party_members (party_id, user_id) values ($1, $2)", [partyId, U4]))).rejects.toThrow(/permission denied/);
});

test("the invite preview shows only the party and organizer names", async () => {
  expect(await asAnon((run) => run("select * from public.invite_preview($1)", [code]))).toEqual([
    { party_name: "Family", organizer_name: "Olive Organizer" },
  ]);
  expect(await asAnon((run) => run("select * from public.invite_preview('nope')"))).toEqual([]);
});

test("only the organizer can read or reset the invite code", async () => {
  await expect(as(U2, (run) => run("select public.party_invite_code($1)", [partyId]))).rejects.toThrow(/organizer/);
  await expect(as(U2, (run) => run("select public.reset_invite_code($1)", [partyId]))).rejects.toThrow(/organizer/);
});

test("after a reset the old link stops working and the new one works", async () => {
  const [{ fresh }] = await as(U1, (run) => run("select public.reset_invite_code($1) as fresh", [partyId]));
  expect(fresh).not.toBe(code);
  expect((await as(U5, (run) => run("select public.join_party($1) as id", [code])))[0].id).toBeNull();
  expect((await as(U5, (run) => run("select public.join_party($1) as id", [fresh])))[0].id).toBe(partyId);
});

test("a member who is not the organizer cannot change or delete the party", async () => {
  expect(await as(U2, (run) => run("update public.parties set name = 'hacked' where id = $1 returning id", [partyId]))).toEqual([]);
  expect(await as(U2, (run) => run("delete from public.parties where id = $1 returning id", [partyId]))).toEqual([]);
});

test("the organizer cannot fake the drawn date or hand the party to someone else", async () => {
  await expect(as(U1, (run) => run("update public.parties set drawn_at = now() where id = $1", [partyId]))).rejects.toThrow(/permission denied/);
  await expect(as(U1, (run) => run("update public.parties set owner_id = $2 where id = $1", [partyId, U2]))).rejects.toThrow(/permission denied/);
});

test("a member cannot remove another member or change who is in the draw", async () => {
  expect(await as(U2, (run) => run("delete from public.party_members where party_id = $1 and user_id = $2 returning user_id", [partyId, U3]))).toEqual([]);
  expect(await as(U2, (run) => run("update public.party_members set in_draw = false where party_id = $1 and user_id = $2 returning user_id", [partyId, U3]))).toEqual([]);
});

test("the organizer can remove a member and change who is in the draw", async () => {
  expect(await as(U1, (run) => run("update public.party_members set in_draw = false where party_id = $1 and user_id = $2 returning user_id", [partyId, U3]))).toHaveLength(1);
  expect(await as(U1, (run) => run("delete from public.party_members where party_id = $1 and user_id = $2 returning user_id", [partyId, U3]))).toHaveLength(1);
});

test("a member can leave, but the organizer cannot leave or be removed", async () => {
  expect(await as(U2, (run) => run("delete from public.party_members where party_id = $1 and user_id = $2 returning user_id", [partyId, U2]))).toHaveLength(1);
  expect(await as(U1, (run) => run("delete from public.party_members where party_id = $1 and user_id = $2 returning user_id", [partyId, U1]))).toEqual([]);
  expect(await memberIds()).toEqual([U1, U3]);
});

test("only the organizer can see or set keep-apart pairs", async () => {
  await as(U1, (run) => run("insert into public.exclusions (party_id, user_a, user_b) values ($1, $2, $3)", [partyId, U2, U3]));
  expect(await as(U2, (run) => run("select * from public.exclusions"))).toEqual([]);
  await expect(as(U2, (run) => run("insert into public.exclusions (party_id, user_a, user_b) values ($1, $2, $3)", [partyId, U1, U2]))).rejects.toThrow(/row-level security/);
  expect(await as(U1, (run) => run("select user_a, user_b from public.exclusions"))).toEqual([{ user_a: U2, user_b: U3 }]);
});

test("a pair must be two different members, stored once", async () => {
  const add = (a: string, b: string) => as(U1, (run) => run("insert into public.exclusions (party_id, user_a, user_b) values ($1, $2, $3)", [partyId, a, b]));
  await expect(add(U2, U2)).rejects.toThrow(/check constraint/);
  await expect(add(U3, U2)).rejects.toThrow(/check constraint/); // must be stored in order
  await expect(add(U2, U4)).rejects.toThrow(/foreign key/); // U4 is not a member
  await add(U2, U3);
  await expect(add(U2, U3)).rejects.toThrow(/duplicate key/);
});

test("changing pairs is noted on the party so the organizer is told to redraw", async () => {
  await as(U1, (run) => run("insert into public.exclusions (party_id, user_a, user_b) values ($1, $2, $3)", [partyId, U2, U3]));
  const [row] = await as(U1, (run) => run("select pairs_changed_at from public.parties where id = $1", [partyId]));
  expect(row.pairs_changed_at).not.toBeNull();
});

test("deleting a party removes its members, pairs and matches", async () => {
  await as(U1, (run) => run("delete from public.parties where id = $1", [partyId]));
  for (const table of ["party_members", "exclusions", "assignments", "draw_participants"]) {
    expect((await pool.query(`select count(*)::int as n from public.${table}`)).rows[0].n).toBe(0);
  }
});

test("deleting an account removes the profile, wishes and the parties they organize", async () => {
  await as(U1, (run) => run("insert into public.wishes (user_id, title) values ($1, 'Kettle')", [U1]));
  await pool.query("delete from auth.users where id = $1", [U1]);
  for (const table of ["parties", "party_members", "wishes"]) {
    expect((await pool.query(`select count(*)::int as n from public.${table}`)).rows[0].n).toBe(0);
  }
  expect((await pool.query("select count(*)::int as n from public.profiles")).rows[0].n).toBe(4);
});
