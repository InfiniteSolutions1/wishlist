"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { backWith, text } from "@/lib/notice";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

const AVATAR_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif)$/i;

export async function updateName(form: FormData) {
  const user = await requireUser("/me");
  const name = text(form, "name", 60);
  if (!name) backWith("/me", "Your name can't be empty.");
  const supabase = await createServerClient();
  await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
  backWith("/me", "Name saved.");
}

/** Called after the browser has uploaded a picture into the person's own folder. */
export async function setAvatar(path: string): Promise<{ ok: boolean }> {
  const user = await requireUser("/me");
  if (!AVATAR_PATH.test(path) || !path.startsWith(`${user.id}/`)) return { ok: false };

  const supabase = await createServerClient();
  const { data: before } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
  if (error) return { ok: false };
  if (before?.avatar_path && before.avatar_path !== path) {
    await supabase.storage.from("avatars").remove([before.avatar_path]);
  }
  revalidatePath("/me");
  return { ok: true };
}

export async function removeAvatar() {
  const user = await requireUser("/me");
  const supabase = await createServerClient();
  const { data: before } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
  await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
  if (before?.avatar_path) await supabase.storage.from("avatars").remove([before.avatar_path]);
  backWith("/me", "Picture removed.");
}

export async function deleteAccount(form: FormData) {
  const user = await requireUser("/me");
  if (text(form, "confirm", 10).toUpperCase() !== "DELETE") {
    backWith("/me", "Type DELETE to confirm.");
  }

  const supabase = await createServerClient();
  const { data: files } = await supabase.storage.from("avatars").list(user.id);
  if (files?.length) {
    await supabase.storage.from("avatars").remove(files.map((file) => `${user.id}/${file.name}`));
  }

  // Deleting the sign-in removes the profile, wishes, memberships, matches and owned parties with it.
  // The id comes from the verified session, never from the form.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) backWith("/me", "Couldn't delete your account. Please try again.");

  await supabase.auth.signOut();
  redirect(`/?notice=${encodeURIComponent("Your account and everything in it has been deleted.")}`);
}
