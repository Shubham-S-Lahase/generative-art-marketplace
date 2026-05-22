import React, { useState, useEffect } from 'react';
import { ShoppingCart, Filter, DollarSign, Star, Crown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import ArtworkCard from './ArtworkCard';
import api from '../services/api';
import { getImageUrl } from '../utils/helpers';

const Marketplace = () => {
  const { currentUser } = useAuth();
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    priceRange: 'all',
    license: 'all',
    sortBy: 'recent'
  });

  useEffect(() => {
    loadMarketplaceArtworks();
  }, [filters]);

  const loadMarketplaceArtworks = async () => {
    try {
      setLoading(true);
      const data = await api.getArtworks({
            forSale: true, 
        license: filters.license !== 'all' ? filters.license : undefined,
        sort: filters.sortBy === 'price-low' ? 'price-asc' : filters.sortBy === 'price-high' ? 'price-desc' : filters.sortBy === 'popular' ? 'popular' : 'recent',
      });
      const normalized = data.map((a) => ({
        ...a,
        id: a.id || a._id,
        files: { preview: getImageUrl(a.previewUrl || a.imageUrl) },
        previewUrl: getImageUrl(a.previewUrl || a.imageUrl),
        imageUrl: getImageUrl(a.imageUrl || a.previewUrl),
        marketplace: {
          ...a.marketplace,
          licensing: Array.isArray(a.marketplace?.licensing) ? a.marketplace.licensing : [],
          price: a.marketplace?.price || 0,
          sales: a.marketplace?.sales || 0,
        },
      }));
      setArtworks(normalized);
    } catch (error) {
      console.error('Error loading marketplace artworks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (artworkId, licenseType) => {
    if (!currentUser) return;

    try {
      await api.purchaseArtwork(artworkId, licenseType);
      alert('Purchase successful!');
    } catch (error) {
      console.error('Error purchasing artwork:', error);
      alert('Purchase failed');
    }
  };

  const PurchaseModal = ({ artwork, onClose, onPurchase }) => (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Purchase "{artwork.title || 'Artwork'}"
            </h3>

            {artwork.files?.preview && (
              <img
                src={artwork.files.preview}
                alt={artwork.title || 'Artwork'}
                className="w-full h-48 object-cover rounded-lg mb-4"
              />
            )}

            <div className="space-y-3">
              {artwork.marketplace?.licensing && Array.isArray(artwork.marketplace.licensing) && artwork.marketplace.licensing.length > 0 ? (
                artwork.marketplace.licensing.map((license) => (
                  <div key={license} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white capitalize">
                        {license} License
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {license === 'personal' && 'For personal use only'}
                        {license === 'commercial' && 'For commercial projects'}
                        {license === 'exclusive' && 'Exclusive rights to this artwork'}
                      </div>
                    </div>
                    <button
                      onClick={() => onPurchase(license)}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                    >
                      ${artwork.marketplace?.price || 0}
                    </button>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      Standard License
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      Standard usage rights
                    </div>
                  </div>
                  <button
                    onClick={() => onPurchase('standard')}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                  >
                    ${artwork.marketplace?.price || 0}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const [selectedArtwork, setSelectedArtwork] = useState(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Art Marketplace
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Discover and purchase unique generative artworks
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:space-x-6 space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters:</span>
            </div>

            <select
              value={filters.priceRange}
              onChange={(e) => setFilters(prev => ({ ...prev, priceRange: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              <option value="all">All Prices</option>
              <option value="under-100">Under $100</option>
              <option value="100-500">$100 - $500</option>
              <option value="over-500">Over $500</option>
            </select>

            <select
              value={filters.license}
              onChange={(e) => setFilters(prev => ({ ...prev, license: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              <option value="all">All Licenses</option>
              <option value="personal">Personal Only</option>
              <option value="commercial">Commercial Available</option>
              <option value="exclusive">Exclusive Rights</option>
            </select>

            <select
              value={filters.sortBy}
              onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              <option value="recent">Most Recent</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="popular">Most Popular</option>
            </select>
          </div>
        </div>

        {/* Artworks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {artworks.map((artwork) => (
            <div key={artwork.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group">
              <div className="relative overflow-hidden">
                <img
                  src={artwork.files?.preview}
                  alt={artwork.title}
                  className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                />

                <div className="absolute top-3 right-3 flex space-x-2">
                  {artwork.isFeatured && (
                    <span className="bg-yellow-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                      <Crown className="h-3 w-3 inline mr-1" />
                      Featured
                    </span>
                  )}
                  {artwork.marketplace?.exclusivity && (
                    <span className="bg-purple-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                      Exclusive
                    </span>
                  )}
                </div>

                <div className="absolute bottom-3 left-3 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                  ${artwork.marketplace?.price || 0}
                  {artwork.marketplace?.originalPrice && artwork.marketplace.originalPrice > artwork.marketplace.price && (
                    <span className="line-through ml-2 text-gray-300">
                      ${artwork.marketplace.originalPrice}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {artwork.title}
                </h3>

                <p className="text-gray-600 dark:text-gray-300 text-sm mb-3 line-clamp-2">
                  {artwork.description}
                </p>

                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <img
                      src={`https://ui-avatars.com/api/?name=${artwork.username}&background=6366f1&color=fff`}
                      alt={artwork.username}
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {artwork.username}
                    </span>
                  </div>

                  {artwork.rating && (
                    <div className="flex items-center space-x-1">
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {artwork.rating}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {artwork.marketplace?.sales || 0} sales
                  </div>

                  <button
                    onClick={() => setSelectedArtwork(artwork)}
                    disabled={!currentUser}
                    className="flex items-center space-x-1 bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    <span>Buy</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Purchase Modal */}
        {selectedArtwork && (
          <PurchaseModal
            artwork={selectedArtwork}
            onClose={() => setSelectedArtwork(null)}
            onPurchase={(license) => {
              handlePurchase(selectedArtwork.id, license);
              setSelectedArtwork(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default Marketplace;
