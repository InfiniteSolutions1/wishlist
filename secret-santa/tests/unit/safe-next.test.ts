import { expect, test } from "vitest";
import { safeNext } from "@/lib/safe-next";

test("keeps an in-site path", () => {
  expect(safeNext("/join/abc")).toBe("/join/abc");
});

test.each(["//evil.com", "https://evil.com", "/\\evil.com", "", null, undefined, "join/abc"])(
  "falls back to / for %s",
  (value) => {
    expect(safeNext(value as string | null)).toBe("/");
  },
);
