/** Deduplicates concurrent identical GET requests (e.g. React Strict Mode double effects). */
const inflight = new Map<string, Promise<unknown>>();

/** Stable cache key for GET requests with query params. */
export function buildGetCacheKey(path: string, params: Record<string, unknown> = {}): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? `${path}?${JSON.stringify(entries)}` : path;
}

export function invalidateDedupKey(key: string): void {
  inflight.delete(key);
}

export async function dedupedRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = request().finally(() => {
    if (inflight.get(key) === promise) {
      inflight.delete(key);
    }
  });

  inflight.set(key, promise);
  return promise;
}
