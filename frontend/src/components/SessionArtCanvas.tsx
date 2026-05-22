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
}

const SessionArtCanvas = ({ parameters, className = '' }: SessionArtCanvasProps) => {
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

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={480}
        height={360}
        className="w-full max-w-full h-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white shadow-sm"
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
