"use client";

import { setInDraw } from "@/app/actions/party";

/** Ticking or unticking saves straight away. */
export function InDrawCheckbox({ partyId, userId, checked, name }: { partyId: string; userId: string; checked: boolean; name: string }) {
  return (
    <form action={setInDraw}>
      <input type="hidden" name="partyId" value={partyId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="inDraw" value={checked ? "false" : "true"} />
      <input
        type="checkbox"
        className="h-6 w-6 accent-[#1f6b45]"
        defaultChecked={checked}
        aria-label={`${name} is in the draw`}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      />
    </form>
  );
}
