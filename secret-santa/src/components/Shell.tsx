import Link from "next/link";
import type { ReactNode } from "react";

/** The white card every page sits in, with the top navigation for signed-in people. */
export function Shell({ children, signedIn = true }: { children: ReactNode; signedIn?: boolean }) {
  return (
    <div className="relative z-10 mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      {signedIn ? (
        <nav className="mb-4 flex flex-wrap items-center justify-between gap-3 text-white" aria-label="Main">
          <Link href="/" className="christmas-font text-3xl font-bold">
            Secret Santa
          </Link>
          <div className="flex items-center gap-4 font-semibold">
            <Link href="/" className="underline-offset-4 hover:underline">
              Parties
            </Link>
            <Link href="/me" className="underline-offset-4 hover:underline">
              My wishlist
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="cursor-pointer underline-offset-4 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </nav>
      ) : null}
      <main className="christmas-card p-5 sm:p-8">{children}</main>
    </div>
  );
}
