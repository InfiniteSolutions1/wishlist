"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { backWith, isUuid, optional, text } from "@/lib/notice";
import { createServerClient } from "@/lib/supabase/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function partyFields(form: FormData) {
  const date = text(form, "exchangeDate", 10);
  return {
    name: text(form, "name", 80),
    budget: optional(form, "budget", 40),
    exchange_date: DATE.test(date) ? date : null,
    note: optional(form, "note", 500),
  };
}

export async function createParty(form: FormData) {
  const user = await requireUser("/");
  const fields = partyFields(form);
  if (!fields.name) backWith("/", "Give your party a name.");

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("parties")
    .insert({ ...fields, owner_id: user.id })
    .select("id")
    .single();
  if (error || !data) backWith("/", "Couldn't start the party. Please try again.");
  redirect(`/party/${data!.id}/manage`);
}

export async function updateParty(form: FormData) {
  const partyId = form.get("partyId");
  if (!isUuid(partyId)) redirect("/");
  const manage = `/party/${partyId}/manage`;
  await requireUser(manage);
  const fields = partyFields(form);
  if (!fields.name) backWith(manage, "Give your party a name.");

  const supabase = await createServerClient();
  const { data } = await supabase.from("parties").update(fields).eq("id", partyId).select("id");
  if (!data?.length) backWith(manage, "Only the organizer can change the party.");
  revalidatePath(manage);
  backWith(manage, "Saved.");
}

export async function deleteParty(form: FormData) {
  const partyId = form.get("partyId");
  if (!isUuid(partyId)) redirect("/");
  await requireUser("/");
  const supabase = await createServerClient();
  const { data } = await supabase.from("parties").delete().eq("id", partyId).select("id");
  if (!data?.length) backWith(`/party/${partyId}`, "Only the organizer can delete the party.");
  backWith("/", "Party deleted.");
}

export async function resetInviteCode(form: FormData) {
  const partyId = form.get("partyId");
  if (!isUuid(partyId)) redirect("/");
  const manage = `/party/${partyId}/manage`;
  await requireUser(manage);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("reset_invite_code", { p: partyId });
  backWith(manage, error ? "Only the organizer can reset the link." : "New invite link ready. The old one no longer works.");
}

export async function joinParty(form: FormData) {
  const code = text(form, "code", 64);
  const here = `/join/${encodeURIComponent(code)}`;
  await requireUser(here);
  const supabase = await createServerClient();
  const { data: partyId } = await supabase.rpc("join_party", { p_code: code });
  if (!isUuid(partyId)) backWith(here, "This invite link is no longer valid.");
  redirect(`/party/${partyId}`);
}

export async function setInDraw(form: FormData) {
  const partyId = form.get("partyId");
  const userId = form.get("userId");
  if (!isUuid(partyId) || !isUuid(userId)) redirect("/");
  const manage = `/party/${partyId}/manage`;
  await requireUser(manage);
  const supabase = await createServerClient();
  await supabase
    .from("party_members")
    .update({ in_draw: form.get("inDraw") === "true" })
    .eq("party_id", partyId)
    .eq("user_id", userId);
  revalidatePath(manage);
}

export async function removeMember(form: FormData) {
  const partyId = form.get("partyId");
  const userId = form.get("userId");
  if (!isUuid(partyId) || !isUuid(userId)) redirect("/");
  const manage = `/party/${partyId}/manage`;
  await requireUser(manage);
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("party_members")
    .delete()
    .eq("party_id", partyId)
    .eq("user_id", userId)
    .select("user_id");
  backWith(manage, data?.length ? "Removed from the party." : "That person couldn't be removed.");
}

export async function leaveParty(form: FormData) {
  const partyId = form.get("partyId");
  if (!isUuid(partyId)) redirect("/");
  const user = await requireUser("/");
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("party_members")
    .delete()
    .eq("party_id", partyId)
    .eq("user_id", user.id)
    .select("user_id");
  if (!data?.length) backWith(`/party/${partyId}`, "The organizer can't leave. Delete the party instead.");
  backWith("/", "You left the party.");
}

export async function addExclusion(form: FormData) {
  const partyId = form.get("partyId");
  const first = form.get("userA");
  const second = form.get("userB");
  if (!isUuid(partyId)) redirect("/");
  const manage = `/party/${partyId}/manage`;
  await requireUser(manage);
  if (!isUuid(first) || !isUuid(second)) backWith(manage, "Pick two people.");
  if (first === second) backWith(manage, "Pick two different people.");

  const [user_a, user_b] = [first as string, second as string].sort();
  const supabase = await createServerClient();
  const { error } = await supabase.from("exclusions").insert({ party_id: partyId, user_a, user_b });
  if (error?.code === "23505") backWith(manage, "That pair is already kept apart.");
  if (error) backWith(manage, "Couldn't add that pair.");
  revalidatePath(manage);
}

export async function removeExclusion(form: FormData) {
  const partyId = form.get("partyId");
  const userA = form.get("userA");
  const userB = form.get("userB");
  if (!isUuid(partyId) || !isUuid(userA) || !isUuid(userB)) redirect("/");
  const manage = `/party/${partyId}/manage`;
  await requireUser(manage);
  const supabase = await createServerClient();
  await supabase.from("exclusions").delete().eq("party_id", partyId).eq("user_a", userA).eq("user_b", userB);
  revalidatePath(manage);
}
