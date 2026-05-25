import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ExternalLink } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { getImageUrl } from '../utils/helpers';
import type { PurchaseRecord } from '../types';

const PurchaseHistory = () => {
  const { currentUser } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser) {
      loadPurchases();
    }
  }, [currentUser]);

  const loadPurchases = async () => {
    try {
      setLoading(true);
      const data = await api.getMyPurchases();
      setPurchases(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading purchases:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-300">Please sign in to view purchase history.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="h-8 w-8 text-indigo-600" />
            Purchase History
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Artworks you have purchased from the marketplace
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
          </div>
        ) : purchases.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg">
            <p className="text-gray-600 dark:text-gray-300 mb-4">No purchases yet.</p>
            <Link to="/marketplace" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Browse marketplace
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {purchases.map((p) => {
              const artId = p.artwork?.id || p.artworkId;
              const img = getImageUrl(p.artwork?.previewUrl || p.artwork?.imageUrl);
              return (
                <div
                  key={p.id || p._id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 flex flex-col sm:flex-row gap-4"
                >
                  {img && (
                    <img src={img} alt="" className="w-full sm:w-32 h-32 object-cover rounded-lg" />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {p.artwork?.title || 'Artwork'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      by {p.artwork?.username || 'Unknown'} ·{' '}
                      <span className="capitalize">{p.license}</span> license
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      ${p.amount?.toFixed(2)} ·{' '}
                      {p.createdAt ? new Date(p.createdAt).toLocaleString() : ''}
                    </p>
                    {p.transactionRef && (
                      <p className="text-xs text-gray-400 mt-1 font-mono truncate">
                        Ref: {p.transactionRef}
                      </p>
                    )}
                  </div>
                  <div className="flex sm:flex-col gap-2 justify-end">
                    <Link
                      to={`/artwork/${artId}`}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </Link>
                    <Link
                      to="/licenses"
                      className="inline-flex items-center justify-center px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      License
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PurchaseHistory;
