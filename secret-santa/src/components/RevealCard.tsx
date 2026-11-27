"use client";

import { useState, type ReactNode } from "react";

/** Keeps the match covered until tapped, so nobody reads it over a shoulder. */
export function RevealCard({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-christmas w-full py-8 text-xl">
        🎁 Tap to reveal
      </button>
    );
  }
  return (
    <div>
      {children}
      <button type="button" onClick={() => setOpen(false)} className="btn-quiet mt-4">
        Hide again
      </button>
    </div>
  );
}
