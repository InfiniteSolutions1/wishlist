import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
export const pool = new pg.Pool({ connectionString: url, max: 8 });

export const U1 = "00000000-0000-4000-8000-000000000001"; // organizer
export const U2 = "00000000-0000-4000-8000-000000000002";
export const U3 = "00000000-0000-4000-8000-000000000003";
export const U4 = "00000000-0000-4000-8000-000000000004"; // never invited
export const U5 = "00000000-0000-4000-8000-000000000005";

type Run = <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]) => Promise<T[]>;

/** Rebuild the database from the shim and the real migration files. */
export async function resetDb() {
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  await pool.query(readFileSync(path.resolve(__dirname, "shim.sql"), "utf8"));
  for (const file of readdirSync(dir).sort()) {
    await pool.query(readFileSync(path.join(dir, file), "utf8"));
  }
  const people: [string, string][] = [[U1, "Olive Organizer"], [U2, "Sam Rivera"], [U3, "Alex Kim"], [U4, "Stranger Dan"], [U5, "Eve Late"]];
  for (const [id, name] of people) {
    await pool.query("insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3, $4)", [
      id,
      `${id}@example.test`,
      { full_name: name, avatar_url: `https://pics.example.test/${id}.jpg` },
      { provider: "google" },
    ]);
  }
}

async function withRole<T>(role: string, sub: string | null, fn: (run: Run) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(sub ? { sub } : {})]);
    const result = await fn(async (sql, params) => (await client.query(sql, params as never[])).rows as never);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Run queries exactly as a signed-in person would through the Supabase API. */
export const as = <T>(userId: string, fn: (run: Run) => Promise<T>) => withRole("authenticated", userId, fn);
export const asAnon = <T>(fn: (run: Run) => Promise<T>) => withRole("anon", null, fn);
/** Run queries as the server does with the service key. */
export const asService = <T>(fn: (run: Run) => Promise<T>) => withRole("service_role", null, fn);

/** Olive creates a party; Sam and Alex join with the invite link. */
export async function partyOfThree(): Promise<{ partyId: string; code: string }> {
  const partyId = await as(U1, async (run) => {
    const [row] = await run<{ id: string }>(
      "insert into public.parties (name, owner_id, budget) values ('Family', $1, '$25') returning id",
      [U1],
    );
    return row.id;
  });
  const code = await as(U1, async (run) => (await run<{ code: string }>("select public.party_invite_code($1) as code", [partyId]))[0].code);
  for (const user of [U2, U3]) {
    await as(user, (run) => run("select public.join_party($1)", [code]));
  }
  return { partyId, code };
}

export const pairsJson = (pairs: [string, string][]) =>
  JSON.stringify(pairs.map(([giver_id, receiver_id]) => ({ giver_id, receiver_id })));
