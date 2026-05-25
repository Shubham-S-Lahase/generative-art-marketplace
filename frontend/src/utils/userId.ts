/** Normalize Mongo/user ids from API (string or { $oid }). */
export function normalizeUserId(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && '$oid' in value) {
    return String((value as { $oid: string }).$oid);
  }
  return String(value);
}

export function isSameUser(
  artworkUserId: unknown,
  currentUser: { id?: string; _id?: string } | null | undefined
): boolean {
  if (!currentUser) return false;
  const ownerId = normalizeUserId(artworkUserId);
  const me = normalizeUserId(currentUser.id ?? currentUser._id);
  return Boolean(ownerId && me && ownerId === me);
}
