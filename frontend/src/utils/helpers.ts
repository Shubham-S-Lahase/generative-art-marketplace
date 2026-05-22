// Utility functions for the generative art marketplace

export const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
};

export const clamp = (num, min, max) => {
  return Math.min(Math.max(num, min), max);
};

export const lerp = (start, end, factor) => {
  return start + (end - start) * factor;
};

export const randomBetween = (min, max) => {
  return Math.random() * (max - min) + min;
};

export const randomFromArray = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

export const seedRandom = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

export const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

export const rgbToHex = (r, g, b) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch (err) {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
};

export const downloadFile = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePassword = (password) => {
  return password.length >= 6;
};

export const validateUsername = (username) => {
  const re = /^[a-zA-Z0-9_]{3,20}$/;
  return re.test(username);
};

export const getImageDimensions = (file) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    img.src = URL.createObjectURL(file);
  });
};

export const resizeImage = (file, maxWidth, maxHeight, quality = 0.8) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      const { width, height } = img;

      // Calculate new dimensions
      let newWidth = width;
      let newHeight = height;

      if (width > maxWidth) {
        newWidth = maxWidth;
        newHeight = (height * maxWidth) / width;
      }

      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        newWidth = (newWidth * maxHeight) / newHeight;
      }

      canvas.width = newWidth;
      canvas.height = newHeight;

      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      canvas.toBlob(resolve, 'image/jpeg', quality);
    };

    img.src = URL.createObjectURL(file);
  });
};

export const colorPalettes = {
  ocean: ['#0077be', '#00a8cc', '#0081a7', '#00afb9'],
  sunset: ['#f72585', '#b5179e', '#7209b7', '#480ca8'],
  forest: ['#2d6a4f', '#40916c', '#52b788', '#74c69d'],
  fire: ['#ff0000', '#ff8500', '#ffb700', '#fff700'],
  monochrome: ['#000000', '#333333', '#666666', '#999999'],
  pastel: ['#ffd6e5', '#ffb3d6', '#ff99c8', '#fcf6bd'],
  neon: ['#ff00ff', '#00ffff', '#ffff00', '#ff0080'],
  earth: ['#8b5a2b', '#d2b48c', '#daa520', '#cd853f']
};

export const artStyles = {
  geometric: {
    name: 'Geometric',
    description: 'Clean lines and mathematical precision',
    patterns: ['grid', 'triangular', 'hexagonal', 'spiral']
  },
  organic: {
    name: 'Organic',
    description: 'Natural flowing forms and patterns',
    patterns: ['flowing', 'branching', 'cellular', 'wave']
  },
  abstract: {
    name: 'Abstract',
    description: 'Non-representational artistic expression',
    patterns: ['random', 'chaotic', 'noise', 'fractal']
  },
  minimalist: {
    name: 'Minimalist',
    description: 'Simple forms with maximum impact',
    patterns: ['simple', 'clean', 'sparse', 'balanced']
  }
};

/**
 * Get the full image URL from a relative path
 * Handles both relative paths (/uploads/...) and full URLs
 */
export const getImageUrl = (imagePath) => {
  if (!imagePath) {
    return 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&h=300&fit=crop';
  }
  
  // If it's already a full URL, return it
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // If it starts with /uploads, it's a relative path - use it as is (proxy will handle it)
  if (imagePath.startsWith('/uploads')) {
    return imagePath;
  }
  
  // Otherwise, prepend /uploads if it doesn't have a leading slash
  return imagePath.startsWith('/') ? imagePath : `/uploads/${imagePath}`;
};

export default {
  formatDate,
  formatNumber,
  generateUUID,
  debounce,
  throttle,
  clamp,
  lerp,
  randomBetween,
  randomFromArray,
  seedRandom,
  hexToRgb,
  rgbToHex,
  copyToClipboard,
  downloadFile,
  validateEmail,
  validatePassword,
  validateUsername,
  getImageDimensions,
  resizeImage,
  colorPalettes,
  artStyles,
  getImageUrl
};
