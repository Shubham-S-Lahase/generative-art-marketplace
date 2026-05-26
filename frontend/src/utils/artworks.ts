import { getImageUrl } from './helpers';
import type { Artwork } from '../types';

export interface ArtworkListResult {
  items: Artwork[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export function normalizeArtworkList(data: unknown): ArtworkListResult {
  if (Array.isArray(data)) {
    return {
      items: data as Artwork[],
      total: data.length,
      page: 1,
      limit: data.length,
      hasMore: false,
    };
  }
  const d = data as ArtworkListResult;
  return {
    items: d?.items || [],
    total: d?.total ?? 0,
    page: d?.page ?? 1,
    limit: d?.limit ?? 20,
    hasMore: d?.hasMore ?? false,
  };
}

export function normalizeArtworkCard(a: Artwork): Artwork {
  return {
    ...a,
    id: a.id || a._id,
    files: { preview: getImageUrl(a.previewUrl || a.imageUrl) },
    previewUrl: getImageUrl(a.previewUrl || a.imageUrl),
    imageUrl: getImageUrl(a.imageUrl || a.previewUrl),
  };
}

export function normalizeArtworkCards(list: Artwork[]): Artwork[] {
  return (Array.isArray(list) ? list : []).map(normalizeArtworkCard);
}
