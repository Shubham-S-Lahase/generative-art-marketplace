import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Download } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { getImageUrl } from '../utils/helpers';
import type { PurchaseRecord } from '../types';

const MyLicenses = () => {
  const { currentUser } = useAuth();
  const [licenses, setLicenses] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      loadLicenses();
    }
  }, [currentUser]);

  const loadLicenses = async () => {
    try {
      setLoading(true);
      const data = await api.getMyLicenses();
      setLicenses(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading licenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (artworkId: string) => {
    try {
      setDownloading(artworkId);
      const res = await api.downloadArtwork(artworkId);
      if (res.downloadUrl) {
        window.open(res.downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download not available. Ensure you own a license for this artwork.');
    } finally {
      setDownloading(null);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-300">Please sign in to view your licenses.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="h-8 w-8 text-indigo-600" />
            My Licenses
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Usage rights for artworks you have purchased. Downloads require an active license.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
          </div>
        ) : licenses.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg">
            <p className="text-gray-600 dark:text-gray-300 mb-4">No licenses yet.</p>
            <Link to="/marketplace" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Purchase from marketplace
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {licenses.map((lic) => {
              const artId = String(lic.artwork?.id || lic.artworkId || '');
              const img = getImageUrl(lic.artwork?.previewUrl || lic.artwork?.imageUrl);
              return (
                <div
                  key={lic.id || lic._id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden"
                >
                  <div className="p-4 flex flex-col sm:flex-row gap-4">
                    {img && (
                      <img src={img} alt="" className="w-full sm:w-28 h-28 object-cover rounded-lg" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded text-xs font-medium capitalize">
                          {lic.license} license
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mt-2">
                        {lic.artwork?.title || 'Artwork'}
                      </h3>
                      <p className="text-sm text-gray-500">Artist: {lic.artwork?.username}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 border-l-2 border-indigo-500 pl-3">
                        {lic.licenseTerms}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        Granted {lic.createdAt ? new Date(lic.createdAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <div className="flex sm:flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownload(artId)}
                        disabled={downloading === artId}
                        className="inline-flex items-center justify-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 text-sm"
                      >
                        <Download className="h-4 w-4" />
                        {downloading === artId ? '…' : 'Download'}
                      </button>
                      <Link
                        to={`/artwork/${artId}`}
                        className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        View artwork
                      </Link>
                    </div>
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

export default MyLicenses;
