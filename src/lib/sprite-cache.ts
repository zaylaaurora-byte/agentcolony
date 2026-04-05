// ─── Sprite Cache System — Pixel-Agents Architecture ─────────────────────────
// Loads PNG sprites, caches as offscreen canvases at each zoom level
// Supports both pixel-agents (16x24, 4 dirs × walk/type/read) and Sprout Lands (32x32, 4 dirs × walk)

import { CharSkin, Direction, SpriteSet, DEFAULT_ZOOM } from './game-engine';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SpriteFrame {
  img: HTMLImageElement;
  loaded: boolean;
}

interface CharacterSpriteSet {
  walk: Record<Direction, SpriteFrame[]>;
  type: Record<Direction, SpriteFrame[]>;
  read: Record<Direction, SpriteFrame[]>;
  idle: Record<Direction, SpriteFrame>; // single frame per direction
}

interface OffscreenCache {
  zoom: number;
  canvas: HTMLCanvasElement;
}

// ─── Cache ────────────────────────────────────────────────────────────────────
const spriteData = new Map<string, CharacterSpriteSet>();
const imageCache = new Map<string, HTMLImageElement>();
const offscreenCache = new Map<string, Map<number, OffscreenCache>>();
let allLoaded = false;
let loadCallbacks: (() => void)[] = [];

// ─── Character configurations ─────────────────────────────────────────────────
const CHAR_TYPES: CharSkin[] = ['mastermind', 'worker', 'reviewer', 'creative', 'hacker', 'analyst'];
const DIRECTIONS: Direction[] = ['down', 'up', 'right', 'left'];

// ─── Image Loader ─────────────────────────────────────────────────────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => {
      // Create blank fallback
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 24;
      imageCache.set(src, img);
      resolve(img);
    };
    img.src = src;
  });
}

// ─── Load all character sprites ───────────────────────────────────────────────
export async function loadAllSprites(): Promise<void> {
  const promises: Promise<void>[] = [];

  for (const skin of CHAR_TYPES) {
    const sprites: CharacterSpriteSet = {
      walk: { down: [], up: [], right: [], left: [] },
      type: { down: [], up: [], right: [], left: [] },
      read: { down: [], up: [], right: [], left: [] },
      idle: { down: { img: new Image(), loaded: false }, up: { img: new Image(), loaded: false }, right: { img: new Image(), loaded: false }, left: { img: new Image(), loaded: false } },
    };

    // Load pixel-agents sprites
    for (const dir of DIRECTIONS) {
      // Walk frames (4)
      for (let i = 1; i <= 4; i++) {
        const src = `/sprites/characters/pixel-agents/${skin}/${dir}_walk${i}.png`;
        promises.push(
          loadImage(src).then(img => {
            sprites.walk[dir].push({ img, loaded: img.complete && img.naturalWidth > 0 });
          })
        );
      }

      // Type frames (2)
      for (let i = 1; i <= 2; i++) {
        const src = `/sprites/characters/pixel-agents/${skin}/${dir}_type${i}.png`;
        promises.push(
          loadImage(src).then(img => {
            sprites.type[dir].push({ img, loaded: img.complete && img.naturalWidth > 0 });
          })
        );
      }

      // Read frame (1)
      const readSrc = `/sprites/characters/pixel-agents/${skin}/${dir}_read.png`;
      promises.push(
        loadImage(readSrc).then(img => {
          sprites.read[dir].push({ img, loaded: img.complete && img.naturalWidth > 0 });
        })
      );

      // Idle = walk frame 1
      const idleSrc = `/sprites/characters/pixel-agents/${skin}/${dir}_walk1.png`;
      promises.push(
        loadImage(idleSrc).then(img => {
          sprites.idle[dir] = { img, loaded: img.complete && img.naturalWidth > 0 };
        })
      );
    }

    spriteData.set(skin, sprites);
  }

  // Also load Sprout Lands sprites
  const sproutSkins: CharSkin[] = ['mastermind', 'worker', 'reviewer', 'creative'];
  for (const skin of sproutSkins) {
    // Sprout Lands has: idle, walk1, walk2, walk3 per direction
    // We'll store them separately under a "sprout-lands" prefix
    for (const dir of DIRECTIONS) {
      const frames = ['idle', 'walk1', 'walk2', 'walk3'];
      for (const frame of frames) {
        const src = `/sprites/characters/${skin}/${dir}_${frame}.png`;
        promises.push(loadImage(src)); // preload into imageCache
      }
    }
  }

  await Promise.all(promises);
  allLoaded = true;
  loadCallbacks.forEach(cb => cb());
  loadCallbacks = [];
}

export function onSpritesLoaded(cb: () => void): void {
  if (allLoaded) {
    cb();
  } else {
    loadCallbacks.push(cb);
  }
}

export function isReady(): boolean {
  return allLoaded;
}

// ─── Get sprite for agent state ──────────────────────────────────────────────
export function getSpriteForAgent(
  skin: CharSkin,
  spriteSet: SpriteSet,
  state: string, // 'idle' | 'walk' | 'type' | 'read'
  direction: Direction,
  animFrame: number,
): HTMLImageElement | null {
  const sprites = spriteData.get(skin);
  if (!sprites) return null;

  // For pixel-agents sprite set
  if (spriteSet === 'pixel-agents') {
    let frame: SpriteFrame | undefined;

    switch (state) {
      case 'walk': {
        const walkFrames = sprites.walk[direction];
        if (walkFrames.length > 0) {
          frame = walkFrames[animFrame % walkFrames.length];
        }
        break;
      }
      case 'type': {
        const typeFrames = sprites.type[direction];
        if (typeFrames.length > 0) {
          frame = typeFrames[animFrame % typeFrames.length];
        }
        break;
      }
      case 'read': {
        const readFrames = sprites.read[direction];
        if (readFrames.length > 0) {
          frame = readFrames[animFrame % readFrames.length];
        }
        break;
      }
      case 'idle':
      default: {
        frame = sprites.idle[direction];
        break;
      }
    }

    if (frame && frame.loaded && frame.img.naturalWidth > 0) {
      return frame.img;
    }
  }

  // Fallback: try pixel-agents idle
  const idleFrame = sprites.idle[direction];
  if (idleFrame && idleFrame.loaded && idleFrame.img.naturalWidth > 0) {
    return idleFrame.img;
  }

  // Try Sprout Lands as fallback
  if (spriteSet === 'sprout-lands') {
    return getSproutLandsSprite(skin, state, direction, animFrame);
  }

  return null;
}

function getSproutLandsSprite(
  skin: CharSkin,
  state: string,
  direction: Direction,
  animFrame: number,
): HTMLImageElement | null {
  let frameName: string;
  switch (state) {
    case 'walk': {
      const walkFrames = ['walk1', 'walk2', 'walk3'];
      frameName = walkFrames[animFrame % walkFrames.length];
      break;
    }
    case 'type':
    case 'read':
    case 'idle':
    default:
      frameName = 'idle';
      break;
  }

  const src = `/sprites/characters/${skin}/${direction}_${frameName}.png`;
  const img = imageCache.get(src);
  if (img && img.complete && img.naturalWidth > 0) {
    return img;
  }
  return null;
}

// ─── Offscreen Canvas Cache ───────────────────────────────────────────────────
// Caches scaled sprite renders per zoom level for fast blitting

export function getCachedSprite(
  img: HTMLImageElement,
  zoom: number,
  targetW: number,
  targetH: number,
): HTMLCanvasElement {
  const cacheKey = `${img.src}_${targetW}_${targetH}`;
  
  let zoomCache = offscreenCache.get(cacheKey);
  if (!zoomCache) {
    zoomCache = new Map();
    offscreenCache.set(cacheKey, zoomCache);
  }

  const roundedZoom = Math.round(zoom * 2) / 2; // Snap to 0.5 increments
  let cached = zoomCache.get(roundedZoom);
  if (cached) return cached.canvas;

  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * roundedZoom);
  canvas.height = Math.round(img.naturalHeight * roundedZoom);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  zoomCache.set(roundedZoom, { zoom: roundedZoom, canvas });
  return canvas;
}

// ─── Sprite Dimensions ────────────────────────────────────────────────────────
// pixel-agents: 16x24 per frame
// Sprout Lands: 32x32 per frame

export function getSpriteDimensions(spriteSet: SpriteSet): { w: number; h: number } {
  if (spriteSet === 'sprout-lands') {
    return { w: 32, h: 32 };
  }
  return { w: 16, h: 24 };
}
