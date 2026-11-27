import { expect, test } from "vitest";
import { comparePricesUrl } from "@/lib/compare-prices";

const query = (url: string | null) => new URL(url!).searchParams.get("q");

test("special characters survive the round trip", () => {
  const title = "LEGO Star Wars & Friends #75192?";
  expect(query(comparePricesUrl(title))).toBe(title);
});

test("emoji survive the round trip", () => {
  expect(query(comparePricesUrl("Cosy socks 🧦"))).toBe("Cosy socks 🧦");
});

test("long titles are cut to 150 characters", () => {
  expect(query(comparePricesUrl("a".repeat(400)))).toHaveLength(150);
});

test("whitespace is trimmed and collapsed", () => {
  expect(query(comparePricesUrl("  red   kettle \n 1.7L "))).toBe("red kettle 1.7L");
});

test("an empty title gives no link", () => {
  expect(comparePricesUrl("   ")).toBeNull();
});

test("opens a Google Shopping search", () => {
  const url = new URL(comparePricesUrl("kettle")!);
  expect(url.origin + url.pathname).toBe("https://www.google.com/search");
  expect(url.searchParams.get("udm")).toBe("28");
});
