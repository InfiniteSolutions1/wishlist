import type { ReactNode } from "react";
import { comparePricesUrl } from "@/lib/compare-prices";
import type { Wish } from "@/lib/types";
import { normalizeWishUrl } from "@/lib/wish-url";

export function WishCard({ wish, children }: { wish: Wish; children?: ReactNode }) {
  // Checked again on the way out, so a bad link in the database is never rendered.
  const link = wish.url ? normalizeWishUrl(wish.url) : null;
  const compare = comparePricesUrl(wish.title);
  return (
    <li className="rounded-lg border-2 border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-lg font-bold break-words">{wish.title}</h3>
        {wish.price ? <span className="font-semibold text-pine">{wish.price}</span> : null}
      </div>
      {wish.note ? <p className="mt-1 whitespace-pre-line break-words text-gray-700">{wish.note}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn-quiet">
            Open link ↗
          </a>
        ) : null}
        {compare ? (
          <a href={compare} target="_blank" rel="noopener noreferrer" className="btn-quiet">
            Compare prices ↗
          </a>
        ) : null}
      </div>
      {children}
    </li>
  );
}
