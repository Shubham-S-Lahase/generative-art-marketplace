import React from 'react';
import { X } from 'lucide-react';
import { getImageUrl } from '../utils/helpers';
import type { Artwork } from '../types';

const ArtworkLightbox = ({ artwork, onClose }: { artwork: Artwork | null; onClose: () => void }) => {
  if (!artwork) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full"
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>
      <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
        <img
          src={getImageUrl(artwork.files?.preview || artwork.previewUrl || artwork.imageUrl)}
          alt={artwork.title}
          className="w-full max-h-[85vh] object-contain rounded-lg"
        />
        <p className="text-center text-white mt-3 text-lg font-medium">{artwork.title}</p>
      </div>
    </div>
  );
};

export default ArtworkLightbox;
