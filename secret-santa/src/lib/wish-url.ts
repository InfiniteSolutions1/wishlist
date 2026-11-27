const MAX_URL = 2000;

/** Returns a safe http(s) link, or null if the text is not one. */
export function normalizeWishUrl(input: string): string | null {
  const text = input.trim();
  if (!text || text.length > MAX_URL || /\s/.test(text)) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  const candidate = hasScheme ? text : `https://${text}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".")) return null;
  return candidate;
}
