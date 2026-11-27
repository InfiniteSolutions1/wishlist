import Link from "next/link";
import { Shell } from "@/components/Shell";

export default function NotFound() {
  return (
    <Shell signedIn={false}>
      <div className="text-center">
        <h1 className="christmas-font text-5xl font-bold text-santa">Nothing here</h1>
        <p className="mt-4 text-lg">That page doesn't exist, or you're not part of that party.</p>
        <p className="mt-6">
          <Link href="/" className="btn-christmas">
            Back to the start
          </Link>
        </p>
      </div>
    </Shell>
  );
}
