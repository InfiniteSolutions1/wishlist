import { afterAll, beforeEach, expect, test } from "vitest";
import { as, asService, pairsJson, partyOfThree, pool, resetDb, U1, U2, U3, U4, U5 } from "./helpers";

let partyId: string;
let code: string;
const loop: [string, string][] = [[U1, U2], [U2, U3], [U3, U1]];
const reverse: [string, string][] = [[U1, U3], [U3, U2], [U2, U1]];

const replace = (pairs: [string, string][]) =>
  asService((run) => run("select public.replace_assignments($1, $2::jsonb)", [partyId, pairsJson(pairs)]));
const count = async (table: string) => (await pool.query(`select count(*)::int as n from public.${table} where party_id = $1`, [partyId])).rows[0].n;

beforeEach(async () => {
  await resetDb();
  ({ partyId, code } = await partyOfThree());
});
afterAll(() => pool.end());

test("a draw stores the matches, who took part, and when", async () => {
  await replace(loop);
  expect(await count("assignments")).toBe(3);
  expect(await count("draw_participants")).toBe(3);
  const { rows } = await pool.query("select drawn_at, pairs_changed_at from public.parties where id = $1", [partyId]);
  expect(rows[0].drawn_at).not.toBeNull();
  expect(rows[0].pairs_changed_at).toBeNull();
});

test("a redraw replaces the old matches completely", async () => {
  await replace(loop);
  await replace(reverse);
  expect(await count("assignments")).toBe(3);
  expect(await as(U1, (run) => run("select receiver_id from public.assignments"))).toEqual([{ receiver_id: U3 }]);
});

test("two draws at the same moment leave one consistent set of matches", async () => {
  await Promise.all([replace(loop), replace(reverse), replace(loop), replace(reverse)]);
  const { rows } = await pool.query("select giver_id, receiver_id from public.assignments where party_id = $1", [partyId]);
  expect(rows).toHaveLength(3);
  expect(new Set(rows.map((r) => r.giver_id)).size).toBe(3);
  expect(new Set(rows.map((r) => r.receiver_id)).size).toBe(3);
  const first = rows.find((r) => r.giver_id === U1).receiver_id;
  const expected = first === U2 ? loop : reverse;
  expect(rows.map((r) => `${r.giver_id}>${r.receiver_id}`).sort()).toEqual(expected.map(([g, r]) => `${g}>${r}`).sort());
});

test("a draw that names someone outside the party fails and keeps the old matches", async () => {
  await replace(loop);
  await expect(replace([[U1, U2], [U2, U4], [U4, U1]])).rejects.toThrow(/foreign key/);
  expect(await as(U1, (run) => run("select receiver_id from public.assignments"))).toEqual([{ receiver_id: U2 }]);
  expect(await count("draw_participants")).toBe(3);
});

test("a draw where someone has themselves is rejected by the database", async () => {
  await expect(replace([[U1, U1], [U2, U3], [U3, U2]])).rejects.toThrow(/check constraint/);
});

test("removing a member deletes the matches where they give or receive", async () => {
  await replace(loop);
  await as(U1, (run) => run("delete from public.party_members where party_id = $1 and user_id = $2", [partyId, U2]));
  const { rows } = await pool.query("select giver_id, receiver_id from public.assignments where party_id = $1", [partyId]);
  expect(rows).toEqual([{ giver_id: U3, receiver_id: U1 }]);
  expect(await count("draw_participants")).toBe(2);
});

test("members can see how complete the draw is without seeing any pair", async () => {
  await replace(loop);
  const before = await as(U2, (run) => run("select * from public.draw_status($1)", [partyId]));
  expect(before).toEqual([{ participants: 3, matches: 3 }]);
  await as(U1, (run) => run("delete from public.party_members where party_id = $1 and user_id = $2", [partyId, U3]));
  expect(await as(U2, (run) => run("select * from public.draw_status($1)", [partyId]))).toEqual([{ participants: 2, matches: 1 }]);
});

test("people outside the party cannot read the draw status", async () => {
  await replace(loop);
  await expect(as(U4, (run) => run("select * from public.draw_status($1)", [partyId]))).rejects.toThrow(/member/);
});

test("someone who joins after the draw is a member but not a participant", async () => {
  await replace(loop);
  await as(U5, (run) => run("select public.join_party($1)", [code]));
  const mine = await as(U5, (run) => run("select user_id from public.draw_participants where party_id = $1 and user_id = $2", [partyId, U5]));
  expect(mine).toEqual([]);
  expect(await as(U5, (run) => run("select * from public.assignments"))).toEqual([]);
});

test("members can see who took part in the draw", async () => {
  await replace(loop);
  const rows = await as(U2, (run) => run("select user_id from public.draw_participants where party_id = $1 order by user_id", [partyId]));
  expect(rows.map((r) => r.user_id)).toEqual([U1, U2, U3]);
});
