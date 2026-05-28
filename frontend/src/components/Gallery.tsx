import React, { useState, useEffect, useCallback } from 'react';
import { Search, TrendingUp, Star, Clock, Heart, Palette, X, Hash, BookmarkPlus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import ArtworkCard from './ArtworkCard';
import ArtworkLightbox from './ArtworkLightbox';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { normalizeArtworkCards } from '../utils/artworks';
import { getLocalRecentlyViewedIds } from '../utils/recentlyViewed';
import { getImageUrl } from '../utils/helpers';
import type { Artwork, TrendingTag, PopularSearch, SavedSearch, SavedSearchFilters } from '../types';
import {
  getLocalSavedSearches,
  addLocalSavedSearch,
  deleteLocalSavedSearch,
  type LocalSavedSearch,
} from '../utils/savedSearches';

type FeedMode = 'recent' | 'trending' | 'featured' | 'likes';

const Gallery = () => {
  const { currentUser } = useAuth();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [trendingTags, setTrendingTags] = useState<TrendingTag[]>([]);
  const [popularSearches, setPopularSearches] = useState<PopularSearch[]>([]);
  const [savedSearches, setSavedSearches] = useState<(SavedSearch | LocalSavedSearch)[]>([]);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [feedMode, setFeedMode] = useState<FeedMode>('recent');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(new Set());
  const [lightboxArtwork, setLightboxArtwork] = useState<Artwork | null>(null);
  const [recentlyViewed, setRecentlyViewed] = useState<Artwork[]>([]);
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [colorTolerance, setColorTolerance] = useState(35);
  const limit = 12;

  const colorPresets = [
    { name: 'Coral', hex: '#FF6B6B' },
    { name: 'Teal', hex: '#4ECDC4' },
    { name: 'Sky', hex: '#45B7D1' },
    { name: 'Indigo', hex: '#6366f1' },
    { name: 'Emerald', hex: '#10b981' },
    { name: 'Amber', hex: '#f59e0b' },
    { name: 'Rose', hex: '#f72585' },
    { name: 'Slate', hex: '#64748b' },
  ];

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

  const currentFilters = (): SavedSearchFilters => ({
    q: searchQuery || undefined,
    tags: selectedTags || undefined,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    feedMode,
    color: colorFilter || undefined,
    colorTolerance: colorFilter ? colorTolerance : undefined,
  });

  const applyFilters = (filters: SavedSearchFilters) => {
    setSearchQuery(filters.q || '');
    setSelectedTags(filters.tags || '');
    setSelectedCategory(filters.category || 'all');
    setColorFilter(filters.color || null);
    if (filters.colorTolerance != null) setColorTolerance(filters.colorTolerance);
    if (filters.feedMode) setFeedMode(filters.feedMode as FeedMode);
  };

  const loadSavedSearches = useCallback(async () => {
    if (currentUser) {
      try {
        const data = await api.getSavedSearches();
        setSavedSearches(Array.isArray(data) ? data : []);
      } catch {
        setSavedSearches([]);
      }
    } else {
      setSavedSearches(getLocalSavedSearches());
    }
  }, [currentUser]);

  useEffect(() => {
    api.getTrendingTags(12).then((data) => setTrendingTags(Array.isArray(data) ? data : [])).catch(() => {});
    api.getPopularSearches(8).then((data) => setPopularSearches(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    loadSavedSearches();
  }, [loadSavedSearches]);

  useEffect(() => {
    const loadRecent = async () => {
      try {
        if (currentUser) {
          const data = await api.getRecentlyViewed(8);
          setRecentlyViewed(normalizeArtworkCards(Array.isArray(data) ? data : []));
          return;
        }
        const ids = getLocalRecentlyViewedIds(8);
        if (ids.length === 0) {
          setRecentlyViewed([]);
          return;
        }
        const result = await api.getArtworks({ ids: ids.join(','), limit: 8 });
        const byId = new Map(result.items.map((a) => [String(a.id || a._id), a]));
        const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Artwork[];
        setRecentlyViewed(normalizeArtworkCards(ordered));
      } catch {
        setRecentlyViewed([]);
      }
    };
    loadRecent();
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
        } else if (colorFilter) {
          const result = await api.searchArtworksByColor({
            color: colorFilter,
            tolerance: colorTolerance,
            page: pageNum,
            limit,
          });
          items = normalizeArtworkCards(result.items);
          more = result.hasMore;
        } else {
          const result = await api.getArtworks({
            q: searchQuery || undefined,
            tags: selectedTags || undefined,
            category: selectedCategory !== 'all' ? selectedCategory : undefined,
            sort: feedMode === 'likes' ? 'likes' : feedMode === 'recent' ? 'recent' : 'popular',
            page: pageNum,
            limit,
          });
          if (pageNum === 1 && (searchQuery.trim() || selectedTags)) {
            api
              .recordSearch({
                query: searchQuery.trim() || undefined,
                tags: selectedTags || undefined,
                category: selectedCategory !== 'all' ? selectedCategory : undefined,
              })
              .catch(() => {});
          }
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
    [searchQuery, selectedTags, selectedCategory, feedMode, colorFilter, colorTolerance]
  );

  const handleSaveSearch = async () => {
    const name = saveSearchName.trim();
    if (!name) return;
    const filters = currentFilters();
    if (currentUser) {
      await api.createSavedSearch(name, filters);
    } else {
      addLocalSavedSearch(name, filters);
    }
    setSaveSearchName('');
    setShowSaveSearch(false);
    loadSavedSearches();
  };

  const handleDeleteSavedSearch = async (id: string) => {
    if (currentUser) {
      await api.deleteSavedSearch(id);
    } else {
      deleteLocalSavedSearch(id);
    }
    loadSavedSearches();
  };

  const applyTag = (tag: string) => {
    setSelectedTags(tag);
    setSearchQuery('');
    setColorFilter(null);
    setFeedMode('recent');
  };

  const applyPopularSearch = (query: string) => {
    setSearchQuery(query);
    setSelectedTags('');
    setColorFilter(null);
    setFeedMode('recent');
  };

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

        {recentlyViewed.length > 0 && !colorFilter && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recently viewed</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {recentlyViewed.map((artwork) => (
                <Link
                  key={String(artwork.id || artwork._id)}
                  to={`/artwork/${String(artwork.id || artwork._id)}`}
                  className="group min-w-[180px] max-w-[180px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  <img
                    src={getImageUrl(artwork.files?.preview || artwork.previewUrl || artwork.imageUrl)}
                    alt={artwork.title || 'Artwork'}
                    className="w-full h-28 object-cover bg-gray-100 dark:bg-gray-700"
                  />
                  <div className="p-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {artwork.title || 'Untitled'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                      by {artwork.username || 'Unknown'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-8">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search artworks..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value) setSelectedTags('');
              }}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {(trendingTags.length > 0 || popularSearches.length > 0) && (
            <div className="mb-4 space-y-3">
              {trendingTags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    Trending tags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {trendingTags.map(({ tag, count }) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => applyTag(tag)}
                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                          selectedTags === tag
                            ? 'bg-indigo-600 text-white'
                            : 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100'
                        }`}
                      >
                        #{tag}
                        <span className="ml-1 opacity-70 text-xs">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {popularSearches.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Popular searches
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {popularSearches.map(({ query }) => (
                      <button
                        key={query}
                        type="button"
                        onClick={() => applyPopularSearch(query)}
                        className="px-3 py-1 rounded-full text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSaveSearch((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
            >
              <BookmarkPlus className="h-4 w-4" />
              Save search
            </button>
            {selectedTags && (
              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                Tag filter: #{selectedTags}
                <button type="button" className="ml-2 underline" onClick={() => setSelectedTags('')}>
                  clear
                </button>
              </span>
            )}
          </div>

          {showSaveSearch && (
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                placeholder="Name this search…"
                value={saveSearchName}
                onChange={(e) => setSaveSearchName(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              />
              <button
                type="button"
                onClick={handleSaveSearch}
                disabled={!saveSearchName.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}

          {savedSearches.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Saved searches</p>
              <div className="flex flex-wrap gap-2">
                {savedSearches.map((s) => {
                  const sid = String(s.id || (s as LocalSavedSearch).id || (s as SavedSearch)._id);
                  return (
                    <div
                      key={sid}
                      className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-sm bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200"
                    >
                      <button type="button" onClick={() => applyFilters(s.filters)}>
                        {s.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedSearch(sid)}
                        className="p-1 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-800/50"
                        aria-label={`Delete saved search ${s.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="h-4 w-4 text-indigo-600" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Search by color</span>
              {colorFilter && (
                <button
                  type="button"
                  onClick={() => setColorFilter(null)}
                  className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              {colorPresets.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  title={preset.name}
                  onClick={() => {
                    setColorFilter(preset.hex);
                    setFeedMode('recent');
                  }}
                  className={`w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 ${
                    colorFilter === preset.hex
                      ? 'border-indigo-600 ring-2 ring-indigo-300'
                      : 'border-white dark:border-gray-600 shadow-sm'
                  }`}
                  style={{ backgroundColor: preset.hex }}
                />
              ))}
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span>Custom</span>
                <input
                  type="color"
                  value={colorFilter || '#6366f1'}
                  onChange={(e) => {
                    setColorFilter(e.target.value);
                    setFeedMode('recent');
                  }}
                  className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
                />
              </label>
            </div>
            {colorFilter && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Match tolerance: {colorTolerance}°
                </label>
                <input
                  type="range"
                  min={10}
                  max={80}
                  value={colorTolerance}
                  onChange={(e) => setColorTolerance(Number(e.target.value))}
                  className="flex-1 accent-indigo-600"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                disabled={feedMode === 'trending' || feedMode === 'featured' || !!colorFilter}
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
