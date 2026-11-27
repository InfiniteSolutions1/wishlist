import { expect, test } from "vitest";
import { drawInput, drawNames, DrawError } from "@/lib/draw";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const sorted = (xs: string[]) => [...xs].sort();

test.each([3, 4, 7, 20])("with %i people everyone gives once, receives once, and nobody has themselves", (n) => {
  const people = ids(n);
  for (let run = 0; run < 200; run++) {
    const pairs = drawNames(people);
    expect(sorted(pairs.map((p) => p.giverId))).toEqual(sorted(people));
    expect(sorted(pairs.map((p) => p.receiverId))).toEqual(sorted(people));
    expect(pairs.every((p) => p.giverId !== p.receiverId)).toBe(true);
  }
});

test("couples never draw each other", () => {
  const people = ["a", "b", "c", "d", "e", "f"];
  const banned = new Set(["a>b", "b>a", "c>d", "d>c"]);
  for (let run = 0; run < 500; run++) {
    const pairs = drawNames(people, [["a", "b"], ["d", "c"]]);
    expect(pairs.some((p) => banned.has(`${p.giverId}>${p.receiverId}`))).toBe(false);
  }
});

test("two couples can still draw, and every possible outcome turns up", () => {
  const seen = new Set<string>();
  for (let run = 0; run < 2000; run++) {
    const pairs = drawNames(["a", "b", "c", "d"], [["a", "b"], ["c", "d"]]);
    expect(pairs).toHaveLength(4);
    seen.add(sorted(pairs.map((p) => `${p.giverId}>${p.receiverId}`)).join(","));
  }
  expect(seen.size).toBe(4);
});

test.each([[[]], [["a"]], [["a", "b"]]])("fewer than three people is refused: %j", (people) => {
  expect(() => drawNames(people)).toThrowError(DrawError);
  try {
    drawNames(people);
  } catch (e) {
    expect((e as DrawError).code).toBe("TOO_FEW");
  }
});

test("duplicate ids are collapsed", () => {
  expect(drawNames(["a", "a", "b", "c"])).toHaveLength(3);
});

test("rules that leave no possible draw are refused", () => {
  try {
    drawNames(["a", "b", "c"], [["a", "b"]]);
    expect.unreachable();
  } catch (e) {
    expect(e).toBeInstanceOf(DrawError);
    expect((e as DrawError).code).toBe("IMPOSSIBLE");
  }
});

test("a hard but possible set of rules is still solved", () => {
  // a may only give to d; found by the fallback search if shuffling misses it
  const pairs = drawNames(["a", "b", "c", "d"], [["a", "b"], ["a", "c"]]);
  expect(pairs.find((p) => p.giverId === "a")!.receiverId).toBe("d");
});

test("the same random source gives the same draw", () => {
  const fixed = () => 0;
  expect(drawNames(ids(6), [], fixed)).toEqual(drawNames(ids(6), [], fixed));
});

test("draw input uses only people who are in, and only pairs between them", () => {
  const input = drawInput(
    [{ user_id: "a" }, { user_id: "b" }, { user_id: "c" }],
    [{ user_a: "a", user_b: "b" }, { user_a: "a", user_b: "gone" }],
  );
  expect(input).toEqual({ ids: ["a", "b", "c"], pairs: [["a", "b"]] });
});

test("if the members or the keep-apart pairs could not be loaded, there is no draw", () => {
  expect(drawInput(null, [])).toBeNull();
  expect(drawInput([{ user_id: "a" }], null)).toBeNull();
});
