/**
 * URL slug format: title-with-hyphens-uuid
 * Parse: extract UUID from end (last 36 chars). Fallback: if whole slug is UUID, use as-is.
 */

const UUID_LEN = 36;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toSlug(title: string, id: string): string {
  const base =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled";
  return `${base}-${id}`;
}

export function parseNodeId(slug: string): string | null {
  if (!slug) return null;
  if (UUID_REGEX.test(slug)) return slug;
  if (slug.length >= UUID_LEN) return slug.slice(-UUID_LEN);
  return null;
}

export function nodeUrl(title: string, id: string): string {
  return `/workspace/${toSlug(title, id)}`;
}
