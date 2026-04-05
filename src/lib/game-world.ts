// ─── Game World Engine ─────────────────────────────────────────────────────
// Core simulation: tilemap, buildings, pathfinding, resources, day/night cycle

export const TILE_SIZE = 32; // Render size
export const MAP_COLS = 40;
export const MAP_ROWS = 30;
export const WORLD_W = MAP_COLS * TILE_SIZE;
export const WORLD_H = MAP_ROWS * TILE_SIZE;

// ─── Tile Types ─────────────────────────────────────────────────────────────
export enum TileType {
  GRASS = 0,
  DIRT = 1,
  WATER = 2,
  FENCE = 3,
  BUILDING_FLOOR = 4,
  PATH = 5,
}

export const TILE_WALKABLE: Record<TileType, boolean> = {
  [TileType.GRASS]: true,
  [TileType.DIRT]: true,
  [TileType.WATER]: false,
  [TileType.FENCE]: false,
  [TileType.BUILDING_FLOOR]: true,
  [TileType.PATH]: true,
};

// ─── Buildings ──────────────────────────────────────────────────────────────
export interface Building {
  id: string;
  name: string;
  emoji: string;
  x: number; // tile col (top-left)
  y: number; // tile row (top-left)
  w: number; // width in tiles
  h: number; // height in tiles
  color: string;
}

export const BUILDINGS: Building[] = [
  { id: 'planning-desk', name: 'Planning Desk', emoji: '📋', x: 2, y: 2, w: 4, h: 3, color: '#8B5CF6' },
  { id: 'workbench', name: 'Workshop', emoji: '🔧', x: 34, y: 2, w: 4, h: 3, color: '#F97316' },
  { id: 'review-desk', name: 'QA Lab', emoji: '🔍', x: 2, y: 25, w: 4, h: 3, color: '#10B981' },
  { id: 'creative-studio', name: 'Studio', emoji: '🎨', x: 34, y: 25, w: 4, h: 3, color: '#EC4899' },
];

// Station positions (where agents walk to when using a building)
export const STATION_POSITIONS: Record<string, { x: number; y: number }> = {
  'planning-desk': { x: 4, y: 5 },
  workbench: { x: 36, y: 5 },
  'review-desk': { x: 4, y: 27 },
  'creative-studio': { x: 36, y: 27 },
  idle: { x: 20, y: 15 },
  center: { x: 20, y: 15 },
};

// ─── Generate Map ───────────────────────────────────────────────────────────
export function generateMap(): TileType[][] {
  const map: TileType[][] = [];

  for (let y = 0; y < MAP_ROWS; y++) {
    const row: TileType[] = [];
    for (let x = 0; x < MAP_COLS; x++) {
      // Start with grass
      let tile = TileType.GRASS;

      // Water pond in top-right area
      const wx = x - 28, wy = y - 12;
      if (wx * wx / 9 + wy * wy / 6 < 1) tile = TileType.WATER;

      // Dirt paths connecting buildings
      // Horizontal path through middle
      if (y === 7 && x >= 2 && x <= 38) tile = TileType.PATH;
      if (y === 22 && x >= 2 && x <= 38) tile = TileType.PATH;
      // Vertical paths
      if (x === 8 && y >= 2 && y <= 28) tile = TileType.PATH;
      if (x === 31 && y >= 2 && y <= 28) tile = TileType.PATH;
      // Center crossroad
      if ((x >= 8 && x <= 31) && (y === 14 || y === 15)) tile = TileType.PATH;

      // Building floors
      for (const b of BUILDINGS) {
        if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
          tile = TileType.BUILDING_FLOOR;
        }
      }

      // Fences around buildings (1 tile border)
      for (const b of BUILDINGS) {
        const bx = x - b.x, by = y - b.y;
        if (bx >= -1 && bx <= b.w && by >= -1 && by <= b.h) {
          const onEdge = bx === -1 || bx === b.w || by === -1 || by === b.h;
          const onCorner = (bx === -1 && (by === -1 || by === b.h)) || (bx === b.w && (by === -1 || by === b.h));
          if (onEdge && !onCorner && tile !== TileType.BUILDING_FLOOR) {
            // Don't place fence on path intersections
            if (tile !== TileType.PATH) tile = TileType.FENCE;
          }
        }
      }

      // Dirt around water
      const wx2 = x - 28, wy2 = y - 12;
      if (tile === TileType.GRASS && wx2 * wx2 / 16 + wy2 * wy2 / 10 < 1 && wx2 * wx2 / 9 + wy2 * wy2 / 6 >= 1) {
        tile = TileType.DIRT;
      }

      row.push(tile);
    }
    map.push(row);
  }

  return map;
}

// ─── Pathfinding (BFS) ─────────────────────────────────────────────────────
export function findPath(
  map: TileType[][],
  startX: number, startY: number,
  endX: number, endY: number
): { x: number; y: number }[] {
  if (startX === endX && startY === endY) return [];

  const cols = map[0].length;
  const rows = map.length;

  // Clamp to walkable
  if (!TILE_WALKABLE[map[endY]?.[endX] ?? TileType.GRASS]) {
    // Find nearest walkable tile to end
    let best = null, bestDist = Infinity;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nx = endX + dx, ny = endY + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && TILE_WALKABLE[map[ny][nx]]) {
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; best = { x: nx, y: ny }; }
        }
      }
    }
    if (best) { endX = best.x; endY = best.y; }
    else return [];
  }

  const visited = new Set<string>();
  const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [];
  queue.push({ x: startX, y: startY, path: [] });
  visited.add(`${startX},${startY}`);

  const dirs = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const { dx, dy } of dirs) {
      const nx = curr.x + dx, ny = curr.y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (visited.has(key)) continue;
      if (!TILE_WALKABLE[map[ny][nx]]) continue;
      visited.add(key);

      const newPath = [...curr.path, { x: nx, y: ny }];
      if (nx === endX && ny === endY) return newPath;
      queue.push({ x: nx, y: ny, path: newPath });
    }
  }

  return []; // No path found
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

export function applyResourceDelta(res: Resources, delta: Partial<Resources>): Resources {
  return { ...res, ...delta };
}

// ─── Day/Night Cycle ───────────────────────────────────────────────────────
export function getDayNightOverlay(gameTick: number): { color: string; opacity: number; phase: string } {
  const cycle = 1200; // ticks per full day
  const t = (gameTick % cycle) / cycle; // 0-1

  if (t < 0.25) {
    // Dawn
    const f = t / 0.25;
    return { color: '#FF8C00', opacity: Math.max(0, 0.15 * (1 - f)), phase: 'Dawn' };
  } else if (t < 0.5) {
    // Day
    return { color: '#000000', opacity: 0, phase: 'Day' };
  } else if (t < 0.75) {
    // Dusk
    const f = (t - 0.5) / 0.25;
    return { color: '#1a1a4e', opacity: 0.12 * f, phase: 'Dusk' };
  } else {
    // Night
    const f = (t - 0.75) / 0.25;
    return { color: '#0a0a2e', opacity: 0.12 + 0.08 * Math.sin(f * Math.PI), phase: 'Night' };
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

export function screenToWorld(sx: number, sy: number, cam: Camera): { x: number; y: number } {
  return {
    x: (sx / cam.zoom) + cam.x,
    y: (sy / cam.zoom) + cam.y,
  };
}

export function worldToScreen(wx: number, wy: number, cam: Camera): { x: number; y: number } {
  return {
    x: (wx - cam.x) * cam.zoom,
    y: (wy - cam.y) * cam.zoom,
  };
}
