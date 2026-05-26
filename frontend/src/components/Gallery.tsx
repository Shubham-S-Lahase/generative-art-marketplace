import React, { useState, useEffect, useCallback } from 'react';
import { Search, TrendingUp, Star, Clock, Heart } from 'lucide-react';
import ArtworkCard from './ArtworkCard';
import ArtworkLightbox from './ArtworkLightbox';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { normalizeArtworkCards } from '../utils/artworks';
import type { Artwork } from '../types';

type FeedMode = 'recent' | 'trending' | 'featured' | 'likes';

const Gallery = () => {
  const { currentUser } = useAuth();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [feedMode, setFeedMode] = useState<FeedMode>('recent');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(new Set());
  const [lightboxArtwork, setLightboxArtwork] = useState<Artwork | null>(null);
  const limit = 12;

  const categories = [
    { id: 'all', name: 'All' },
    { id: 'abstract', name: 'Abstract' },
    { id: 'geometric', name: 'Geometric' },
    { id: 'organic', name: 'Organic' },
  ];

  useEffect(() => {
    if (!currentUser) {
      setBookmarkIds(new Set());
      return;
    }
    api.getMyBookmarkIds().then((ids) => setBookmarkIds(new Set(ids.map(String)))).catch(() => {});
  }, [currentUser]);

  const loadArtworks = useCallback(
    async (pageNum: number, append: boolean) => {
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);

        let items: Artwork[] = [];
        let more = false;

        if (feedMode === 'trending') {
          const data = await api.getTrendingArtworks(limit * pageNum);
          items = normalizeArtworkCards(Array.isArray(data) ? data : []);
          more = false;
        } else if (feedMode === 'featured') {
          const data = await api.getFeaturedArtworks(limit * pageNum);
          items = normalizeArtworkCards(Array.isArray(data) ? data : []);
          more = false;
        } else {
          const result = await api.getArtworks({
            q: searchQuery || undefined,
            category: selectedCategory !== 'all' ? selectedCategory : undefined,
            sort: feedMode === 'likes' ? 'likes' : feedMode === 'recent' ? 'recent' : 'popular',
            page: pageNum,
            limit,
          });
          items = normalizeArtworkCards(result.items);
          more = result.hasMore;
        }

        setArtworks((prev) => (append ? [...prev, ...items] : items));
        setHasMore(more);
        setPage(pageNum);
      } catch (error) {
        console.error('Error loading artworks:', error);
        if (!append) setArtworks([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [searchQuery, selectedCategory, feedMode]
  );

  useEffect(() => {
    loadArtworks(1, false);
  }, [loadArtworks]);

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    loadArtworks(page + 1, true);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Discover Artworks</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Explore generative art — filter, bookmark, and open fullscreen previews
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-8">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search artworks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {(
              [
                { id: 'recent' as FeedMode, label: 'Recent', icon: Clock },
                { id: 'trending' as FeedMode, label: 'Trending', icon: TrendingUp },
                { id: 'featured' as FeedMode, label: 'Featured', icon: Star },
                { id: 'likes' as FeedMode, label: 'Most liked', icon: Heart },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFeedMode(id)}
                className={`flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  feedMode === id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                disabled={feedMode === 'trending' || feedMode === 'featured'}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-50'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
          </div>
        ) : artworks.length === 0 ? (
          <p className="text-center text-gray-600 dark:text-gray-300 py-16">No artworks found.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {artworks.map((artwork) => (
                <ArtworkCard
                  key={artwork.id}
                  artwork={artwork}
                  initialBookmarked={bookmarkIds.has(String(artwork.id))}
                  onPreview={setLightboxArtwork}
                />
              ))}
            </div>
            {hasMore && feedMode !== 'trending' && feedMode !== 'featured' && (
              <div className="flex justify-center mt-8">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ArtworkLightbox artwork={lightboxArtwork} onClose={() => setLightboxArtwork(null)} />
    </div>
  );
};

export default Gallery;
