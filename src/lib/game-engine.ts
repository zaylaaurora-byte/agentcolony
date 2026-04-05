// ─── Game Engine v4 — Pixel-Agents Architecture ──────────────────────────────
// Inspired by https://github.com/pablodelucca/pixel-agents
// Features: BFS pathfinding, agent FSM, delta-time, z-sorting, sprite caching

// ─── Constants ─────────────────────────────────────────────────────────────────
export const TILE_SIZE = 16;
export const MAP_COLS = 40;
export const MAP_ROWS = 30;
export const WORLD_W = MAP_COLS * TILE_SIZE;
export const WORLD_H = MAP_ROWS * TILE_SIZE;

// Rendering zoom (how many device pixels per sprite pixel)
export const DEFAULT_ZOOM = 3;

// Agent movement speed (tiles per second)
export const AGENT_SPEED = 3;

// Animation timings (seconds)
export const WALK_FRAME_INTERVAL = 0.15;
export const TYPE_FRAME_INTERVAL = 0.3;
export const READ_FRAME_INTERVAL = 0.3;
export const SPAWN_EFFECT_DURATION = 0.4;

// Wander behavior
export const WANDER_MIN = 2;
export const WANDER_MAX = 15;
export const IDLE_MIN = 2;
export const IDLE_MAX = 8;
export const EMOTE_INTERVAL_MIN = 4;
export const EMOTE_INTERVAL_MAX = 12;

// ─── Tile Types ───────────────────────────────────────────────────────────────
export enum TileType {
  VOID = 255,
  WALL = 0,
  FLOOR = 1,
  GRASS = 2,
  GRASS_DARK = 3,
  GRASS_LIGHT = 4,
  DIRT = 5,
  WATER = 6,
  WATER_DEEP = 7,
  PATH = 8,
  PATH_STONE = 9,
  BUILDING_FLOOR = 10,
  FENCE = 11,
  FLOWER_RED = 12,
  FLOWER_YELLOW = 13,
  FLOWER_BLUE = 14,
  FLOWER_WHITE = 15,
}

export function isWalkable(tile: TileType): boolean {
  return tile !== TileType.VOID && tile !== TileType.WALL && 
         tile !== TileType.WATER && tile !== TileType.WATER_DEEP &&
         tile !== TileType.FENCE;
}

// ─── Direction ─────────────────────────────────────────────────────────────────
export type Direction = 'down' | 'up' | 'right' | 'left';

// ─── Agent State Machine ───────────────────────────────────────────────────────
export type AgentState = 'idle' | 'walk' | 'type' | 'read';

// ─── Agent Character ───────────────────────────────────────────────────────────
export type CharSkin = 'mastermind' | 'worker' | 'reviewer' | 'creative' | 'hacker' | 'analyst';
export type SpriteSet = 'pixel-agents' | 'sprout-lands';

export interface Agent {
  id: string;
  name: string;
  skin: CharSkin;
  spriteSet: SpriteSet;
  color: string;

  // Position (in tile coordinates, float for smooth movement)
  tileX: number;
  tileY: number;
  targetTileX: number;
  targetTileY: number;

  // Movement interpolation
  path: { x: number; y: number }[];
  pathIndex: number;
  moveProgress: number; // 0..1 between current path node and next

  // State
  state: AgentState;
  direction: Direction;
  animTimer: number;
  animFrame: number;

  // Activity
  isActive: boolean;
  speechBubble: string;
  speechTimer: number;
  emote: string;
  emoteTimer: number;

  // Spawn effect
  spawnTimer: number; // counts down from SPAWN_EFFECT_DURATION
  spawnEffect: 'in' | 'out' | 'none';

  // Wander behavior
  wanderTimer: number;
  idleTimer: number;
  emoteInterval: number;

  // Visual
  energy: number;
}

// ─── Bubble ───────────────────────────────────────────────────────────────────
export interface SpeechBubble {
  agentId: string;
  text: string;
  timer: number; // remaining seconds
  maxTimer: number;
  type: 'speech' | 'done' | 'permission';
}

// ─── Building ─────────────────────────────────────────────────────────────────
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
  { id: 'planning-desk', name: 'Planning', emoji: '📋', x: 2, y: 2, w: 5, h: 4, color: '#8B5CF6' },
  { id: 'workbench', name: 'Workshop', emoji: '🔧', x: 33, y: 2, w: 5, h: 4, color: '#F97316' },
  { id: 'review-desk', name: 'QA Lab', emoji: '🔍', x: 2, y: 24, w: 5, h: 4, color: '#10B981' },
  { id: 'creative-studio', name: 'Studio', emoji: '🎨', x: 33, y: 24, w: 5, h: 4, color: '#EC4899' },
  { id: 'town-hall', name: 'Town Hall', emoji: '🏛️', x: 17, y: 13, w: 6, h: 4, color: '#F59E0B' },
];

export const STATION_POSITIONS: Record<string, { x: number; y: number }> = {
  'planning-desk': { x: 4, y: 6 },
  'workbench': { x: 35, y: 6 },
  'review-desk': { x: 4, y: 28 },
  'creative-studio': { x: 35, y: 28 },
  'town-hall': { x: 20, y: 17 },
  idle: { x: 20, y: 15 },
  center: { x: 20, y: 15 },
};

// ─── Decoration ───────────────────────────────────────────────────────────────
export interface Decoration {
  x: number;
  y: number;
  type: 'rock' | 'bush' | 'grass_tuft' | 'stump';
  variant: number;
}

// ─── Game State ───────────────────────────────────────────────────────────────
export class GameState {
  tiles: TileType[][] = [];
  decorations: Decoration[] = [];
  agents: Map<string, Agent> = new Map();
  bubbles: SpeechBubble[] = [];
  walkableTiles: { x: number; y: number }[] = [];

  // Camera
  cameraX = 0;
  cameraY = 0;
  cameraZoom = DEFAULT_ZOOM;
  targetCameraX = 0;
  targetCameraY = 0;

  // Time
  gameTime = 0; // seconds since start

  constructor() {
    this.generateMap();
    this.computeWalkable();
  }

  // ─── Map Generation ────────────────────────────────────────────────────────
  private generateMap(): void {
    const rng = this.createRNG(42);

    for (let y = 0; y < MAP_ROWS; y++) {
      const row: TileType[] = [];
      for (let x = 0; x < MAP_COLS; x++) {
        let tile = TileType.GRASS;

        // Grass variation
        const hash = ((x * 7 + y * 13 + x * y) % 10);
        if (hash < 2) tile = TileType.GRASS_DARK;
        else if (hash < 4) tile = TileType.GRASS_LIGHT;

        // Borders (walls)
        if (x === 0 || y === 0 || x === MAP_COLS - 1 || y === MAP_ROWS - 1) {
          tile = TileType.WALL;
        }

        // Water pond (top-right)
        const wx = x - 32, wy = y - 6;
        const waterDist = wx * wx / 10 + wy * wy / 6;
        if (waterDist < 1) {
          tile = waterDist < 0.35 ? TileType.WATER_DEEP : TileType.WATER;
        }

        // Dirt border around water
        const dirtDist = wx * wx / 14 + wy * wy / 9;
        if (dirtDist < 1 && waterDist >= 1) {
          tile = TileType.DIRT;
        }

        // Main paths
        if (y === 6 && x >= 2 && x <= 38) tile = TileType.PATH;
        if (y === 23 && x >= 2 && x <= 38) tile = TileType.PATH;
        if (x === 8 && y >= 2 && y <= 28) tile = TileType.PATH;
        if (x === 31 && y >= 2 && y <= 28) tile = TileType.PATH;
        if ((x >= 8 && x <= 31) && (y === 14 || y === 15)) tile = TileType.PATH;
        if (x >= 17 && x <= 22 && (y === 11 || y === 17)) tile = TileType.PATH;

        // Path stones
        const pathHash = ((x * 3 + y * 7) % 8);
        if (tile === TileType.PATH && pathHash < 2) tile = TileType.PATH_STONE;

        // Building floors
        for (const b of BUILDINGS) {
          if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
            tile = TileType.BUILDING_FLOOR;
          }
        }

        // Fences around buildings
        if (tile !== TileType.BUILDING_FLOOR && tile !== TileType.PATH && tile !== TileType.PATH_STONE) {
          for (const b of BUILDINGS) {
            const bx = x - b.x, by = y - b.y;
            if (bx >= -1 && bx <= b.w && by >= -1 && by <= b.h) {
              const onEdge = (bx === -1 || bx === b.w) && (by >= -1 && by <= b.h) ||
                             (by === -1 || by === b.h) && (bx >= -1 && bx <= b.w);
              const onCorner = (bx === -1 || bx === b.w) && (by === -1 || by === b.h);
              if (onEdge && !onCorner) tile = TileType.FENCE;
              if (onCorner && tile !== TileType.WALL) tile = TileType.WALL;
            }
          }
        }

        // Flowers
        const fr = rng();
        if ((tile === TileType.GRASS || tile === TileType.GRASS_DARK || tile === TileType.GRASS_LIGHT) && fr < 0.008) {
          const flowerTypes = [TileType.FLOWER_RED, TileType.FLOWER_YELLOW, TileType.FLOWER_BLUE, TileType.FLOWER_WHITE];
          tile = flowerTypes[Math.floor(fr * 500) % 4];
        }

        row.push(tile);
      }
      this.tiles.push(row);
    }

    // Decorations
    for (let y = 2; y < MAP_ROWS - 2; y++) {
      for (let x = 2; x < MAP_COLS - 2; x++) {
        const t = this.tiles[y][x];
        if (t !== TileType.GRASS && t !== TileType.GRASS_DARK && t !== TileType.GRASS_LIGHT) continue;

        let skip = false;
        for (const b of BUILDINGS) {
          if (x >= b.x - 2 && x <= b.x + b.w + 1 && y >= b.y - 2 && y <= b.y + b.h + 1) skip = true;
        }
        if (x >= 7 && x <= 9) skip = true;
        if (x >= 30 && x <= 32) skip = true;
        if (y >= 5 && y <= 7) skip = true;
        if (y >= 13 && y <= 17) skip = true;
        if (y >= 22 && y <= 24) skip = true;
        if (skip) continue;

        const r = rng();
        if (r < 0.015) this.decorations.push({ x, y, type: 'rock', variant: Math.floor(rng() * 4) });
        else if (r < 0.035) this.decorations.push({ x, y, type: 'bush', variant: Math.floor(rng() * 4) });
        else if (r < 0.05) this.decorations.push({ x, y, type: 'grass_tuft', variant: Math.floor(rng() * 4) });
        else if (r < 0.055) this.decorations.push({ x, y, type: 'stump', variant: Math.floor(rng() * 4) });
      }
    }
  }

  private computeWalkable(): void {
    this.walkableTiles = [];
    for (let y = 1; y < MAP_ROWS - 1; y++) {
      for (let x = 1; x < MAP_COLS - 1; x++) {
        if (isWalkable(this.tiles[y][x])) {
          this.walkableTiles.push({ x, y });
        }
      }
    }
  }

  private createRNG(seed: number) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // ─── BFS Pathfinding (4-connected, like pixel-agents) ──────────────────────
  findPath(startX: number, startY: number, endX: number, endY: number): { x: number; y: number }[] {
    const sx = Math.round(startX);
    const sy = Math.round(startY);
    const ex = Math.round(endX);
    const ey = Math.round(endY);

    if (sx === ex && sy === ey) return [];
    if (!this.inBounds(ex, ey) || !isWalkable(this.tiles[ey][ex])) return [];

    const visited = new Set<string>();
    const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [];
    const startKey = `${sx},${sy}`;
    visited.add(startKey);
    queue.push({ x: sx, y: sy, path: [] });

    const dirs = [
      { dx: 0, dy: -1 }, // up
      { dx: 0, dy: 1 },  // down
      { dx: -1, dy: 0 }, // left
      { dx: 1, dy: 0 },  // right
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.x === ex && current.y === ey) {
        return [...current.path, { x: ex, y: ey }];
      }

      for (const d of dirs) {
        const nx = current.x + d.dx;
        const ny = current.y + d.dy;
        const key = `${nx},${ny}`;

        if (!visited.has(key) && this.inBounds(nx, ny) && isWalkable(this.tiles[ny][nx])) {
          visited.add(key);
          queue.push({ x: nx, y: ny, path: [...current.path, { x: nx, y: ny }] });
        }
      }
    }

    return []; // no path found
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < MAP_COLS && y >= 0 && y < MAP_ROWS;
  }

  // ─── Agent Management ──────────────────────────────────────────────────────
  addAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  removeAgent(id: string): void {
    this.agents.delete(id);
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  moveAgentTo(id: string, tx: number, ty: number): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    tx = Math.max(1, Math.min(MAP_COLS - 2, Math.round(tx)));
    ty = Math.max(1, Math.min(MAP_ROWS - 2, Math.round(ty)));

    const path = this.findPath(agent.tileX, agent.tileY, tx, ty);
    if (path.length > 0) {
      agent.path = path;
      agent.pathIndex = 0;
      agent.moveProgress = 0;
      agent.targetTileX = tx;
      agent.targetTileY = ty;
      agent.state = 'walk';
    }
  }

  setAgentActive(id: string, active: boolean, activityType: 'type' | 'read' = 'type'): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    agent.isActive = active;
    if (active) {
      agent.state = activityType;
      agent.animTimer = 0;
      agent.animFrame = 0;
    } else if (agent.state === 'type' || agent.state === 'read') {
      agent.state = 'idle';
      agent.idleTimer = 0;
      agent.wanderTimer = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
    }
  }

  showSpeech(id: string, text: string, duration: number = 4): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    agent.speechBubble = text.slice(0, 200);
    agent.speechTimer = duration;
  }

  // ─── Direction helper ──────────────────────────────────────────────────────
  private directionBetween(fromX: number, fromY: number, toX: number, toY: number): Direction {
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    }
    return dy > 0 ? 'down' : 'up';
  }

  // ─── Update (called every frame with delta time) ───────────────────────────
  update(dt: number): void {
    this.gameTime += dt;

    for (const agent of this.agents.values()) {
      this.updateAgent(agent, dt);
    }

    // Update speech bubble timers
    this.bubbles = this.bubbles.filter(b => {
      b.timer -= dt;
      return b.timer > 0;
    });
  }

  private updateAgent(agent: Agent, dt: number): void {
    // ── Spawn effect ──
    if (agent.spawnEffect !== 'none') {
      agent.spawnTimer -= dt;
      if (agent.spawnTimer <= 0) {
        agent.spawnEffect = 'none';
      }
      return; // Don't update agent while spawning
    }

    // ── Speech timer ──
    if (agent.speechTimer > 0) {
      agent.speechTimer -= dt;
      if (agent.speechTimer <= 0) {
        agent.speechBubble = '';
      }
    }

    // ── Emote timer ──
    if (agent.emoteTimer > 0) {
      agent.emoteTimer -= dt;
      if (agent.emoteTimer <= 0) {
        agent.emote = '';
      }
    }

    // ── State-specific updates ──
    switch (agent.state) {
      case 'walk':
        this.updateWalk(agent, dt);
        break;
      case 'type':
        this.updateType(agent, dt);
        break;
      case 'read':
        this.updateRead(agent, dt);
        break;
      case 'idle':
        this.updateIdle(agent, dt);
        break;
    }
  }

  private updateWalk(agent: Agent, dt: number): void {
    if (agent.path.length === 0 || agent.pathIndex >= agent.path.length) {
      // Arrived
      agent.tileX = Math.round(agent.tileX);
      agent.tileY = Math.round(agent.tileY);
      agent.path = [];
      agent.pathIndex = 0;
      agent.moveProgress = 0;

      if (agent.isActive) {
        agent.state = 'type';
        agent.animTimer = 0;
      } else {
        agent.state = 'idle';
        agent.idleTimer = 0;
        agent.wanderTimer = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
      }
      return;
    }

    // Advance movement
    agent.moveProgress += AGENT_SPEED * dt;

    while (agent.moveProgress >= 1 && agent.pathIndex < agent.path.length - 1) {
      agent.moveProgress -= 1;
      agent.pathIndex++;
    }

    if (agent.pathIndex < agent.path.length) {
      const prev = agent.pathIndex > 0 ? agent.path[agent.pathIndex - 1] : { x: agent.tileX, y: agent.tileY };
      const next = agent.path[agent.pathIndex];
      const t = Math.min(agent.moveProgress, 1);

      agent.tileX = prev.x + (next.x - prev.x) * t;
      agent.tileY = prev.y + (next.y - prev.y) * t;
      agent.direction = this.directionBetween(prev.x, prev.y, next.x, next.y);

      // Walk animation
      agent.animTimer += dt;
      if (agent.animTimer >= WALK_FRAME_INTERVAL) {
        agent.animTimer -= WALK_FRAME_INTERVAL;
        agent.animFrame = (agent.animFrame + 1) % 4;
      }
    }

    // Check if arrived
    if (agent.pathIndex >= agent.path.length - 1 && agent.moveProgress >= 1) {
      const dest = agent.path[agent.path.length - 1];
      agent.tileX = dest.x;
      agent.tileY = dest.y;
      agent.path = [];
      agent.pathIndex = 0;
      agent.moveProgress = 0;

      if (agent.isActive) {
        agent.state = 'type';
        agent.animTimer = 0;
      } else {
        agent.state = 'idle';
        agent.idleTimer = 0;
        agent.wanderTimer = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
      }
    }
  }

  private updateType(agent: Agent, dt: number): void {
    agent.animTimer += dt;
    if (agent.animTimer >= TYPE_FRAME_INTERVAL) {
      agent.animTimer -= TYPE_FRAME_INTERVAL;
      agent.animFrame = agent.animFrame === 0 ? 1 : 0;
    }

    // If no longer active, go idle after a short grace
    if (!agent.isActive) {
      agent.idleTimer += dt;
      if (agent.idleTimer > 0.5) {
        agent.state = 'idle';
        agent.idleTimer = 0;
        agent.wanderTimer = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
      }
    }
  }

  private updateRead(agent: Agent, dt: number): void {
    agent.animTimer += dt;
    if (agent.animTimer >= READ_FRAME_INTERVAL) {
      agent.animTimer -= READ_FRAME_INTERVAL;
      agent.animFrame = agent.animFrame === 0 ? 1 : 0;
    }

    if (!agent.isActive) {
      agent.idleTimer += dt;
      if (agent.idleTimer > 0.5) {
        agent.state = 'idle';
        agent.idleTimer = 0;
        agent.wanderTimer = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
      }
    }
  }

  private updateIdle(agent: Agent, dt: number): void {
    agent.idleTimer += dt;

    // Random emote
    agent.emoteInterval -= dt;
    if (agent.emoteInterval <= 0) {
      const emotes = ['💭', '💤', '🎵', '👀', '✨', '🤔', '😄', '😎', '🧐', '😊'];
      agent.emote = emotes[Math.floor(Math.random() * emotes.length)];
      agent.emoteTimer = 2 + Math.random() * 3;
      agent.emoteInterval = EMOTE_INTERVAL_MIN + Math.random() * (EMOTE_INTERVAL_MAX - EMOTE_INTERVAL_MIN);
    }

    // If became active while idle, go to target first
    if (agent.isActive) {
      agent.state = 'walk';
      return;
    }

    // Wander
    agent.wanderTimer -= dt;
    if (agent.wanderTimer <= 0) {
      // Pick random walkable tile
      if (this.walkableTiles.length > 0) {
        const range = 6;
        let bestTile = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
        // Prefer nearby tiles
        const nearby = this.walkableTiles.filter(t =>
          Math.abs(t.x - agent.tileX) < range && Math.abs(t.y - agent.tileY) < range
        );
        if (nearby.length > 0) {
          bestTile = nearby[Math.floor(Math.random() * nearby.length)];
        }

        const path = this.findPath(
          Math.round(agent.tileX), Math.round(agent.tileY),
          bestTile.x, bestTile.y
        );
        if (path.length > 0) {
          agent.path = path;
          agent.pathIndex = 0;
          agent.moveProgress = 0;
          agent.targetTileX = bestTile.x;
          agent.targetTileY = bestTile.y;
          agent.state = 'walk';
          agent.animTimer = 0;
          agent.animFrame = 0;
        }
      }
      agent.wanderTimer = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
    }
  }

  // ─── Random walkable position near center ──────────────────────────────────
  getRandomSpawnPos(): { x: number; y: number } {
    const centerX = MAP_COLS / 2;
    const centerY = MAP_ROWS / 2;
    const nearby = this.walkableTiles.filter(t =>
      Math.abs(t.x - centerX) < 12 && Math.abs(t.y - centerY) < 8
    );
    if (nearby.length > 0) {
      return nearby[Math.floor(Math.random() * nearby.length)];
    }
    return { x: Math.round(centerX), y: Math.round(centerY) };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────
export function createAgent(
  id: string,
  name: string,
  skin: CharSkin,
  color: string,
  x: number,
  y: number,
  spriteSet: SpriteSet = 'pixel-agents',
): Agent {
  return {
    id,
    name,
    skin,
    spriteSet,
    color,
    tileX: x,
    tileY: y,
    targetTileX: x,
    targetTileY: y,
    path: [],
    pathIndex: 0,
    moveProgress: 0,
    state: 'idle',
    direction: 'down',
    animTimer: 0,
    animFrame: 0,
    isActive: false,
    speechBubble: '',
    speechTimer: 0,
    emote: '👋',
    emoteTimer: 3,
    spawnTimer: SPAWN_EFFECT_DURATION,
    spawnEffect: 'in',
    wanderTimer: IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN),
    idleTimer: 0,
    emoteInterval: EMOTE_INTERVAL_MIN + Math.random() * (EMOTE_INTERVAL_MAX - EMOTE_INTERVAL_MIN),
    energy: 100,
  };
}
