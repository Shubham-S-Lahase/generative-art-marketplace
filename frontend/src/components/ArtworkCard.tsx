import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, Eye } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { getImageUrl } from '../utils/helpers';
import type { Artwork } from '../types';

const ArtworkCard = ({ artwork, onLike, onBookmark }: {
  artwork: Artwork;
  onLike?: (id: string, liked: boolean) => void;
  onBookmark?: (id: string, bookmarked: boolean) => void;
}) => {
  const { currentUser } = useAuth();
  const [isLiked, setIsLiked] = useState(
    artwork.likedBy?.includes(currentUser?.id) || false
  );
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [likes, setLikes] = useState(artwork.metrics?.likes || 0);

  const handleLike = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      if (isLiked) {
        await api.unlikeArtwork(artwork.id);
        setLikes(prev => prev - 1);
      } else {
        await api.likeArtwork(artwork.id);
        setLikes(prev => prev + 1);
      }
      setIsLiked(!isLiked);
      onLike?.(artwork.id, !isLiked);
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleShare = async (e) => {
    e.preventDefault();
    try {
      await navigator.share({
        title: artwork.title,
        text: artwork.description,
        url: window.location.origin + `/artwork/${artwork.id}`
      });
    } catch (error) {
      navigator.clipboard.writeText(window.location.origin + `/artwork/${artwork.id}`);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group">
      <Link to={`/artwork/${artwork.id}`} className="block">
        <div className="relative overflow-hidden">
          <img
            src={getImageUrl(artwork.files?.preview || artwork.previewUrl || artwork.imageUrl)}
            alt={artwork.title}
            className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
          />

          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-300">
            <div className="absolute top-3 right-3 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {artwork.isFeatured && (
                <span className="bg-yellow-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                  Featured
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      <div className="p-4">
        <Link to={`/artwork/${artwork.id}`}>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 hover:text-indigo-600 transition-colors">
            {artwork.title}
          </h3>
        </Link>

        <p className="text-gray-600 dark:text-gray-300 text-sm mb-3 line-clamp-2">
          {artwork.description}
        </p>

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <img
              src={`https://ui-avatars.com/api/?name=${artwork.username || 'User'}&background=6366f1&color=fff`}
              alt={artwork.username}
              className="w-6 h-6 rounded-full"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {artwork.username || 'Anonymous'}
            </span>
          </div>

          {artwork.marketplace?.forSale && (
            <span className="text-sm font-semibold text-green-600">
              ${artwork.marketplace.price}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLike}
              className={`flex items-center space-x-1 transition-colors ${
                isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              }`}
            >
              <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} />
              <span className="text-sm">{likes}</span>
            </button>

            <div className="flex items-center space-x-1 text-gray-500">
              <MessageCircle className="h-4 w-4" />
              <span className="text-sm">{artwork.metrics?.comments || 0}</span>
            </div>
          </div>

          <button
            onClick={handleShare}
            className="p-1 rounded-full text-gray-500 hover:text-indigo-600 transition-colors"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArtworkCard;
