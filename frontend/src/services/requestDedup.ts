/** Deduplicates concurrent identical GET requests (e.g. React Strict Mode double effects). */
const inflight = new Map<string, Promise<unknown>>();

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
