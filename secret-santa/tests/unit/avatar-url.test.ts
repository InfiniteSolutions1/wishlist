import { expect, test } from "vitest";
import { avatarUrl, initials } from "@/lib/avatar";

const base = "https://proj.supabase.co";

test("an uploaded picture wins", () => {
  expect(avatarUrl({ avatar_path: "u1/abc.png", google_avatar_url: "https://g/p.jpg" }, base)).toBe(
    "https://proj.supabase.co/storage/v1/object/public/avatars/u1/abc.png",
  );
});

test("falls back to the Google picture", () => {
  expect(avatarUrl({ avatar_path: null, google_avatar_url: "https://g/p.jpg" }, base)).toBe("https://g/p.jpg");
});

test("no picture at all gives null", () => {
  expect(avatarUrl({ avatar_path: null, google_avatar_url: null }, base)).toBeNull();
});

test("a non-https Google picture is ignored", () => {
  expect(avatarUrl({ avatar_path: null, google_avatar_url: "javascript:x" }, base)).toBeNull();
});

test("initials use the first and last name", () => {
  expect(initials("Sam Rivera")).toBe("SR");
  expect(initials("  cher ")).toBe("C");
  expect(initials("")).toBe("?");
});
