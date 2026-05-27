import type { SavedSearchFilters } from '../types';

const STORAGE_KEY = 'gam-saved-searches';

export interface LocalSavedSearch {
  id: string;
  name: string;
  filters: SavedSearchFilters;
  createdAt: string;
}

export function getLocalSavedSearches(): LocalSavedSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalSavedSearch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addLocalSavedSearch(name: string, filters: SavedSearchFilters): LocalSavedSearch {
  const item: LocalSavedSearch = {
    id: `local-${Date.now()}`,
    name,
    filters,
    createdAt: new Date().toISOString(),
  };
  const list = [item, ...getLocalSavedSearches()].slice(0, 20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return item;
}

export function deleteLocalSavedSearch(id: string): void {
  const list = getLocalSavedSearches().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
