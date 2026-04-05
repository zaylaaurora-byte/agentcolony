// ─── Game World Engine v3 ─────────────────────────────────────────────────
// Optimized tilemap with Sprout Lands tileset support
// Uses real tile images for beautiful rendering

export const TILE_SIZE = 32;
export const MAP_COLS = 40;
export const MAP_ROWS = 30;
export const WORLD_W = MAP_COLS * TILE_SIZE;
export const WORLD_H = MAP_ROWS * TILE_SIZE;

// ─── Tile Types ─────────────────────────────────────────────────────────────
export enum TileType {
  GRASS = 0,
  GRASS_DARK = 1,
  GRASS_LIGHT = 2,
  DIRT = 3,
  WATER = 4,
  WATER_DEEP = 5,
  FENCE_H = 6,       // horizontal fence
  FENCE_V = 7,       // vertical fence
  FENCE_CORNER = 8,
  BUILDING_FLOOR = 9,
  PATH = 10,
  PATH_STONE = 11,
  HILL = 12,
  TILLED = 13,
  FLOWER_RED = 14,
  FLOWER_YELLOW = 15,
  FLOWER_BLUE = 16,
  FLOWER_WHITE = 17,
}

// Which tile types are walkable
export const TILE_WALKABLE: Record<number, boolean> = {
  [TileType.GRASS]: true,
  [TileType.GRASS_DARK]: true,
  [TileType.GRASS_LIGHT]: true,
  [TileType.DIRT]: true,
  [TileType.WATER]: false,
  [TileType.WATER_DEEP]: false,
  [TileType.FENCE_H]: false,
  [TileType.FENCE_V]: false,
  [TileType.FENCE_CORNER]: false,
  [TileType.BUILDING_FLOOR]: true,
  [TileType.PATH]: true,
  [TileType.PATH_STONE]: true,
  [TileType.HILL]: false,
  [TileType.TILLED]: true,
  [TileType.FLOWER_RED]: true,
  [TileType.FLOWER_YELLOW]: true,
  [TileType.FLOWER_BLUE]: true,
  [TileType.FLOWER_WHITE]: true,
};

// ─── Buildings ──────────────────────────────────────────────────────────────
export interface Building {
  id: string;
  name: string;
  emoji: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export const BUILDINGS: Building[] = [
  { id: 'planning-desk', name: 'Planning', emoji: '📋', x: 1, y: 1, w: 5, h: 4, color: '#8B5CF6' },
  { id: 'workbench', name: 'Workshop', emoji: '🔧', x: 34, y: 1, w: 5, h: 4, color: '#F97316' },
  { id: 'review-desk', name: 'QA Lab', emoji: '🔍', x: 1, y: 25, w: 5, h: 4, color: '#10B981' },
  { id: 'creative-studio', name: 'Studio', emoji: '🎨', x: 34, y: 25, w: 5, h: 4, color: '#EC4899' },
  { id: 'town-hall', name: 'Town Hall', emoji: '🏛️', x: 17, y: 12, w: 6, h: 5, color: '#F59E0B' },
];

export const STATION_POSITIONS: Record<string, { x: number; y: number }> = {
  'planning-desk': { x: 3, y: 6 },
  'workbench': { x: 36, y: 6 },
  'review-desk': { x: 3, y: 30 },
  'creative-studio': { x: 36, y: 30 },
  'town-hall': { x: 20, y: 18 },
  idle: { x: 20, y: 15 },
  center: { x: 20, y: 15 },
};

// ─── Decorations ────────────────────────────────────────────────────────────
export interface Decoration {
  x: number;
  y: number;
  type: 'rock' | 'bush' | 'grass_tuft' | 'stump';
  variant: number; // 0-3 for different looks
}

// ─── Deterministic RNG ──────────────────────────────────────────────────────
function createRNG(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ─── Generate Map ───────────────────────────────────────────────────────────
export function generateMap(): { tiles: TileType[][]; decorations: Decoration[] } {
  const tiles: TileType[][] = [];
  const rng = createRNG(42);
  const decorations: Decoration[] = [];

  for (let y = 0; y < MAP_ROWS; y++) {
    const row: TileType[] = [];
    for (let x = 0; x < MAP_COLS; x++) {
      let tile = TileType.GRASS;

      // Grass variation
      const grassHash = ((x * 7 + y * 13 + x * y) % 10);
      if (grassHash < 2) tile = TileType.GRASS_DARK;
      else if (grassHash < 4) tile = TileType.GRASS_LIGHT;

      // ── Water pond (top-right area) ──
      const wx = x - 30, wy = y - 8;
      const waterDist = wx * wx / 12 + wy * wy / 8;
      if (waterDist < 1) {
        tile = waterDist < 0.4 ? TileType.WATER_DEEP : TileType.WATER;
      }

      // ── Dirt paths ──
      // Main horizontal paths
      if (y === 6 && x >= 1 && x <= 39) tile = TileType.PATH;
      if (y === 23 && x >= 1 && x <= 39) tile = TileType.PATH;
      // Main vertical paths
      if (x === 8 && y >= 1 && y <= 29) tile = TileType.PATH;
      if (x === 31 && y >= 1 && y <= 29) tile = TileType.PATH;
      // Center crossroad (wider)
      if ((x >= 8 && x <= 31) && (y === 14 || y === 15)) tile = TileType.PATH;
      // Path to town hall
      if (x >= 17 && x <= 22 && (y === 11 || y === 17)) tile = TileType.PATH;

      // Stone details on paths
      const pathHash = ((x * 3 + y * 7) % 8);
      if (tile === TileType.PATH && pathHash < 2) tile = TileType.PATH_STONE;

      // ── Building floors ──
      for (const b of BUILDINGS) {
        if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
          tile = TileType.BUILDING_FLOOR;
        }
      }

      // ── Fences around buildings ──
      if (tile !== TileType.BUILDING_FLOOR && tile !== TileType.PATH && tile !== TileType.PATH_STONE) {
        for (const b of BUILDINGS) {
          const bx = x - b.x, by = y - b.y;
          // Check if adjacent to building
          if (bx >= -1 && bx <= b.w && by >= -1 && by <= b.h) {
            const onEdge = (bx === -1 || bx === b.w) && (by >= -1 && by <= b.h) ||
                           (by === -1 || by === b.h) && (bx >= -1 && bx <= b.w);
            const onCorner = (bx === -1 || bx === b.w) && (by === -1 || by === b.h);
            if (onEdge && !onCorner) {
              // Determine fence direction
              if (by === -1 || by === b.h) {
                tile = TileType.FENCE_H;
              } else {
                tile = TileType.FENCE_V;
              }
            }
            if (onCorner) {
              tile = TileType.FENCE_CORNER;
            }
          }
        }
      }

      // ── Dirt border around water ──
      const wx2 = x - 30, wy2 = y - 8;
      const dirtDist = wx2 * wx2 / 16 + wy2 * wy2 / 10;
      if (dirtDist < 1 && waterDist >= 1) {
        tile = TileType.DIRT;
      }

      // ── Flowers (sparse) ──
      const flowerRng = rng();
      if (tile === TileType.GRASS || tile === TileType.GRASS_DARK || tile === TileType.GRASS_LIGHT) {
        if (flowerRng < 0.008) tile = TileType.FLOWER_RED;
        else if (flowerRng < 0.016) tile = TileType.FLOWER_YELLOW;
        else if (flowerRng < 0.022) tile = TileType.FLOWER_BLUE;
        else if (flowerRng < 0.026) tile = TileType.FLOWER_WHITE;
      }

      row.push(tile);
    }
    tiles.push(row);
  }

  // ── Decorations ──
  for (let y = 0; y < MAP_ROWS; y++) {
    for (let x = 0; x < MAP_COLS; x++) {
      const t = tiles[y][x];
      if (t !== TileType.GRASS && t !== TileType.GRASS_DARK && t !== TileType.GRASS_LIGHT) continue;

      // Skip near buildings, paths, water
      let skip = false;
      for (const b of BUILDINGS) {
        if (x >= b.x - 2 && x <= b.x + b.w + 1 && y >= b.y - 2 && y <= b.y + b.h + 1) skip = true;
      }
      if (x >= 7 && x <= 9) skip = true;
      if (x >= 30 && x <= 32) skip = true;
      if (y === 6 || y === 14 || y === 15 || y === 23) skip = true;
      if (skip) continue;

      const r = rng();
      if (r < 0.015) decorations.push({ x, y, type: 'rock', variant: Math.floor(rng() * 4) });
      else if (r < 0.035) decorations.push({ x, y, type: 'bush', variant: Math.floor(rng() * 4) });
      else if (r < 0.05) decorations.push({ x, y, type: 'grass_tuft', variant: Math.floor(rng() * 4) });
      else if (r < 0.055) decorations.push({ x, y, type: 'stump', variant: Math.floor(rng() * 4) });
    }
  }

  return { tiles, decorations };
}

// ─── Resources ──────────────────────────────────────────────────────────────
export interface Resources {
  money: number;
  population: number;
  totalEnergy: number;
  tasksCompleted: number;
  tasksFailed: number;
  iteration: number;
  maxIterations: number;
  qualityScore: number;
  qualityThreshold: number;
}

export function createInitialResources(): Resources {
  return {
    money: 1000,
    population: 1,
    totalEnergy: 100,
    tasksCompleted: 0,
    tasksFailed: 0,
    iteration: 0,
    maxIterations: 20,
    qualityScore: 0,
    qualityThreshold: 8,
  };
}

// ─── Day/Night Cycle ───────────────────────────────────────────────────────
export function getDayNightOverlay(gameTick: number): { color: string; opacity: number; phase: string } {
  const cycle = 1200;
  const t = (gameTick % cycle) / cycle;

  if (t < 0.2) {
    return { color: '#FF8C00', opacity: Math.max(0, 0.12 * (1 - t / 0.2)), phase: '🌅 Dawn' };
  } else if (t < 0.5) {
    return { color: '#000000', opacity: 0, phase: '☀️ Day' };
  } else if (t < 0.7) {
    const f = (t - 0.5) / 0.2;
    return { color: '#1a1a4e', opacity: 0.1 * f, phase: '🌇 Dusk' };
  } else {
    const f = (t - 0.7) / 0.3;
    return { color: '#0a0a2e', opacity: 0.1 + 0.06 * Math.sin(f * Math.PI), phase: '🌙 Night' };
  }
}

// ─── Camera ─────────────────────────────────────────────────────────────────
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function clampCamera(cam: Camera, canvasW: number, canvasH: number): Camera {
  const viewW = canvasW / cam.zoom;
  const viewH = canvasH / cam.zoom;
  return {
    ...cam,
    x: Math.max(0, Math.min(WORLD_W - viewW, cam.x)),
    y: Math.max(0, Math.min(WORLD_H - viewH, cam.y)),
    zoom: Math.max(0.5, Math.min(3, cam.zoom)),
  };
}

// ─── Pre-rendered minimap ──────────────────────────────────────────────────
export function createMinimapCanvas(
  tiles: TileType[][],
  agents: { pixelX: number; pixelY: number; color: string }[],
  cam: Camera,
  canvasW: number,
  canvasH: number,
): HTMLCanvasElement | null {
  const scale = 2.5;
  const mmW = MAP_COLS * scale;
  const mmH = MAP_ROWS * scale;
  const padding = 10;

  const canvas = document.createElement('canvas');
  canvas.width = mmW + padding * 2;
  canvas.height = mmH + padding * 2 + 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const ox = padding;
  const oy = padding + 16;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 6);
  ctx.fill();

  // Phase label
  const dn = getDayNightOverlay(0);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(dn.phase, ox, oy - 5);

  // Tile colors
  const tileColors: Record<number, string> = {
    [TileType.GRASS]: '#5a8c4a',
    [TileType.GRASS_DARK]: '#4a7a3a',
    [TileType.GRASS_LIGHT]: '#6a9c5a',
    [TileType.DIRT]: '#8B7355',
    [TileType.WATER]: '#3a7bd5',
    [TileType.WATER_DEEP]: '#2a5ba5',
    [TileType.FENCE_H]: '#6B4423',
    [TileType.FENCE_V]: '#6B4423',
    [TileType.FENCE_CORNER]: '#6B4423',
    [TileType.BUILDING_FLOOR]: '#9e8e7e',
    [TileType.PATH]: '#b09070',
    [TileType.PATH_STONE]: '#a08060',
    [TileType.HILL]: '#7a6a5a',
    [TileType.TILLED]: '#7a6040',
    [TileType.FLOWER_RED]: '#5a8c4a',
    [TileType.FLOWER_YELLOW]: '#5a8c4a',
    [TileType.FLOWER_BLUE]: '#5a8c4a',
    [TileType.FLOWER_WHITE]: '#5a8c4a',
  };

  // Batch draw tiles
  const batches = new Map<string, { x: number; y: number }[]>();
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const color = tileColors[tiles[r][c]] || '#5a8c4a';
      if (!batches.has(color)) batches.set(color, []);
      batches.get(color)!.push({ x: ox + c * scale, y: oy + r * scale });
    }
  }
  for (const [color, pts] of batches) {
    ctx.fillStyle = color;
    for (const p of pts) ctx.fillRect(p.x, p.y, scale, scale);
  }

  // Buildings
  for (const b of BUILDINGS) {
    ctx.fillStyle = b.color + '60';
    ctx.fillRect(ox + b.x * scale, oy + b.y * scale, b.w * scale, b.h * scale);
    ctx.strokeStyle = b.color + '80';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(ox + b.x * scale, oy + b.y * scale, b.w * scale, b.h * scale);
  }

  // Agents
  for (const a of agents) {
    ctx.fillStyle = a.color;
    ctx.fillRect(ox + (a.pixelX / TILE_SIZE) * scale - 1, oy + (a.pixelY / TILE_SIZE) * scale - 1, 3, 3);
  }

  // Viewport
  const vpX = ox + (cam.x / TILE_SIZE) * scale;
  const vpY = oy + (cam.y / TILE_SIZE) * scale;
  const vpW = (canvasW / cam.zoom / TILE_SIZE) * scale;
  const vpH = (canvasH / cam.zoom / TILE_SIZE) * scale;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(vpX, vpY, vpW, vpH);

  return canvas;
}
