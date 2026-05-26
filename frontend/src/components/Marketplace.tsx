import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Filter, Crown, CheckCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { getImageUrl } from '../utils/helpers';
import { normalizeArtworkCards } from '../utils/artworks';
import ArtworkLightbox from './ArtworkLightbox';
import MockCheckoutModal from './MockCheckoutModal';
import { isSameUser } from '../utils/userId';

const Marketplace = () => {
  const { currentUser } = useAuth();
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [ownedArtworkIds, setOwnedArtworkIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    priceRange: 'all',
    license: 'all',
    sortBy: 'recent',
    tags: '',
    dateFrom: '',
    dateTo: '',
  });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(new Set());
  const [lightboxArtwork, setLightboxArtwork] = useState(null);
  const limit = 12;

  const loadOwnedArtworks = useCallback(async () => {
    if (!currentUser) {
      setOwnedArtworkIds(new Set());
      return;
    }
    try {
      const purchases = await api.getMyPurchases();
      const ids = new Set(
        (Array.isArray(purchases) ? purchases : []).map((p) =>
          String(p.artwork?.id || p.artworkId || '')
        ).filter(Boolean)
      );
      setOwnedArtworkIds(ids);
    } catch (error) {
      console.error('Error loading owned artworks:', error);
    }
  }, [currentUser]);

  useEffect(() => {
    loadOwnedArtworks();
  }, [loadOwnedArtworks]);

  useEffect(() => {
    if (currentUser) {
      api.getMyBookmarkIds().then((ids) => setBookmarkIds(new Set(ids.map(String)))).catch(() => {});
    }
  }, [currentUser]);

  useEffect(() => {
    setPage(1);
    loadMarketplaceArtworks(1, false);
  }, [filters]);

  const priceParams = () => {
    switch (filters.priceRange) {
      case 'under-100':
        return { priceMax: 99.99 };
      case '100-500':
        return { priceMin: 100, priceMax: 500 };
      case 'over-500':
        return { priceMin: 500.01 };
      default:
        return {};
    }
  };

  const loadMarketplaceArtworks = async (pageNum = 1, append = false) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const result = await api.getArtworks({
        forSale: true,
        license: filters.license !== 'all' ? filters.license : undefined,
        tags: filters.tags || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        page: pageNum,
        limit,
        sort:
          filters.sortBy === 'price-low'
            ? 'price-asc'
            : filters.sortBy === 'price-high'
              ? 'price-desc'
              : filters.sortBy === 'popular'
                ? 'popular'
                : 'recent',
        ...priceParams(),
      });
      const normalized = normalizeArtworkCards(result.items).map((a) => ({
        ...a,
        marketplace: {
          ...a.marketplace,
          licensing: Array.isArray(a.marketplace?.licensing) ? a.marketplace.licensing : [],
          price: a.marketplace?.price || 0,
          sales: a.marketplace?.sales || 0,
        },
      }));
      setArtworks((prev) => (append ? [...prev, ...normalized] : normalized));
      setHasMore(result.hasMore);
      setPage(pageNum);
    } catch (error) {
      console.error('Error loading marketplace artworks:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const openCheckout = (artwork, license) => {
    if (isSameUser(artwork.userId, currentUser)) {
      alert('You cannot purchase your own artwork.');
      return;
    }
    setSelectedArtwork(null);
    setCheckout({ artwork, license });
  };

  const LicenseModal = ({ artwork, onClose }) => (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Choose license — {artwork.title || 'Artwork'}
            </h3>

            {artwork.files?.preview && (
              <img
                src={artwork.files.preview}
                alt={artwork.title || 'Artwork'}
                className="w-full h-48 object-cover rounded-lg mb-4"
              />
            )}

            <div className="space-y-3">
              {(artwork.marketplace?.licensing?.length
                ? artwork.marketplace.licensing
                : ['standard']
              ).map((license) => (
                <div
                  key={license}
                  className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white capitalize">
                      {license} License
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {license === 'personal' && 'For personal use only'}
                      {license === 'commercial' && 'For commercial projects'}
                      {license === 'exclusive' && 'Exclusive rights'}
                      {license === 'standard' && 'Standard usage rights'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCheckout(artwork, license)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                  >
                    ${artwork.marketplace?.price || 0}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Art Marketplace</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Discover and purchase unique generative artworks
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
              · Mock checkout (dev — no real charges)
            </span>
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-8 overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-5 w-5 text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</span>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <select
              value={filters.priceRange}
              onChange={(e) => setFilters((prev) => ({ ...prev, priceRange: e.target.value }))}
              className="min-w-[8.5rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="all">All Prices</option>
              <option value="under-100">Under $100</option>
              <option value="100-500">$100 - $500</option>
              <option value="over-500">Over $500</option>
            </select>

            <select
              value={filters.license}
              onChange={(e) => setFilters((prev) => ({ ...prev, license: e.target.value }))}
              className="min-w-[8.5rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="all">All Licenses</option>
              <option value="personal">Personal Only</option>
              <option value="commercial">Commercial Available</option>
              <option value="exclusive">Exclusive Rights</option>
            </select>

            <select
              value={filters.sortBy}
              onChange={(e) => setFilters((prev) => ({ ...prev, sortBy: e.target.value }))}
              className="min-w-[8.5rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="recent">Most Recent</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="popular">Most Popular</option>
            </select>

            <input
              type="text"
              placeholder="Tags (comma-separated)"
              value={filters.tags}
              onChange={(e) => setFilters((prev) => ({ ...prev, tags: e.target.value }))}
              className="min-w-[12rem] flex-1 max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            />

            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Posted from</span>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-[10.5rem] max-w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Posted to</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                  className="w-[10.5rem] max-w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {artworks.map((artwork) => (
            <div
              key={artwork.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group"
            >
              <div className="relative overflow-hidden">
                <img
                  src={artwork.files?.preview}
                  alt={artwork.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300 cursor-zoom-in"
                  onClick={() => setLightboxArtwork(artwork)}
                />
                <div className="absolute bottom-3 left-3 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                  ${artwork.marketplace?.price || 0}
                </div>
              </div>

              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {artwork.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-3 line-clamp-2">
                  {artwork.description}
                </p>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {artwork.marketplace?.sales || 0} sales
                  </div>
                  {currentUser && isSameUser(artwork.userId, currentUser) ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400 px-3 py-1 border border-gray-200 dark:border-gray-600 rounded-lg">
                      Your listing
                    </span>
                  ) : currentUser && ownedArtworkIds.has(String(artwork.id)) ? (
                    <Link
                      to="/licenses"
                      className="flex items-center space-x-1 text-green-700 dark:text-green-400 px-3 py-1 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-sm font-medium"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Owned</span>
                    </Link>
                  ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedArtwork(artwork)}
                    disabled={
                      !currentUser || isSameUser(artwork.userId, currentUser)
                    }
                    className="flex items-center space-x-1 bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
                  >
                      <ShoppingCart className="h-4 w-4" />
                      <span>Buy</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {hasMore && (
          <div className="flex justify-center mt-8">
            <button
              type="button"
              onClick={() => loadMarketplaceArtworks(page + 1, true)}
              disabled={loadingMore}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}

        <ArtworkLightbox artwork={lightboxArtwork} onClose={() => setLightboxArtwork(null)} />

        {selectedArtwork && (
          <LicenseModal artwork={selectedArtwork} onClose={() => setSelectedArtwork(null)} />
        )}

        {checkout && (
          <MockCheckoutModal
            artwork={checkout.artwork}
            license={checkout.license}
            onClose={() => setCheckout(null)}
            onSuccess={() => {
              alert('Purchase successful! View your license under My Licenses.');
              loadOwnedArtworks();
              loadMarketplaceArtworks(1, false);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default Marketplace;
