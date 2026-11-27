import { avatarUrl, initials, type AvatarSource } from "@/lib/avatar";

const SIZES = { sm: "h-9 w-9 text-sm", md: "h-14 w-14 text-lg", lg: "h-28 w-28 text-4xl" } as const;

export function Avatar({ person, size = "md" }: { person: AvatarSource & { display_name: string }; size?: keyof typeof SIZES }) {
  const src = avatarUrl(person);
  const frame = `${SIZES[size]} shrink-0 rounded-full border-2 border-santa bg-pine/10 object-cover`;
  if (src) {
    // Pictures come from Google or our own storage; a plain <img> avoids listing every Google image host.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" referrerPolicy="no-referrer" className={frame} />;
  }
  return (
    <span aria-hidden="true" className={`${frame} inline-flex items-center justify-center font-bold text-pine`}>
      {initials(person.display_name)}
    </span>
  );
}
