"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { backWith, isUuid, optional, text } from "@/lib/notice";
import { createServerClient } from "@/lib/supabase/server";
import { normalizeWishUrl } from "@/lib/wish-url";

function wishFields(form: FormData) {
  const rawUrl = text(form, "url", 2100);
  const url = rawUrl ? normalizeWishUrl(rawUrl) : null;
  return {
    fields: { title: text(form, "title", 150), url, price: optional(form, "price", 40), note: optional(form, "note", 500) },
    badUrl: Boolean(rawUrl) && !url,
  };
}

export async function addWish(form: FormData) {
  const user = await requireUser("/me");
  const { fields, badUrl } = wishFields(form);
  if (!fields.title) backWith("/me", "Give your wish a name.");
  if (badUrl) backWith("/me", "That link doesn't look right. It should start with https://");

  const supabase = await createServerClient();
  const { data: last } = await supabase
    .from("wishes")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1);
  const position = (last?.[0]?.position ?? 0) + 1;

  const { error } = await supabase.from("wishes").insert({ ...fields, user_id: user.id, position });
  if (error?.message.includes("100 wishes")) backWith("/me", "A wishlist can hold at most 100 wishes.");
  if (error) backWith("/me", "Couldn't add that wish.");
  revalidatePath("/me");
}

export async function updateWish(form: FormData) {
  const wishId = form.get("wishId");
  const user = await requireUser("/me");
  if (!isUuid(wishId)) backWith("/me", "Wish not found.");
  const { fields, badUrl } = wishFields(form);
  if (!fields.title) backWith("/me", "Give your wish a name.");
  if (badUrl) backWith("/me", "That link doesn't look right. It should start with https://");

  const supabase = await createServerClient();
  await supabase.from("wishes").update(fields).eq("id", wishId).eq("user_id", user.id);
  backWith("/me", "Wish saved.");
}

export async function deleteWish(form: FormData) {
  const wishId = form.get("wishId");
  const user = await requireUser("/me");
  if (!isUuid(wishId)) backWith("/me", "Wish not found.");
  const supabase = await createServerClient();
  await supabase.from("wishes").delete().eq("id", wishId).eq("user_id", user.id);
  revalidatePath("/me");
}

export async function moveWish(form: FormData) {
  const wishId = form.get("wishId");
  const direction = form.get("direction") === "up" ? "up" : "down";
  const user = await requireUser("/me");
  if (!isUuid(wishId)) backWith("/me", "Wish not found.");

  const supabase = await createServerClient();
  const { data: wishes } = await supabase
    .from("wishes")
    .select("id, position")
    .eq("user_id", user.id)
    .order("position")
    .order("created_at");
  const list = wishes ?? [];
  const index = list.findIndex((w) => w.id === wishId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= list.length) return;

  [list[index], list[swapWith]] = [list[swapWith], list[index]];
  // Renumber from 1 so positions stay distinct.
  await Promise.all(
    list.map((wish, i) =>
      wish.position === i + 1
        ? null
        : supabase.from("wishes").update({ position: i + 1 }).eq("id", wish.id).eq("user_id", user.id),
    ),
  );
  revalidatePath("/me");
}
