import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, Globe, Calendar, Users, Heart, Eye } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import ArtworkCard from './ArtworkCard';
import api from '../services/api';
import { getImageUrl } from '../utils/helpers';

const Profile = () => {
  const { username } = useParams();
  const { currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState('artworks');

  const isOwnProfile = currentUser?.username === username;

  useEffect(() => {
    if (username) {
      loadProfile();
    }
  }, [username]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const profileRes = await api.getProfile(username);
      setProfile(profileRes);
      const artworksRes = await api.getArtworks({ userId: profileRes.id || profileRes._id });
      setArtworks(artworksRes.map((a) => ({ 
        ...a, 
        id: a.id || a._id, 
        files: { preview: getImageUrl(a.previewUrl || a.imageUrl) },
        previewUrl: getImageUrl(a.previewUrl || a.imageUrl),
        imageUrl: getImageUrl(a.imageUrl || a.previewUrl),
      })));
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!currentUser || isOwnProfile) return;

    try {
      if (isFollowing) {
        await api.unfollow(profile.id || profile._id);
      } else {
        await api.follow(profile.id || profile._id);
      }
      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };

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

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              User not found
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Cover Image */}
      <div className="h-64 bg-gradient-to-r from-indigo-500 to-purple-600 relative">
        {profile.profile?.coverImage && (
          <img
            src={profile.profile.coverImage}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-black bg-opacity-20"></div>
      </div>

      {/* Profile Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative -mt-24 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-end md:space-x-6">
              <div className="relative">
                <img
                  src={profile.profile?.avatar || `https://ui-avatars.com/api/?name=${profile.username}&background=6366f1&color=fff`}
                  alt={profile.username}
                  className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800"
                />
              </div>

              <div className="flex-1 mt-4 md:mt-0">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {profile.profile?.firstName && profile.profile?.lastName
                        ? `${profile.profile.firstName} ${profile.profile.lastName}`
                        : profile.username}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-300">@{profile.username}</p>
                  </div>

                  {!isOwnProfile && currentUser && (
                    <button
                      onClick={handleFollow}
                      className={`mt-4 md:mt-0 px-6 py-2 rounded-lg font-medium transition-colors ${
                        isFollowing
                          ? 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>

                {profile.profile?.bio && (
                  <p className="mt-3 text-gray-700 dark:text-gray-300">
                    {profile.profile.bio}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
                  {profile.profile?.location && (
                    <div className="flex items-center space-x-1">
                      <MapPin className="h-4 w-4" />
                      <span>{profile.profile.location}</span>
                    </div>
                  )}
                  {profile.profile?.website && (
                    <div className="flex items-center space-x-1">
                      <Globe className="h-4 w-4" />
                      <a
                        href={profile.profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                      >
                        Website
                      </a>
                    </div>
                  )}
                  <div className="flex items-center space-x-1">
                    <Calendar className="h-4 w-4" />
                    <span>Joined {new Date(profile.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
          {[
            { label: 'Artworks', value: profile.stats?.artworksCreated || 0 },
            { label: 'Views', value: (profile.stats?.totalViews || 0).toLocaleString() },
            { label: 'Likes', value: (profile.stats?.totalLikes || 0).toLocaleString() },
            { label: 'Followers', value: profile.stats?.followersCount || 0 },
            { label: 'Following', value: profile.stats?.followingCount || 0 }
          ].map((stat, index) => (
            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-8">
          <nav className="-mb-px flex space-x-8">
            {['artworks', 'liked', 'collections'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="pb-12">
          {activeTab === 'artworks' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {artworks.map((artwork) => (
                <ArtworkCard key={artwork.id} artwork={artwork} />
              ))}
            </div>
          )}

          {artworks.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-300">No artworks to display</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
