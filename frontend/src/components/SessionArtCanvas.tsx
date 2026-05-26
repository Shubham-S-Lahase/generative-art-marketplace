import React, { useEffect } from 'react';
import { useArtGenerator } from '../hooks/useArtGenerator';

const DEFAULT_PARAMS = {
  colors: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
  shapes: ['circles'],
  pattern: 'spiral',
  complexity: 5,
  seed: 42,
};

interface SessionArtCanvasProps {
  parameters?: Record<string, unknown>;
  className?: string;
  compact?: boolean;
}

const SessionArtCanvas = ({ parameters, className = '', compact = false }: SessionArtCanvasProps) => {
  const { canvasRef, isGenerating, generateArt } = useArtGenerator();

  const merged = {
    ...DEFAULT_PARAMS,
    ...(parameters || {}),
    colors: Array.isArray(parameters?.colors) ? parameters.colors : DEFAULT_PARAMS.colors,
    shapes: Array.isArray(parameters?.shapes) ? parameters.shapes : DEFAULT_PARAMS.shapes,
  };

  useEffect(() => {
    generateArt(merged);
  }, [JSON.stringify(merged), generateArt]);

  const w = compact ? 320 : 480;
  const h = compact ? 112 : 360;

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        className={`w-full max-w-full border border-gray-300 dark:border-gray-600 rounded-lg bg-white shadow-sm ${
          compact ? 'h-28 object-cover' : 'h-auto'
        }`}
      />
      {isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      )}
    </div>
  );
};

export default SessionArtCanvas;
