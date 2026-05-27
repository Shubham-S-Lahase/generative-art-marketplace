const STORAGE_KEY = 'gam-recently-viewed';
const MAX_ITEMS = 20;

export interface RecentViewEntry {
  id: string;
  viewedAt: number;
}

export function getLocalRecentlyViewed(): RecentViewEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentViewEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushLocalRecentlyViewed(artworkId: string): void {
  const id = String(artworkId).trim();
  if (!id) return;
  const now = Date.now();
  const list = getLocalRecentlyViewed().filter((e) => e.id !== id);
  list.unshift({ id, viewedAt: now });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
}

export function getLocalRecentlyViewedIds(limit = 12): string[] {
  return getLocalRecentlyViewed()
    .slice(0, limit)
    .map((e) => e.id);
}
