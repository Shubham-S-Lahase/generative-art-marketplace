import React, { useState, useEffect } from 'react';
import { BarChart, TrendingUp, Users, Heart, Eye, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ArtworkCard from './ArtworkCard';
import api from '../services/api';
import { getImageUrl } from '../utils/helpers';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    artworksCreated: 0,
    totalViews: 0,
    totalLikes: 0,
    followersCount: 0,
    totalRevenue: 0
  });
  const [recentArtworks, setRecentArtworks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser) {
      loadDashboardData();
    }
  }, [currentUser]);

  const loadDashboardData = async () => {
    try {
      const [statsRes, artworksRes] = await Promise.all([
        api.getDashboard(),
        api.getArtworks({ userId: currentUser.id || currentUser._id })
      ]);
      // Ensure all stats fields have default values
      setStats({
        artworksCreated: statsRes?.artworksCreated || 0,
        totalViews: statsRes?.totalViews || 0,
        totalLikes: statsRes?.totalLikes || 0,
        followersCount: statsRes?.followersCount || 0,
        totalRevenue: statsRes?.totalRevenue || 0
      });
      const normalized = Array.isArray(artworksRes) 
        ? artworksRes.map((a) => ({
            ...a,
            id: a.id || a._id,
            files: { preview: getImageUrl(a.previewUrl || a.imageUrl) },
            previewUrl: getImageUrl(a.previewUrl || a.imageUrl),
            imageUrl: getImageUrl(a.imageUrl || a.previewUrl),
          }))
        : [];
      setRecentArtworks(normalized.slice(0, 5));
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Set default stats on error
      setStats({
        artworksCreated: 0,
        totalViews: 0,
        totalLikes: 0,
        followersCount: 0,
        totalRevenue: 0
      });
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Please sign in to view your dashboard
          </h2>
        </div>
      </div>
    );
  }

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

  const statCards = [
    {
      title: 'Artworks Created',
      value: stats.artworksCreated || 0,
      icon: <BarChart className="h-6 w-6" />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20'
    },
    {
      title: 'Total Views',
      value: (stats.totalViews || 0).toLocaleString(),
      icon: <Eye className="h-6 w-6" />,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/20'
    },
    {
      title: 'Total Likes',
      value: (stats.totalLikes || 0).toLocaleString(),
      icon: <Heart className="h-6 w-6" />,
      color: 'text-red-600',
      bgColor: 'bg-red-100 dark:bg-red-900/20'
    },
    {
      title: 'Followers',
      value: stats.followersCount || 0,
      icon: <Users className="h-6 w-6" />,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20'
    },
    {
      title: 'Revenue',
      value: `$${(stats.totalRevenue || 0).toLocaleString()}`,
      icon: <DollarSign className="h-6 w-6" />,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/20'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome back, {currentUser.username}!
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Here's an overview of your artistic journey
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {statCards.map((stat, index) => (
            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {stat.value}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <div className={stat.color}>
                    {stat.icon}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Artworks */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Recent Artworks
              </h3>
              <button className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 text-sm font-medium">
                View All
              </button>
            </div>

            {recentArtworks.length > 0 ? (
              <div className="space-y-4">
                {recentArtworks.slice(0, 3).map((artwork) => (
                  <div 
                    key={artwork.id} 
                    onClick={() => navigate(`/artwork/${artwork.id}`)}
                    className="flex items-center space-x-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <img
                      src={artwork.files?.preview}
                      alt={artwork.title}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {artwork.title}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {artwork.metrics?.views || 0} views • {artwork.metrics?.likes || 0} likes
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BarChart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-300">No artworks yet</p>
                <button className="mt-2 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium">
                  Create your first artwork
                </button>
              </div>
            )}
          </div>

          {/* Performance Chart Placeholder */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Performance Overview
            </h3>
            <div className="h-64 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-300">Chart coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
