import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, BadgeCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { getImageUrl } from '../utils/helpers';
import type { Artwork } from '../types';

const ArtworkCard = ({
  artwork,
  onLike,
  onBookmark,
  onPreview,
  initialBookmarked,
}: {
  artwork: Artwork;
  onLike?: (id: string, liked: boolean) => void;
  onBookmark?: (id: string, bookmarked: boolean) => void;
  onPreview?: (artwork: Artwork) => void;
  initialBookmarked?: boolean;
}) => {
  const { currentUser } = useAuth();
  const [isLiked, setIsLiked] = useState(
    artwork.likedBy?.includes(currentUser?.id) || false
  );
  const [isBookmarked, setIsBookmarked] = useState(
    initialBookmarked ?? artwork.bookmarked ?? false
  );
  const [likes, setLikes] = useState(artwork.metrics?.likes || 0);

  useEffect(() => {
    setIsBookmarked(initialBookmarked ?? artwork.bookmarked ?? false);
  }, [initialBookmarked, artwork.bookmarked, artwork.id]);

  const handleLike = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUser) return;

    try {
      if (isLiked) {
        await api.unlikeArtwork(artwork.id);
        setLikes((prev) => prev - 1);
      } else {
        await api.likeArtwork(artwork.id);
        setLikes((prev) => prev + 1);
      }
      setIsLiked(!isLiked);
      onLike?.(artwork.id, !isLiked);
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleBookmark = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUser) return;
    try {
      if (isBookmarked) {
        await api.unbookmarkArtwork(artwork.id);
      } else {
        await api.bookmarkArtwork(artwork.id);
      }
      setIsBookmarked(!isBookmarked);
      onBookmark?.(artwork.id, !isBookmarked);
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    }
  };

  const handleShare = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/artwork/${artwork.id}`;
    try {
      await navigator.share({
        title: artwork.title,
        text: artwork.description,
        url,
      });
    } catch {
      await navigator.clipboard.writeText(url);
    }
  };

  const imageSrc = getImageUrl(artwork.files?.preview || artwork.previewUrl || artwork.imageUrl);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group">
      <div
        className="block cursor-zoom-in"
        onClick={() => onPreview?.(artwork)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onPreview?.(artwork)}
      >
        <div className="relative overflow-hidden">
          <img
            src={imageSrc}
            alt={artwork.title}
            loading="lazy"
            decoding="async"
            className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
          />

          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-300 pointer-events-none">
            <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {artwork.isFeatured && (
                <span className="bg-yellow-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                  Featured
                </span>
              )}
              {artwork.isVerified && (
                <span className="bg-blue-600 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                  <BadgeCheck className="h-3 w-3" /> Verified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        <Link to={`/artwork/${artwork.id}`}>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 hover:text-indigo-600 transition-colors">
            {artwork.title}
          </h3>
        </Link>

        {artwork.remixOfTitle && (
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-2">
            Remix of {artwork.remixOfTitle}
          </p>
        )}

        <p className="text-gray-600 dark:text-gray-300 text-sm mb-3 line-clamp-2">
          {artwork.description}
        </p>

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <img
              src={`https://ui-avatars.com/api/?name=${artwork.username || 'User'}&background=6366f1&color=fff`}
              alt={artwork.username}
              className="w-6 h-6 rounded-full"
              loading="lazy"
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
          <div className="flex items-center space-x-3">
            <button
              type="button"
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

            {currentUser && (
              <button
                type="button"
                onClick={handleBookmark}
                className={`p-1 transition-colors ${
                  isBookmarked ? 'text-amber-500' : 'text-gray-500 hover:text-amber-500'
                }`}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              >
                <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>

          <button
            type="button"
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
