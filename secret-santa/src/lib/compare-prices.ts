const MAX_QUERY = 150;

/** A shopping-search link for a wish, or null when there is nothing to search for. */
export function comparePricesUrl(title: string): string | null {
  const query = Array.from(title.trim().replace(/\s+/g, " ")).slice(0, MAX_QUERY).join("").trim();
  if (!query) return null;
  return `https://www.google.com/search?udm=28&q=${encodeURIComponent(query)}`;
}
