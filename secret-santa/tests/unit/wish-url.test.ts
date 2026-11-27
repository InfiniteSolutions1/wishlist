import { expect, test } from "vitest";
import { normalizeWishUrl } from "@/lib/wish-url";

test("keeps an https link", () => {
  expect(normalizeWishUrl("https://a.com/x?y=1")).toBe("https://a.com/x?y=1");
});

test("keeps an http link", () => {
  expect(normalizeWishUrl("http://a.com/x")).toBe("http://a.com/x");
});

test("adds https to a bare domain", () => {
  expect(normalizeWishUrl("  a.com/x ")).toBe("https://a.com/x");
});

test.each(["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "ftp://a.com", "", "   ", "not a link", "https://"])(
  "rejects %s",
  (value) => {
    expect(normalizeWishUrl(value)).toBeNull();
  },
);

test("rejects links longer than 2000 characters", () => {
  expect(normalizeWishUrl("https://a.com/" + "x".repeat(2000))).toBeNull();
});
