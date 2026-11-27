import { randomInt as cryptoRandomInt } from "node:crypto";

export type Pair = { giverId: string; receiverId: string };
export type DrawErrorCode = "TOO_FEW" | "IMPOSSIBLE";

export class DrawError extends Error {
  code: DrawErrorCode;
  constructor(code: DrawErrorCode) {
    super(code);
    this.name = "DrawError";
    this.code = code;
  }
}

const MAX_SHUFFLES = 1000;

/**
 * Decide who buys for whom.
 * Nobody gets themselves, and the two people in an excluded pair never get each other.
 * `randomInt(max)` must return a whole number from 0 up to, but not including, max.
 */
export function drawNames(
  ids: string[],
  excluded: [string, string][] = [],
  randomInt: (max: number) => number = cryptoRandomInt,
): Pair[] {
  const people = [...new Set(ids)];
  if (people.length < 3) throw new DrawError("TOO_FEW");

  const banned = new Set<string>();
  for (const [a, b] of excluded) {
    banned.add(`${a}\u0000${b}`);
    banned.add(`${b}\u0000${a}`);
  }
  const allowed = (giver: string, receiver: string) =>
    giver !== receiver && !banned.has(`${giver}\u0000${receiver}`);

  const shuffle = (items: string[]) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  for (let attempt = 0; attempt < MAX_SHUFFLES; attempt++) {
    const receivers = shuffle(people);
    if (people.every((giver, i) => allowed(giver, receivers[i]))) {
      return people.map((giverId, i) => ({ giverId, receiverId: receivers[i] }));
    }
  }

  // Shuffling kept missing: search every remaining possibility, in a random order.
  const order = shuffle(people);
  const candidates = shuffle(people);
  const taken = new Set<string>();
  const chosen: string[] = [];

  const search = (index: number): boolean => {
    if (index === order.length) return true;
    for (const receiver of candidates) {
      if (taken.has(receiver) || !allowed(order[index], receiver)) continue;
      taken.add(receiver);
      chosen[index] = receiver;
      if (search(index + 1)) return true;
      taken.delete(receiver);
    }
    return false;
  };

  if (!search(0)) throw new DrawError("IMPOSSIBLE");
  return order.map((giverId, i) => ({ giverId, receiverId: chosen[i] }));
}

/**
 * Turn the rows read from the database into what `drawNames` needs.
 * Returns null if either read failed, so a draw never runs without its keep-apart rules.
 */
export function drawInput(
  members: { user_id: string }[] | null,
  exclusions: { user_a: string; user_b: string }[] | null,
): { ids: string[]; pairs: [string, string][] } | null {
  if (!members || !exclusions) return null;
  const ids = members.map((m) => m.user_id);
  const inDraw = new Set(ids);
  const pairs = exclusions
    .filter((e) => inDraw.has(e.user_a) && inDraw.has(e.user_b))
    .map((e) => [e.user_a, e.user_b] as [string, string]);
  return { ids, pairs };
}
