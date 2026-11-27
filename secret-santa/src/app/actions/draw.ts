"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { DrawError, drawNames } from "@/lib/draw";
import { backWith, isUuid } from "@/lib/notice";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export async function runDraw(form: FormData) {
  const partyId = form.get("partyId");
  if (!isUuid(partyId)) redirect("/");
  const manage = `/party/${partyId}/manage`;
  const user = await requireUser(manage);

  // Everything is read as the signed-in person, so the database decides what they may see.
  const supabase = await createServerClient();
  const { data: party } = await supabase.from("parties").select("owner_id").eq("id", partyId).maybeSingle();
  if (!party || party.owner_id !== user.id) backWith(manage, "Only the organizer can draw names.");

  const [{ data: members }, { data: exclusions }] = await Promise.all([
    supabase.from("party_members").select("user_id").eq("party_id", partyId).eq("in_draw", true),
    supabase.from("exclusions").select("user_a, user_b").eq("party_id", partyId),
  ]);

  const ids = (members ?? []).map((m) => m.user_id as string);
  const inDraw = new Set(ids);
  const pairs = (exclusions ?? [])
    .filter((e) => inDraw.has(e.user_a) && inDraw.has(e.user_b))
    .map((e) => [e.user_a, e.user_b] as [string, string]);

  let result;
  try {
    result = drawNames(ids, pairs);
  } catch (error) {
    if (error instanceof DrawError && error.code === "TOO_FEW") {
      backWith(manage, "You need at least 3 people to draw names.");
    }
    if (error instanceof DrawError) {
      backWith(manage, "These rules leave no possible draw — remove a pair or add people.");
    }
    throw error;
  }

  // The only write that needs the secret key. The pairs are never logged.
  const admin = createAdminClient();
  const { error } = await admin.rpc("replace_assignments", {
    p_party: partyId,
    p_pairs: result.map((pair) => ({ giver_id: pair.giverId, receiver_id: pair.receiverId })),
  });
  if (error) backWith(manage, "The draw couldn't be saved. Please try again.");

  backWith(manage, `Names drawn for ${result.length} people.`);
}
