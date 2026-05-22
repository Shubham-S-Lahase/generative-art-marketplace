import { useState, useCallback, useRef } from 'react';

export const useArtGenerator = () => {
  const canvasRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);

  const generateArt = useCallback((parameters) => {
    return new Promise((resolve) => {
      setIsGenerating(true);

      const canvas = canvasRef.current;
      if (!canvas) {
        setIsGenerating(false);
        resolve(null);
        return;
      }

      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;

      // Clear canvas
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Seed-based random number generator
      let seed = parameters.seed || Math.floor(Math.random() * 100000);
      const random = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      // Generate art based on pattern
      setTimeout(() => {
        try {
          switch (parameters.pattern) {
            case 'spiral':
              generateSpiral(ctx, width, height, parameters, random);
              break;
            case 'geometric':
              generateGeometric(ctx, width, height, parameters, random);
              break;
            case 'organic':
              generateOrganic(ctx, width, height, parameters, random);
              break;
            default:
              generateRandom(ctx, width, height, parameters, random);
          }

          const imageData = canvas.toDataURL('image/png');
          setGeneratedImage(imageData);
          setIsGenerating(false);
          resolve(imageData);
        } catch (error) {
          console.error('Error generating art:', error);
          setIsGenerating(false);
          resolve(null);
        }
      }, 100); // Small delay to show loading state
    });
  }, []);

  const generateSpiral = (ctx, width, height, parameters, random) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 3;
    const complexity = parameters.complexity || 5;

    for (let i = 0; i < complexity * 50; i++) {
      const angle = i * 0.1;
      const radius = (maxRadius * i) / (complexity * 50);
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      const color = parameters.colors[i % parameters.colors.length];
      ctx.fillStyle = color;

      if (parameters.shapes.includes('circles')) {
        ctx.beginPath();
        ctx.arc(x, y, 3 + random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const generateGeometric = (ctx, width, height, parameters, random) => {
    const gridSize = 20;
    const complexity = parameters.complexity || 5;

    for (let x = 0; x < width; x += gridSize) {
      for (let y = 0; y < height; y += gridSize) {
        if (random() < 0.7) {
          const color = parameters.colors[Math.floor(random() * parameters.colors.length)];
          ctx.fillStyle = color;

          if (parameters.shapes.includes('squares')) {
            ctx.fillRect(x, y, gridSize - 2, gridSize - 2);
          } else if (parameters.shapes.includes('circles')) {
            ctx.beginPath();
            ctx.arc(x + gridSize/2, y + gridSize/2, gridSize/3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  };

  const generateOrganic = (ctx, width, height, parameters, random) => {
    const complexity = parameters.complexity || 5;
    ctx.strokeStyle = parameters.colors[0];
    ctx.lineWidth = 2;

    for (let i = 0; i < complexity * 10; i++) {
      ctx.beginPath();
      const startX = random() * width;
      const startY = random() * height;

      ctx.moveTo(startX, startY);

      for (let j = 0; j < 20; j++) {
        const nextX = startX + (random() - 0.5) * 200;
        const nextY = startY + (random() - 0.5) * 200;
        ctx.lineTo(nextX, nextY);
      }

      ctx.stroke();
    }
  };

  const generateRandom = (ctx, width, height, parameters, random) => {
    const complexity = parameters.complexity || 5;

    for (let i = 0; i < complexity * 20; i++) {
      const x = random() * width;
      const y = random() * height;
      const color = parameters.colors[Math.floor(random() * parameters.colors.length)];

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, random() * 10 + 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const downloadImage = useCallback((filename = 'artwork.png') => {
    if (!generatedImage) return;

    const link = document.createElement('a');
    link.download = filename;
    link.href = generatedImage;
    link.click();
  }, [generatedImage]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    setGeneratedImage(null);
  }, []);

  return {
    canvasRef,
    isGenerating,
    generatedImage,
    generateArt,
    downloadImage,
    clearCanvas
  };
};
