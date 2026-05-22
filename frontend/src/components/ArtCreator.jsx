import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Download, Save, Shuffle, Settings, Palette, Cloud, Undo, Redo, Maximize, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { debounce } from '../utils/helpers';

const ArtCreator = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const canvasRef = useRef(null);
  const fullscreenCanvasRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [parameters, setParameters] = useState({
    colors: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
    shapes: ['circles'],
    seed: Math.floor(Math.random() * 100000),
    size: 'medium',
    complexity: 5,
    pattern: 'spiral',
    // Advanced parameters
    opacity: 1.0,
    sizeVariation: { min: 0.5, max: 1.5 },
    rotation: { enabled: false, angle: 0, variation: 0 },
    useGradient: false,
    gradientType: 'linear', // linear, radial
    effects: {
      blur: 0,
      glow: { enabled: false, intensity: 10, color: '#ffffff' },
      shadow: { enabled: false, offsetX: 5, offsetY: 5, blur: 10, color: '#000000' }
    },
    animation: {
      enabled: false,
      speed: 1.0, // 0.1 to 5.0
      type: 'rotation' // rotation, pulse, wave, spiral
    }
  });

  const [artworkData, setArtworkData] = useState({
    title: '',
    description: '',
    tags: '',
    isPublic: true
  });
  const [serverPreview, setServerPreview] = useState('');
  const [sliderComplexity, setSliderComplexity] = useState(5);
  const [presets, setPresets] = useState(() => {
    const saved = localStorage.getItem('artPresets');
    return saved ? JSON.parse(saved) : [];
  });
  const [presetName, setPresetName] = useState('');
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [history, setHistory] = useState([{ ...parameters }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [animationFrame, setAnimationFrame] = useState(0);
  const animationRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [exportQuality, setExportQuality] = useState(1.0); // 0.5 to 2.0 multiplier
  const [showFullscreen, setShowFullscreen] = useState(false);

  const colorPalettes = [
    { name: 'Ocean', colors: ['#0077be', '#00a8cc', '#0081a7', '#00afb9'] },
    { name: 'Sunset', colors: ['#f72585', '#b5179e', '#7209b7', '#480ca8'] },
    { name: 'Forest', colors: ['#2d6a4f', '#40916c', '#52b788', '#74c69d'] },
    { name: 'Fire', colors: ['#ff0000', '#ff8500', '#ffb700', '#fff700'] }
  ];

  const patterns = ['spiral', 'geometric', 'organic', 'random', 'mandala', 'waves', 'particles', 'grid'];
  const shapes = ['circles', 'squares', 'triangles', 'lines'];

  // Debounced update for complexity to make slider smooth
  const debouncedComplexityUpdate = useCallback(
    debounce((value) => {
      handleParameterChange('complexity', value);
    }, 150),
    []
  );

  // Sync slider value with parameters when changed from other sources
  useEffect(() => {
    setSliderComplexity(parameters.complexity);
  }, [parameters.complexity]);

  useEffect(() => {
    if (canvasRef.current) {
      generateArt(animationFrame);
    }
  }, [parameters, animationFrame, canvasSize]);

  // Update fullscreen canvas
  useEffect(() => {
    if (showFullscreen && canvasRef.current && fullscreenCanvasRef.current) {
      const sourceCanvas = canvasRef.current;
      const fullscreenCanvas = fullscreenCanvasRef.current;
      const ctx = fullscreenCanvas.getContext('2d');
      fullscreenCanvas.width = sourceCanvas.width;
      fullscreenCanvas.height = sourceCanvas.height;
      ctx.drawImage(sourceCanvas, 0, 0);
    }
  }, [showFullscreen, parameters, animationFrame, canvasSize]);

  // Animation loop
  useEffect(() => {
    if (parameters.animation.enabled) {
      let lastTime = 0;
      const animate = (currentTime) => {
        if (!lastTime) lastTime = currentTime;
        const deltaTime = currentTime - lastTime;
        
        if (deltaTime >= (1000 / (30 * parameters.animation.speed))) { // 30fps base
          setAnimationFrame(prev => prev + 1);
          lastTime = currentTime;
        }
        
        animationRef.current = requestAnimationFrame(animate);
      };
      
      animationRef.current = requestAnimationFrame(animate);
      
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    } else {
      setAnimationFrame(0);
    }
  }, [parameters.animation.enabled, parameters.animation.speed]);

  // Prefill from remix
  useEffect(() => {
    if (location.state?.parameters) {
      setParameters((prev) => ({ ...prev, ...location.state.parameters }));
      if (location.state.title) {
        setArtworkData((prev) => ({ ...prev, title: location.state.title }));
      }
    }
  }, [location.state]);

  const generateArt = (frame = 0) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Seed random generator (simplified)
    let seed = parameters.seed;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // Generate art based on pattern
    switch (parameters.pattern) {
      case 'spiral':
        generateSpiral(ctx, width, height, random, frame);
        break;
      case 'geometric':
        generateGeometric(ctx, width, height, random, frame);
        break;
      case 'organic':
        generateOrganic(ctx, width, height, random, frame);
        break;
      case 'mandala':
        generateMandala(ctx, width, height, random, frame);
        break;
      case 'waves':
        generateWaves(ctx, width, height, random, frame);
        break;
      case 'particles':
        generateParticles(ctx, width, height, random, frame);
        break;
      case 'grid':
        generateGrid(ctx, width, height, random, frame);
        break;
      default:
        generateRandom(ctx, width, height, random, frame);
    }
  };

  // Color harmony functions
  const hexToHsl = (hex) => {
    const r = parseInt(hex.substr(1, 2), 16) / 255;
    const g = parseInt(hex.substr(3, 2), 16) / 255;
    const b = parseInt(hex.substr(5, 2), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s, l];
  };

  const hslToHex = (h, s, l) => {
    h /= 360;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  const getComplementary = (color) => {
    const [h, s, l] = hexToHsl(color);
    return hslToHex((h + 180) % 360, s, l);
  };

  const getTriadic = (color) => {
    const [h, s, l] = hexToHsl(color);
    return [
      hslToHex((h + 120) % 360, s, l),
      hslToHex((h + 240) % 360, s, l)
    ];
  };

  const getAnalogous = (color) => {
    const [h, s, l] = hexToHsl(color);
    return [
      hslToHex((h + 30) % 360, s, l),
      hslToHex((h - 30 + 360) % 360, s, l)
    ];
  };

  const getSplitComplementary = (color) => {
    const [h, s, l] = hexToHsl(color);
    return [
      hslToHex((h + 150) % 360, s, l),
      hslToHex((h + 210) % 360, s, l)
    ];
  };

  const applyColorHarmony = (harmonyType) => {
    if (parameters.colors.length === 0) return;
    const baseColor = parameters.colors[0];
    let newColors = [baseColor];

    switch (harmonyType) {
      case 'complementary':
        newColors = [baseColor, getComplementary(baseColor)];
        break;
      case 'triadic':
        newColors = [baseColor, ...getTriadic(baseColor)];
        break;
      case 'analogous':
        newColors = [baseColor, ...getAnalogous(baseColor)];
        break;
      case 'splitComplementary':
        newColors = [baseColor, ...getSplitComplementary(baseColor)];
        break;
    }

    handleParameterChange('colors', newColors);
  };

  // Helper function to interpolate between two colors
  const interpolateColor = (color1, color2, t) => {
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    const r1 = parseInt(hex1.substr(0, 2), 16);
    const g1 = parseInt(hex1.substr(2, 2), 16);
    const b1 = parseInt(hex1.substr(4, 2), 16);
    const r2 = parseInt(hex2.substr(0, 2), 16);
    const g2 = parseInt(hex2.substr(2, 2), 16);
    const b2 = parseInt(hex2.substr(4, 2), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
  };

  const generateSpiral = (ctx, width, height, random, frame = 0) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 3;
    const baseSize = 4;

    // Set global opacity
    ctx.globalAlpha = parameters.opacity;

    // Animation offset
    let animationOffset = 0;
    if (parameters.animation.enabled) {
      switch (parameters.animation.type) {
        case 'rotation':
          animationOffset = (frame * 0.05) % (Math.PI * 2);
          break;
        case 'pulse':
          animationOffset = Math.sin(frame * 0.1) * 0.3;
          break;
        case 'wave':
          animationOffset = Math.sin(frame * 0.1) * 0.5;
          break;
        case 'spiral':
          animationOffset = frame * 0.1;
          break;
      }
    }

    for (let i = 0; i < parameters.complexity * 50; i++) {
      let angle = i * 0.1;
      if (parameters.animation.enabled && parameters.animation.type === 'rotation') {
        angle += animationOffset;
      }
      const radius = (maxRadius * i) / (parameters.complexity * 50);
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      // Size variation
      let sizeMultiplier = parameters.sizeVariation.min + 
        (random() * (parameters.sizeVariation.max - parameters.sizeVariation.min));
      // Apply pulse animation
      if (parameters.animation.enabled && parameters.animation.type === 'pulse') {
        sizeMultiplier *= (1 + animationOffset);
      }
      const size = baseSize * sizeMultiplier;

      // Get color (with gradient support)
      let color = parameters.colors[i % parameters.colors.length];
      if (parameters.useGradient && parameters.colors.length > 1) {
        const colorIndex = i % parameters.colors.length;
        const nextColorIndex = (i + 1) % parameters.colors.length;
        const t = (i % parameters.colors.length) / parameters.colors.length;
        color = interpolateColor(parameters.colors[colorIndex], parameters.colors[nextColorIndex], t);
      }

      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      // Rotation
      let rotationAngle = 0;
      if (parameters.rotation.enabled) {
        rotationAngle = (parameters.rotation.angle + 
          (random() - 0.5) * parameters.rotation.variation) * Math.PI / 180;
      }

      ctx.save();
      ctx.translate(x, y);
      if (rotationAngle !== 0) {
        ctx.rotate(rotationAngle);
      }

      // Apply visual effects
      if (parameters.effects.shadow.enabled) {
        ctx.shadowBlur = parameters.effects.shadow.blur;
        ctx.shadowOffsetX = parameters.effects.shadow.offsetX;
        ctx.shadowOffsetY = parameters.effects.shadow.offsetY;
        ctx.shadowColor = parameters.effects.shadow.color;
      } else {
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      if (parameters.effects.blur > 0) {
        ctx.filter = `blur(${parameters.effects.blur}px)`;
      } else {
        ctx.filter = 'none';
      }

      // Apply glow effect (simulated with multiple strokes)
      if (parameters.effects.glow.enabled) {
        const glowColor = parameters.effects.glow.color;
        const glowIntensity = parameters.effects.glow.intensity;
        ctx.strokeStyle = glowColor;
        ctx.fillStyle = glowColor;
        for (let g = 0; g < glowIntensity; g++) {
          ctx.globalAlpha = (0.3 / glowIntensity) * (glowIntensity - g);
      if (parameters.shapes.includes('circles')) {
        ctx.beginPath();
            ctx.arc(0, 0, size + g, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = parameters.opacity;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
      }

      if (parameters.shapes.includes('circles')) {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
      } else if (parameters.shapes.includes('squares')) {
        ctx.fillRect(-size, -size, size * 2, size * 2);
      } else if (parameters.shapes.includes('triangles')) {
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(-size, size);
        ctx.lineTo(size, size);
        ctx.closePath();
        ctx.fill();
      } else if (parameters.shapes.includes('lines')) {
        const nextAngle = (i + 1) * 0.1;
        const nextRadius = (maxRadius * (i + 1)) / (parameters.complexity * 50);
        const nextX = centerX + nextRadius * Math.cos(nextAngle);
        const nextY = centerY + nextRadius * Math.sin(nextAngle);
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nextX, nextY);
        ctx.stroke();
        ctx.save();
        ctx.translate(x, y);
      }
      ctx.restore();
    }

    ctx.globalAlpha = 1.0;
    ctx.filter = 'none';
  };

  const generateGeometric = (ctx, width, height, random, frame = 0) => {
    // Complexity affects grid size: higher complexity = smaller grid = more elements
    // Range: 1-10 complexity maps to gridSize 40-10
    const gridSize = Math.max(10, 40 - (parameters.complexity * 3));
    // Complexity also affects fill probability: higher complexity = more filled cells
    const fillProbability = 0.3 + (parameters.complexity * 0.05); // 0.35 to 0.8
    
    ctx.globalAlpha = parameters.opacity;
    
    for (let x = 0; x < width; x += gridSize) {
      for (let y = 0; y < height; y += gridSize) {
        if (random() < fillProbability) {
          const baseSize = gridSize / 2 - 2;
          const sizeMultiplier = parameters.sizeVariation.min + 
            (random() * (parameters.sizeVariation.max - parameters.sizeVariation.min));
          const size = baseSize * sizeMultiplier;

          let color = parameters.colors[Math.floor(random() * parameters.colors.length)];
          if (parameters.useGradient && parameters.colors.length > 1) {
            const t = random();
            const colorIndex = Math.floor(random() * parameters.colors.length);
            const nextColorIndex = (colorIndex + 1) % parameters.colors.length;
            color = interpolateColor(parameters.colors[colorIndex], parameters.colors[nextColorIndex], t);
          }

          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          const centerX = x + gridSize / 2;
          const centerY = y + gridSize / 2;

          // Rotation
          let rotationAngle = 0;
          if (parameters.rotation.enabled) {
            rotationAngle = (parameters.rotation.angle + 
              (random() - 0.5) * parameters.rotation.variation) * Math.PI / 180;
          }

          ctx.save();
          ctx.translate(centerX, centerY);
          if (rotationAngle !== 0) {
            ctx.rotate(rotationAngle);
          }

          if (parameters.shapes.includes('squares')) {
            ctx.fillRect(-size, -size, size * 2, size * 2);
          } else if (parameters.shapes.includes('circles')) {
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.fill();
          } else if (parameters.shapes.includes('triangles')) {
            ctx.beginPath();
            ctx.moveTo(0, -size);
            ctx.lineTo(-size, size);
            ctx.lineTo(size, size);
            ctx.closePath();
            ctx.fill();
          } else if (parameters.shapes.includes('lines')) {
            ctx.beginPath();
            ctx.moveTo(-size, -size);
            ctx.lineTo(size, size);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1.0;
  };

  const generateOrganic = (ctx, width, height, random, frame = 0) => {
    ctx.lineWidth = 2;
    ctx.globalAlpha = parameters.opacity;

    for (let i = 0; i < parameters.complexity * 10; i++) {
      const baseSize = 3 + random() * 5;
      const sizeMultiplier = parameters.sizeVariation.min + 
        (random() * (parameters.sizeVariation.max - parameters.sizeVariation.min));
      const size = baseSize * sizeMultiplier;

      let color = parameters.colors[i % parameters.colors.length];
      if (parameters.useGradient && parameters.colors.length > 1) {
        const t = random();
        const colorIndex = i % parameters.colors.length;
        const nextColorIndex = (i + 1) % parameters.colors.length;
        color = interpolateColor(parameters.colors[colorIndex], parameters.colors[nextColorIndex], t);
      }

      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      const startX = random() * width;
      const startY = random() * height;

      // Rotation
      let rotationAngle = 0;
      if (parameters.rotation.enabled) {
        rotationAngle = (parameters.rotation.angle + 
          (random() - 0.5) * parameters.rotation.variation) * Math.PI / 180;
      }

      ctx.save();
      ctx.translate(startX, startY);
      if (rotationAngle !== 0) {
        ctx.rotate(rotationAngle);
      }

      if (parameters.shapes.includes('lines')) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
      for (let j = 0; j < 20; j++) {
          const nextX = (random() - 0.5) * 200;
          const nextY = (random() - 0.5) * 200;
        ctx.lineTo(nextX, nextY);
      }
      ctx.stroke();
      } else if (parameters.shapes.includes('circles')) {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
      } else if (parameters.shapes.includes('squares')) {
        ctx.fillRect(-size, -size, size * 2, size * 2);
      } else if (parameters.shapes.includes('triangles')) {
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(-size, size);
        ctx.lineTo(size, size);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;
  };

  const generateRandom = (ctx, width, height, random, frame = 0) => {
    ctx.globalAlpha = parameters.opacity;

    for (let i = 0; i < parameters.complexity * 20; i++) {
      const x = random() * width;
      const y = random() * height;
      const baseSize = random() * 10 + 2;
      const sizeMultiplier = parameters.sizeVariation.min + 
        (random() * (parameters.sizeVariation.max - parameters.sizeVariation.min));
      const size = baseSize * sizeMultiplier;

      let color = parameters.colors[Math.floor(random() * parameters.colors.length)];
      if (parameters.useGradient && parameters.colors.length > 1) {
        const t = random();
        const colorIndex = Math.floor(random() * parameters.colors.length);
        const nextColorIndex = (colorIndex + 1) % parameters.colors.length;
        color = interpolateColor(parameters.colors[colorIndex], parameters.colors[nextColorIndex], t);
      }

      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      // Rotation
      let rotationAngle = 0;
      if (parameters.rotation.enabled) {
        rotationAngle = (parameters.rotation.angle + 
          (random() - 0.5) * parameters.rotation.variation) * Math.PI / 180;
      }

      ctx.save();
      ctx.translate(x, y);
      if (rotationAngle !== 0) {
        ctx.rotate(rotationAngle);
      }

      if (parameters.shapes.includes('circles')) {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
      } else if (parameters.shapes.includes('squares')) {
        ctx.fillRect(-size, -size, size * 2, size * 2);
      } else if (parameters.shapes.includes('triangles')) {
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(-size, size);
        ctx.lineTo(size, size);
        ctx.closePath();
        ctx.fill();
      } else if (parameters.shapes.includes('lines')) {
        const angle = random() * Math.PI * 2;
        const length = size * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;
  };

  const generateMandala = (ctx, width, height, random, frame = 0) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2;
    ctx.globalAlpha = parameters.opacity;

    const layers = parameters.complexity;
    for (let layer = 0; layer < layers; layer++) {
      const radius = (maxRadius * (layer + 1)) / layers;
      const segments = 8 + layer * 2;
      const angleStep = (Math.PI * 2) / segments;

      for (let i = 0; i < segments; i++) {
        const angle = i * angleStep + (parameters.animation.enabled ? frame * 0.02 : 0);
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        const size = (radius / layers) * (parameters.sizeVariation.min + 
          random() * (parameters.sizeVariation.max - parameters.sizeVariation.min));
        const color = parameters.colors[i % parameters.colors.length];

        ctx.fillStyle = color;
        ctx.strokeStyle = color;

        if (parameters.shapes.includes('circles')) {
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        } else if (parameters.shapes.includes('squares')) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.fillRect(-size, -size, size * 2, size * 2);
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1.0;
  };

  const generateWaves = (ctx, width, height, random, frame = 0) => {
    ctx.globalAlpha = parameters.opacity;
    ctx.lineWidth = 2;

    const waveCount = parameters.complexity;
    const waveHeight = height / (waveCount + 1);

    for (let w = 0; w < waveCount; w++) {
      const y = waveHeight * (w + 1);
      const amplitude = waveHeight * 0.3 * (0.5 + random() * 0.5);
      const frequency = 0.01 + random() * 0.02;
      const phase = parameters.animation.enabled ? frame * 0.1 : random() * Math.PI * 2;

      const color = parameters.colors[w % parameters.colors.length];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      ctx.beginPath();
      for (let x = 0; x < width; x += 2) {
        const waveY = y + amplitude * Math.sin(x * frequency + phase);
        if (x === 0) {
          ctx.moveTo(x, waveY);
        } else {
          ctx.lineTo(x, waveY);
        }
      }
      ctx.stroke();

      if (parameters.shapes.includes('circles')) {
        for (let x = 0; x < width; x += 20) {
          const waveY = y + amplitude * Math.sin(x * frequency + phase);
          ctx.beginPath();
          ctx.arc(x, waveY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1.0;
  };

  const generateParticles = (ctx, width, height, random, frame = 0) => {
    ctx.globalAlpha = parameters.opacity;

    const particleCount = parameters.complexity * 30;
    for (let i = 0; i < particleCount; i++) {
      let x = random() * width;
      let y = random() * height;

      if (parameters.animation.enabled) {
        x += Math.sin(frame * 0.1 + i) * 10;
        y += Math.cos(frame * 0.1 + i) * 10;
      }

      const size = 2 + random() * 4;
      const sizeMultiplier = parameters.sizeVariation.min + 
        (random() * (parameters.sizeVariation.max - parameters.sizeVariation.min));
      const finalSize = size * sizeMultiplier;

      const color = parameters.colors[Math.floor(random() * parameters.colors.length)];
      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      if (parameters.shapes.includes('circles')) {
        ctx.beginPath();
        ctx.arc(x, y, finalSize, 0, Math.PI * 2);
        ctx.fill();
      } else if (parameters.shapes.includes('squares')) {
        ctx.fillRect(x - finalSize, y - finalSize, finalSize * 2, finalSize * 2);
      }
    }
    ctx.globalAlpha = 1.0;
  };

  const generateGrid = (ctx, width, height, random, frame = 0) => {
    ctx.globalAlpha = parameters.opacity;

    const gridSize = Math.max(10, 50 - parameters.complexity * 3);
    const cols = Math.ceil(width / gridSize);
    const rows = Math.ceil(height / gridSize);

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        if (random() > 0.5) {
          const x = col * gridSize;
          const y = row * gridSize;
          const size = gridSize * 0.8 * (parameters.sizeVariation.min + 
            random() * (parameters.sizeVariation.max - parameters.sizeVariation.min));

          const color = parameters.colors[(col + row) % parameters.colors.length];
      ctx.fillStyle = color;
          ctx.strokeStyle = color;

          if (parameters.shapes.includes('squares')) {
            ctx.fillRect(x, y, size, size);
          } else if (parameters.shapes.includes('circles')) {
      ctx.beginPath();
            ctx.arc(x + gridSize / 2, y + gridSize / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
        }
      }
    }
    ctx.globalAlpha = 1.0;
  };

  const handleParameterChange = (key, value) => {
    setParameters(prev => {
      const newParams = {
      ...prev,
      [key]: value
      };
      // Add to history (remove any future history if we're not at the end)
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ ...newParams });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      return newParams;
    });
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setParameters({ ...history[newIndex] });
      setSliderComplexity(history[newIndex].complexity);
      generateArtwork();
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setParameters({ ...history[newIndex] });
      setSliderComplexity(history[newIndex].complexity);
      generateArtwork();
    }
  };

  const randomizeSeed = () => {
    handleParameterChange('seed', Math.floor(Math.random() * 100000));
  };

  const savePreset = () => {
    if (!presetName.trim()) {
      alert('Please enter a preset name');
      return;
    }
    const newPreset = {
      id: Date.now().toString(),
      name: presetName,
      parameters: { ...parameters },
      createdAt: new Date().toISOString()
    };
    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    localStorage.setItem('artPresets', JSON.stringify(updatedPresets));
    setPresetName('');
    setShowPresetModal(false);
    alert('Preset saved!');
  };

  const loadPreset = (preset) => {
    setParameters(preset.parameters);
    setSliderComplexity(preset.parameters.complexity);
    generateArtwork();
  };

  const deletePreset = (presetId) => {
    if (confirm('Delete this preset?')) {
      const updatedPresets = presets.filter(p => p.id !== presetId);
      setPresets(updatedPresets);
      localStorage.setItem('artPresets', JSON.stringify(updatedPresets));
    }
  };

  const saveArtwork = async () => {
    if (!currentUser) return;

    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        alert('Canvas not ready. Please wait for the preview to load.');
        return;
      }
      const imageData = canvas.toDataURL('image/png');

      // Ensure parameters is not empty
      if (!parameters || Object.keys(parameters).length === 0) {
        alert('Parameters are missing. Please try again.');
        return;
      }

      const artworkPayload = {
        title: artworkData.title || 'Untitled Artwork',
        description: artworkData.description || '',
        parameters: parameters, // Ensure this is always sent
        imageData: imageData,
        tags: artworkData.tags ? artworkData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
        isPublic: artworkData.isPublic !== false,
        marketplace: {
          forSale: false,
          price: 0
        }
      };

      console.log('Saving artwork with payload:', { ...artworkPayload, imageData: '[base64 data]' }); // Debug log

      await api.createArtwork(artworkPayload);
      alert('Artwork saved successfully!');
    } catch (error) {
      console.error('Error saving artwork:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to save artwork';
      alert(`Failed to save artwork: ${errorMessage}`);
    }
  };

  const generateServerSide = async () => {
    try {
      const res = await api.generatePreview({ parameters });
      setServerPreview(res.previewUrl);
    } catch (err) {
      console.error(err);
      alert('Server generation failed');
    }
  };

  const downloadArtwork = (format = 'png') => {
    if (format === 'png') {
    const canvas = canvasRef.current;
      // Create high-resolution export canvas
      const exportWidth = canvasSize.width * exportQuality;
      const exportHeight = canvasSize.height * exportQuality;
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = exportWidth;
      exportCanvas.height = exportHeight;
      const exportCtx = exportCanvas.getContext('2d');
      
      // Scale and draw
      exportCtx.drawImage(canvas, 0, 0, exportWidth, exportHeight);
      
    const link = document.createElement('a');
    link.download = `artwork-${parameters.seed}.png`;
      link.href = exportCanvas.toDataURL('image/png');
    link.click();
    } else if (format === 'svg') {
      const svg = generateSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `artwork-${parameters.seed}.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'json') {
      const data = {
        parameters,
        metadata: {
          seed: parameters.seed,
          exportedAt: new Date().toISOString(),
          version: '1.0'
        }
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `artwork-${parameters.seed}.json`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const generateSVG = () => {
    const width = 800;
    const height = 600;
    let seed = parameters.seed;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;

    // Generate SVG based on pattern (simplified version)
    const pattern = parameters.pattern;
    if (pattern === 'spiral') {
      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadius = Math.min(width, height) / 3;
      const baseSize = 4;

      for (let i = 0; i < parameters.complexity * 50; i++) {
        const angle = i * 0.1;
        const radius = (maxRadius * i) / (parameters.complexity * 50);
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const size = baseSize * (parameters.sizeVariation.min + 
          (random() * (parameters.sizeVariation.max - parameters.sizeVariation.min)));
        const color = parameters.colors[i % parameters.colors.length];
        const opacity = parameters.opacity;

        if (parameters.shapes.includes('circles')) {
          svg += `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" opacity="${opacity}"/>`;
        } else if (parameters.shapes.includes('squares')) {
          svg += `<rect x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}" fill="${color}" opacity="${opacity}"/>`;
        }
      }
    }

    svg += '</svg>';
    return svg;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Create Generative Art</h1>
          <p className="text-gray-600 dark:text-gray-300">Design beautiful algorithmic artworks with our advanced tools</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Parameters Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Parameters</h3>

              {/* Canvas Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Canvas Size</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <button
                    onClick={() => setCanvasSize({ width: 800, height: 600 })}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    800×600
                  </button>
                  <button
                    onClick={() => setCanvasSize({ width: 1024, height: 768 })}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    1024×768
                  </button>
                  <button
                    onClick={() => setCanvasSize({ width: 1920, height: 1080 })}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    1920×1080
                  </button>
                  <button
                    onClick={() => setCanvasSize({ width: 600, height: 600 })}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    600×600
                  </button>
                  <button
                    onClick={() => setCanvasSize({ width: 1200, height: 1200 })}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    1200×1200
                  </button>
                  <button
                    onClick={() => setCanvasSize({ width: 400, height: 600 })}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    400×600
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400">Width</label>
                    <input
                      type="number"
                      min="100"
                      max="4000"
                      value={canvasSize.width}
                      onChange={(e) => setCanvasSize(prev => ({ ...prev, width: parseInt(e.target.value) || 800 }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400">Height</label>
                    <input
                      type="number"
                      min="100"
                      max="4000"
                      value={canvasSize.height}
                      onChange={(e) => setCanvasSize(prev => ({ ...prev, height: parseInt(e.target.value) || 600 }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Colors */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Colors</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {colorPalettes.map((palette) => (
                    <button
                      key={palette.name}
                      onClick={() => handleParameterChange('colors', palette.colors)}
                      className="flex items-center space-x-2 p-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <div className="flex space-x-1">
                        {palette.colors.slice(0, 3).map((color, i) => (
                          <div key={i} className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                      <span className="text-sm">{palette.name}</span>
                    </button>
                  ))}
                </div>

                {/* Color Harmony Picker */}
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Color Harmony
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => applyColorHarmony('complementary')}
                      className="px-3 py-2 text-xs bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-800"
                    >
                      Complementary
                    </button>
                    <button
                      onClick={() => applyColorHarmony('triadic')}
                      className="px-3 py-2 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800"
                    >
                      Triadic
                    </button>
                    <button
                      onClick={() => applyColorHarmony('analogous')}
                      className="px-3 py-2 text-xs bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 rounded-lg hover:bg-pink-200 dark:hover:bg-pink-800"
                    >
                      Analogous
                    </button>
                    <button
                      onClick={() => applyColorHarmony('splitComplementary')}
                      className="px-3 py-2 text-xs bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 rounded-lg hover:bg-teal-200 dark:hover:bg-teal-800"
                    >
                      Split Comp
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Based on first color in palette
                  </p>
                </div>
              </div>

              {/* Pattern */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pattern</label>
                <select
                  value={parameters.pattern}
                  onChange={(e) => handleParameterChange('pattern', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                >
                  {patterns.map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {pattern.charAt(0).toUpperCase() + pattern.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Shapes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Shapes</label>
                <div className="flex flex-wrap gap-2">
                  {shapes.map((shape) => (
                    <button
                      key={shape}
                      onClick={() => handleParameterChange('shapes', [shape])}
                      className={`px-3 py-1 rounded-full text-sm ${
                        parameters.shapes.includes(shape)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {shape}
                    </button>
                  ))}
                </div>
              </div>

              {/* Complexity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Complexity: {sliderComplexity}
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={sliderComplexity}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setSliderComplexity(value);
                    debouncedComplexityUpdate(value);
                  }}
                  className="w-full cursor-grab active:cursor-grabbing"
                />
              </div>

              {/* Seed */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Seed</label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    value={parameters.seed}
                    onChange={(e) => handleParameterChange('seed', parseInt(e.target.value))}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                  <button
                    onClick={randomizeSeed}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    <Shuffle className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Advanced Parameters Section */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Advanced Controls</h4>

                {/* Opacity */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Opacity: {Math.round(parameters.opacity * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={parameters.opacity}
                    onChange={(e) => handleParameterChange('opacity', parseFloat(e.target.value))}
                    className="w-full cursor-grab active:cursor-grabbing"
                  />
                </div>

                {/* Size Variation */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Size Variation
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400">Min: {parameters.sizeVariation.min.toFixed(1)}</label>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.1"
                        value={parameters.sizeVariation.min}
                        onChange={(e) => handleParameterChange('sizeVariation', {
                          ...parameters.sizeVariation,
                          min: parseFloat(e.target.value)
                        })}
                        className="w-full cursor-grab active:cursor-grabbing"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400">Max: {parameters.sizeVariation.max.toFixed(1)}</label>
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.1"
                        value={parameters.sizeVariation.max}
                        onChange={(e) => handleParameterChange('sizeVariation', {
                          ...parameters.sizeVariation,
                          max: parseFloat(e.target.value)
                        })}
                        className="w-full cursor-grab active:cursor-grabbing"
                      />
                    </div>
                  </div>
                </div>

                {/* Rotation */}
                <div className="mb-4">
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <input
                      type="checkbox"
                      checked={parameters.rotation.enabled}
                      onChange={(e) => handleParameterChange('rotation', {
                        ...parameters.rotation,
                        enabled: e.target.checked
                      })}
                      className="rounded"
                    />
                    <span>Enable Rotation</span>
                  </label>
                  {parameters.rotation.enabled && (
                    <div className="space-y-2 pl-6">
                      <div>
                        <label className="text-xs text-gray-600 dark:text-gray-400">
                          Base Angle: {parameters.rotation.angle}°
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={parameters.rotation.angle}
                          onChange={(e) => handleParameterChange('rotation', {
                            ...parameters.rotation,
                            angle: parseInt(e.target.value)
                          })}
                          className="w-full cursor-grab active:cursor-grabbing"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 dark:text-gray-400">
                          Variation: {parameters.rotation.variation}°
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="180"
                          value={parameters.rotation.variation}
                          onChange={(e) => handleParameterChange('rotation', {
                            ...parameters.rotation,
                            variation: parseInt(e.target.value)
                          })}
                          className="w-full cursor-grab active:cursor-grabbing"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Gradient */}
                <div className="mb-4">
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <input
                      type="checkbox"
                      checked={parameters.useGradient}
                      onChange={(e) => handleParameterChange('useGradient', e.target.checked)}
                      className="rounded"
                    />
                    <span>Use Gradient</span>
                  </label>
                  {parameters.useGradient && (
                    <select
                      value={parameters.gradientType}
                      onChange={(e) => handleParameterChange('gradientType', e.target.value)}
                      className="w-full mt-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    >
                      <option value="linear">Linear</option>
                      <option value="radial">Radial</option>
                    </select>
                  )}
                </div>

                {/* Visual Effects */}
                <div className="mb-4">
                  <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Visual Effects</h5>
                  
                  {/* Blur */}
                  <div className="mb-3">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Blur: {parameters.effects.blur}px
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      value={parameters.effects.blur}
                      onChange={(e) => handleParameterChange('effects', {
                        ...parameters.effects,
                        blur: parseInt(e.target.value)
                      })}
                      className="w-full cursor-grab active:cursor-grabbing"
                    />
                  </div>

                  {/* Glow */}
                  <div className="mb-3">
                    <label className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <input
                        type="checkbox"
                        checked={parameters.effects.glow.enabled}
                        onChange={(e) => handleParameterChange('effects', {
                          ...parameters.effects,
                          glow: { ...parameters.effects.glow, enabled: e.target.checked }
                        })}
                        className="rounded"
                      />
                      <span>Enable Glow</span>
                    </label>
                    {parameters.effects.glow.enabled && (
                      <div className="pl-6 space-y-2">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-500">
                            Intensity: {parameters.effects.glow.intensity}
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="30"
                            value={parameters.effects.glow.intensity}
                            onChange={(e) => handleParameterChange('effects', {
                              ...parameters.effects,
                              glow: { ...parameters.effects.glow, intensity: parseInt(e.target.value) }
                            })}
                            className="w-full cursor-grab active:cursor-grabbing"
                          />
                        </div>
                        <input
                          type="color"
                          value={parameters.effects.glow.color}
                          onChange={(e) => handleParameterChange('effects', {
                            ...parameters.effects,
                            glow: { ...parameters.effects.glow, color: e.target.value }
                          })}
                          className="w-full h-8 rounded"
                        />
                      </div>
                    )}
                  </div>

                  {/* Shadow */}
                  <div>
                    <label className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <input
                        type="checkbox"
                        checked={parameters.effects.shadow.enabled}
                        onChange={(e) => handleParameterChange('effects', {
                          ...parameters.effects,
                          shadow: { ...parameters.effects.shadow, enabled: e.target.checked }
                        })}
                        className="rounded"
                      />
                      <span>Enable Shadow</span>
                    </label>
                    {parameters.effects.shadow.enabled && (
                      <div className="pl-6 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-500">Offset X</label>
                            <input
                              type="range"
                              min="-20"
                              max="20"
                              value={parameters.effects.shadow.offsetX}
                              onChange={(e) => handleParameterChange('effects', {
                                ...parameters.effects,
                                shadow: { ...parameters.effects.shadow, offsetX: parseInt(e.target.value) }
                              })}
                              className="w-full cursor-grab active:cursor-grabbing"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-500">Offset Y</label>
                            <input
                              type="range"
                              min="-20"
                              max="20"
                              value={parameters.effects.shadow.offsetY}
                              onChange={(e) => handleParameterChange('effects', {
                                ...parameters.effects,
                                shadow: { ...parameters.effects.shadow, offsetY: parseInt(e.target.value) }
                              })}
                              className="w-full cursor-grab active:cursor-grabbing"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-500">
                            Blur: {parameters.effects.shadow.blur}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="30"
                            value={parameters.effects.shadow.blur}
                            onChange={(e) => handleParameterChange('effects', {
                              ...parameters.effects,
                              shadow: { ...parameters.effects.shadow, blur: parseInt(e.target.value) }
                            })}
                            className="w-full cursor-grab active:cursor-grabbing"
                          />
                        </div>
                        <input
                          type="color"
                          value={parameters.effects.shadow.color}
                          onChange={(e) => handleParameterChange('effects', {
                            ...parameters.effects,
                            shadow: { ...parameters.effects.shadow, color: e.target.value }
                          })}
                          className="w-full h-8 rounded"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Animation Controls */}
                <div className="mb-4">
                  <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Animation</h5>
                  
                  <div className="mb-3">
                    <label className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <input
                        type="checkbox"
                        checked={parameters.animation.enabled}
                        onChange={(e) => handleParameterChange('animation', {
                          ...parameters.animation,
                          enabled: e.target.checked
                        })}
                        className="rounded"
                      />
                      <span>Enable Animation</span>
                    </label>
                    {parameters.animation.enabled && (
                      <div className="pl-6 space-y-2 mt-2">
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-500 mb-1">
                            Speed: {parameters.animation.speed.toFixed(1)}x
                          </label>
                          <input
                            type="range"
                            min="0.1"
                            max="5"
                            step="0.1"
                            value={parameters.animation.speed}
                            onChange={(e) => handleParameterChange('animation', {
                              ...parameters.animation,
                              speed: parseFloat(e.target.value)
                            })}
                            className="w-full cursor-grab active:cursor-grabbing"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-500 mb-1">
                            Animation Type
                          </label>
                          <select
                            value={parameters.animation.type}
                            onChange={(e) => handleParameterChange('animation', {
                              ...parameters.animation,
                              type: e.target.value
                            })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-xs"
                          >
                            <option value="rotation">Rotation</option>
                            <option value="pulse">Pulse</option>
                            <option value="wave">Wave</option>
                            <option value="spiral">Spiral</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Presets Section */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Presets</h4>
                  <button
                    onClick={() => setShowPresetModal(true)}
                    className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    Save Preset
                  </button>
                </div>
                {presets.length > 0 ? (
                  <div className="space-y-2">
                    {presets.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
                      >
                        <button
                          onClick={() => loadPreset(preset)}
                          className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                        >
                          {preset.name}
                        </button>
                        <button
                          onClick={() => deletePreset(preset.id)}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">No presets saved</p>
                )}
              </div>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Preview</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={undo}
                    disabled={historyIndex === 0}
                    className="flex items-center space-x-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Undo"
                  >
                    <Undo className="h-4 w-4" />
                  </button>
                  <button
                    onClick={redo}
                    disabled={historyIndex === history.length - 1}
                    className="flex items-center space-x-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Redo"
                  >
                    <Redo className="h-4 w-4" />
                  </button>
                  <button
                    onClick={generateServerSide}
                    className="flex items-center space-x-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
                  >
                    <Cloud className="h-4 w-4" />
                    <span>Generate on server</span>
                  </button>
                  <button
                    onClick={() => setShowFullscreen(true)}
                    className="flex items-center space-x-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    title="Fullscreen Preview"
                  >
                    <Maximize className="h-4 w-4" />
                  </button>
                  <div className="relative group">
                    <button
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download</span>
                  </button>
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                          Export Quality: {exportQuality}x
                        </label>
                        <input
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.1"
                          value={exportQuality}
                          onChange={(e) => setExportQuality(parseFloat(e.target.value))}
                          className="w-full cursor-grab active:cursor-grabbing"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <button
                        onClick={() => downloadArtwork('png')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Download as PNG
                      </button>
                      <button
                        onClick={() => downloadArtwork('svg')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Download as SVG
                      </button>
                      <button
                        onClick={() => downloadArtwork('json')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg"
                      >
                        Export Parameters (JSON)
                      </button>
                    </div>
                  </div>
                  {currentUser && (
                    <button
                      onClick={saveArtwork}
                      className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      <Save className="h-4 w-4" />
                      <span>Save</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-center">
                <canvas
                  ref={canvasRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg max-w-full h-auto"
                />
              </div>
              {serverPreview && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Server-generated preview:</p>
                  <img src={serverPreview} alt="Server preview" className="w-full max-w-xl rounded-lg border border-gray-200 dark:border-gray-700" />
                </div>
              )}
            </div>

            {/* Artwork Details */}
            {currentUser && (
              <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Artwork Details</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Artwork title"
                    value={artworkData.title}
                    onChange={(e) => setArtworkData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                  <textarea
                    placeholder="Description"
                    value={artworkData.description}
                    onChange={(e) => setArtworkData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    rows={3}
                  />
                  <input
                    type="text"
                    placeholder="Tags (comma separated)"
                    value={artworkData.tags}
                    onChange={(e) => setArtworkData(prev => ({ ...prev, tags: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={artworkData.isPublic}
                      onChange={(e) => setArtworkData(prev => ({ ...prev, isPublic: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Make public</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preset Save Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Save Preset</h3>
            <input
              type="text"
              placeholder="Preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white mb-4"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  savePreset();
                }
              }}
            />
            <div className="flex space-x-2">
              <button
                onClick={savePreset}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowPresetModal(false);
                  setPresetName('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Preview Modal */}
      {showFullscreen && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className="relative w-full h-full flex items-center justify-center p-8">
            <button
              onClick={() => setShowFullscreen(false)}
              className="absolute top-4 right-4 p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white z-10"
            >
              <X className="h-6 w-6" />
            </button>
            <canvas
              ref={fullscreenCanvasRef}
              className="max-w-full max-h-full border-2 border-white rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtCreator;
