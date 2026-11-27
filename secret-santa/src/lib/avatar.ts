export type AvatarSource = { avatar_path: string | null; google_avatar_url: string | null };

/** The picture to show for a person: their upload, else their Google picture, else none. */
export function avatarUrl(
  profile: AvatarSource,
  supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
): string | null {
  if (profile.avatar_path) {
    return `${supabaseUrl}/storage/v1/object/public/avatars/${profile.avatar_path}`;
  }
  if (profile.google_avatar_url?.startsWith("https://")) return profile.google_avatar_url;
  return null;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return (first + last).toUpperCase();
}
