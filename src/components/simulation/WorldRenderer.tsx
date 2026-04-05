'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  generateMap, TILE_SIZE, MAP_COLS, MAP_ROWS, WORLD_W, WORLD_H,
  TileType, BUILDINGS, STATION_POSITIONS,
  findPath, getDayNightOverlay, clampCamera, screenToWorld,
  type Camera, type Resources, type Building,
} from '@/lib/game-world';
import { AGENT_CONFIG, type AgentId } from '@/lib/agent-config';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AgentEntity {
  agentId: string;
  tileX: number;
  tileY: number;
  pixelX: number; // smooth position
  pixelY: number;
  targetTileX: number;
  targetTileY: number;
  path: { x: number; y: number }[];
  direction: 'down' | 'up' | 'left' | 'right';
  animState: 'idle' | 'walk' | 'work' | 'talk' | 'summon';
  animFrame: number;
  animTimer: number;
  isMoving: boolean;
  speechBubble: string;
  speechTimer: number;
  spawnEffect: number; // 0 = no effect, >0 = spawning animation
  color: string;
  name: string;
  energy: number;
}

export interface WorldRendererProps {
  agents: Record<string, AgentEntity>;
  resources: Resources;
  sessionStatus: string;
  gameTick: number;
  onTileClick?: (tileX: number, tileY: number) => void;
}

// ─── Tile sprite cache ─────────────────────────────────────────────────────

interface SpriteCache {
  tiles: Record<string, HTMLImageElement>;
  buildings: Record<string, HTMLImageElement>;
  characters: Record<string, HTMLImageElement>;
  loaded: boolean;
}

function loadAllSprites(): Promise<SpriteCache> {
  return new Promise((resolve) => {
    const cache: SpriteCache = { tiles: {}, buildings: {}, characters: {}, loaded: false };
    let pending = 0;
    const markLoaded = () => { pending--; if (pending <= 0) { cache.loaded = true; resolve(cache); } };

    // Load grass tiles
    const grassVariants = [
      { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 },
      { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
      { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 },
    ];
    for (let i = 0; i < grassVariants.length; i++) {
      const v = grassVariants[i];
      pending++;
      const img = new Image();
      img.onload = markLoaded;
      img.onerror = markLoaded;
      img.src = `/sprites/tiles/grass/grass_${v.y}_${v.x}.png`;
      cache.tiles[`grass_${i}`] = img;
    }

    // Load other tiles
    const tileFiles: Record<string, string[]> = {
      'dirt': [`tiles/tilled_dirt/tilled_dirt_1_1.png`, `tiles/tilled_dirt/tilled_dirt_2_2.png`],
      'water': [`tiles/water/water_0_0.png`, `tiles/water/water_0_1.png`, `tiles/water/water_0_2.png`, `tiles/water/water_0_3.png`],
      'fence': [`tiles/fences/fences_0_0.png`, `tiles/fences/fences_0_2.png`, `tiles/fences/fences_1_0.png`, `tiles/fences/fences_1_2.png`, `tiles/fences/fences_2_0.png`, `tiles/fences/fences_2_2.png`, `tiles/fences/fences_3_1.png`],
      'path': [`objects/paths/paths_0_0.png`, `objects/paths/paths_0_2.png`, `objects/paths/paths_1_1.png`, `objects/paths/paths_2_0.png`, `objects/paths/paths_2_2.png`, `objects/paths/paths_3_1.png`],
      'building_floor': [`tiles/tilled_dirt/tilled_dirt_3_3.png`, `tiles/tilled_dirt/tilled_dirt_4_4.png`],
    };

    for (const [type, files] of Object.entries(tileFiles)) {
      for (let i = 0; i < files.length; i++) {
        pending++;
        const img = new Image();
        img.onload = markLoaded;
        img.onerror = markLoaded;
        img.src = `/sprites/${files[i]}`;
        cache.tiles[`${type}_${i}`] = img;
      }
    }

    // Load character spritesheets (2x scaled)
    const agentIds = ['mastermind', 'worker', 'reviewer', 'creative'] as const;
    for (const id of agentIds) {
      pending++;
      const img = new Image();
      img.onload = markLoaded;
      img.onerror = markLoaded;
      img.src = `/sprites/characters/${id}/2x/sheet.png`;
      cache.characters[id] = img;
    }

    // Load building/object sprites
    const objFiles: Record<string, string> = {
      'table': 'objects/basic_furniture/basic_furniture_2_2.png',
      'desk': 'objects/basic_furniture/basic_furniture_2_5.png',
      'chair': 'objects/basic_furniture/basic_furniture_4_3.png',
      'plant1': 'objects/basic_plants/basic_plants_0_0.png',
      'plant2': 'objects/basic_plants/basic_plants_0_2.png',
      'plant3': 'objects/basic_plants/basic_plants_1_1.png',
      'chest': 'objects/chest/chest_2_2.png',
      'rock1': 'objects/grass_things/grass_things_0_0.png',
      'rock2': 'objects/grass_things/grass_things_1_1.png',
      'flower1': 'objects/grass_things/grass_things_3_0.png',
      'flower2': 'objects/grass_things/grass_things_3_2.png',
      'bush': 'objects/grass_things/grass_things_4_3.png',
      'sign': 'objects/basic_tools/basic_tools_1_1.png',
    };

    for (const [name, file] of Object.entries(objFiles)) {
      pending++;
      const img = new Image();
      img.onload = markLoaded;
      img.onerror = markLoaded;
      img.src = `/sprites/${file}`;
      cache.buildings[name] = img;
    }

    // Fallback: if no images pending, resolve
    if (pending === 0) { cache.loaded = true; resolve(cache); }
  });
}

// ─── Seeded random for consistent decorations ───────────────────────────────
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorldRenderer({ agents, resources, sessionStatus, gameTick, onTileClick }: WorldRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<TileType[][] | null>(null);
  const spritesRef = useRef<SpriteCache | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1.5 });
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({ dragging: false, lastX: 0, lastY: 0 });
  const decorRef = useRef<{ x: number; y: number; type: string; seed: number }[]>([]);
  const animFrameRef = useRef<number>(0);
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);

  // Generate map & decorations once
  useEffect(() => {
    const map = generateMap();
    mapRef.current = map;

    // Generate decoration objects (rocks, flowers, plants)
    const rng = seededRandom(42);
    const decos: typeof decorRef.current = [];
    for (let y = 0; y < MAP_ROWS; y++) {
      for (let x = 0; x < MAP_COLS; x++) {
        if (map[y][x] !== TileType.GRASS && map[y][x] !== TileType.DIRT) continue;
        // Don't place on paths or buildings
        let skip = false;
        for (const b of BUILDINGS) {
          if (x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h) skip = true;
        }
        if (x >= 7 && x <= 9 && y >= 6 && y <= 8) skip = true;
        if (x >= 30 && x <= 32 && y >= 6 && y <= 8) skip = true;
        if (x >= 7 && x <= 9 && y >= 21 && y <= 23) skip = true;
        if (x >= 30 && x <= 32 && y >= 21 && y <= 23) skip = true;
        if (skip) continue;

        const r = rng();
        if (r < 0.015) decos.push({ x, y, type: 'rock1', seed: rng() });
        else if (r < 0.025) decos.push({ x, y, type: 'rock2', seed: rng() });
        else if (r < 0.045) decos.push({ x, y, type: 'flower1', seed: rng() });
        else if (r < 0.065) decos.push({ x, y, type: 'flower2', seed: rng() });
        else if (r < 0.08) decos.push({ x, y, type: 'plant1', seed: rng() });
        else if (r < 0.09) decos.push({ x, y, type: 'plant2', seed: rng() });
        else if (r < 0.095) decos.push({ x, y, type: 'bush', seed: rng() });
      }
    }
    decorRef.current = decos;
  }, []);

  // Load sprites
  useEffect(() => {
    loadAllSprites().then(cache => { spritesRef.current = cache; });
  }, []);

  // Center camera on world center
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cam = cameraRef.current;
    cam.x = (WORLD_W - canvas.width / cam.zoom) / 2;
    cam.y = (WORLD_H - canvas.height / cam.zoom) / 2;
    const clamped = clampCamera(cam, canvas.width, canvas.height);
    cameraRef.current = clamped;
  }, []);

  // Mouse handlers for pan & zoom
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      cameraRef.current.x -= dx / cameraRef.current.zoom;
      cameraRef.current.y -= dy / cameraRef.current.zoom;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      const clamped = clampCamera(cameraRef.current, canvas.width, canvas.height);
      cameraRef.current = clamped;
    }

    // Hover tile
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, cameraRef.current);
    const tx = Math.floor(world.x / TILE_SIZE);
    const ty = Math.floor(world.y / TILE_SIZE);
    if (tx >= 0 && tx < MAP_COLS && ty >= 0 && ty < MAP_ROWS) {
      setHoveredTile({ x: tx, y: ty });
    } else {
      setHoveredTile(null);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;

    // Zoom toward mouse position
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cam = cameraRef.current;
    const worldBefore = screenToWorld(mx, my, cam);

    cam.zoom *= zoomFactor;
    const clamped = clampCamera(cam, canvas.width, canvas.height);
    cameraRef.current = clamped;

    const worldAfter = screenToWorld(mx, my, clamped);
    clamped.x += worldBefore.x - worldAfter.x;
    clamped.y += worldBefore.y - worldAfter.y;
    const reclamped = clampCamera(clamped, canvas.width, canvas.height);
    cameraRef.current = reclamped;
  }, []);

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ─── Render Loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;
      animFrameRef.current = requestAnimationFrame(render);

      const map = mapRef.current;
      const sprites = spritesRef.current;
      const cam = cameraRef.current;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      const viewW = w / window.devicePixelRatio;
      const viewH = h / window.devicePixelRatio;

      const clamped = clampCamera(cam, viewW, viewH);
      cameraRef.current = clamped;

      // Calculate visible tile range
      const startCol = Math.max(0, Math.floor(clamped.x / TILE_SIZE));
      const startRow = Math.max(0, Math.floor(clamped.y / TILE_SIZE));
      const endCol = Math.min(MAP_COLS, Math.ceil((clamped.x + viewW / clamped.zoom) / TILE_SIZE) + 1);
      const endRow = Math.min(MAP_ROWS, Math.ceil((clamped.y + viewH / clamped.zoom) / TILE_SIZE) + 1);

      ctx.save();
      ctx.translate(0, 0);
      ctx.scale(clamped.zoom, clamped.zoom);
      ctx.translate(-clamped.x, -clamped.y);

      if (map) {
        // ── Draw Tiles ──
        for (let row = startRow; row < endRow; row++) {
          for (let col = startCol; col < endCol; col++) {
            const tile = map[row]?.[col] ?? TileType.GRASS;
            const px = col * TILE_SIZE;
            const py = row * TILE_SIZE;

            let sprite: HTMLImageElement | null = null;

            if (tile === TileType.GRASS) {
              const variant = ((col * 7 + row * 13) % 11);
              sprite = sprites?.tiles[`grass_${variant}`] ?? null;
            } else if (tile === TileType.DIRT) {
              const variant = ((col + row) % 2);
              sprite = sprites?.tiles[`dirt_${variant}`] ?? null;
            } else if (tile === TileType.WATER) {
              const variant = (Math.floor(gameTick / 30) + col + row) % 4;
              sprite = sprites?.tiles[`water_${variant}`] ?? null;
            } else if (tile === TileType.FENCE) {
              // Choose fence variant based on neighbors
              const above = map[row - 1]?.[col];
              const below = map[row + 1]?.[col];
              const left = map[row]?.[col - 1];
              const right = map[row]?.[col + 1];
              const isHoriz = (left === TileType.FENCE || right === TileType.FENCE) && above !== TileType.FENCE && below !== TileType.FENCE;
              sprite = sprites?.tiles[isHoriz ? `fence_5` : `fence_6`] ?? null;
              if (!sprite || !sprite.complete) sprite = sprites?.tiles[`fence_3`] ?? null;
            } else if (tile === TileType.PATH) {
              const variant = ((col * 3 + row * 5) % 6);
              sprite = sprites?.tiles[`path_${variant}`] ?? null;
            } else if (tile === TileType.BUILDING_FLOOR) {
              const variant = ((col + row) % 2);
              sprite = sprites?.tiles[`building_floor_${variant}`] ?? null;
            }

            if (sprite && sprite.complete && sprite.naturalWidth > 0) {
              ctx.drawImage(sprite, px, py, TILE_SIZE, TILE_SIZE);
            } else {
              // Fallback: colored rectangle
              const colors: Record<number, string> = {
                [TileType.GRASS]: '#4a7c3f',
                [TileType.DIRT]: '#8B7355',
                [TileType.WATER]: '#3a7bd5',
                [TileType.FENCE]: '#6B4423',
                [TileType.BUILDING_FLOOR]: '#9e8e7e',
                [TileType.PATH]: '#a89070',
              };
              ctx.fillStyle = colors[tile] ?? '#4a7c3f';
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
          }
        }

        // ── Draw Decorations ──
        for (const deco of decorRef.current) {
          const px = deco.x * TILE_SIZE;
          const py = deco.y * TILE_SIZE;
          if (px < clamped.x - TILE_SIZE || px > clamped.x + viewW / clamped.zoom + TILE_SIZE) continue;
          if (py < clamped.y - TILE_SIZE || py > clamped.y + viewH / clamped.zoom + TILE_SIZE) continue;

          const sprite = sprites?.buildings[deco.type];
          if (sprite && sprite.complete && sprite.naturalWidth > 0) {
            // Subtle animation for flowers/plants
            const sway = (deco.type.startsWith('flower') || deco.type.startsWith('plant'))
              ? Math.sin(gameTick * 0.02 + deco.seed * 100) * 1 : 0;
            ctx.drawImage(sprite, px + sway, py, TILE_SIZE, TILE_SIZE);
          }
        }

        // ── Draw Buildings ──
        for (const b of BUILDINGS) {
          const bx = b.x * TILE_SIZE;
          const by = b.y * TILE_SIZE;
          const bw = b.w * TILE_SIZE;
          const bh = b.h * TILE_SIZE;

          // Building interior glow
          ctx.fillStyle = b.color + '15';
          ctx.fillRect(bx, by, bw, bh);

          // Building name background
          ctx.fillStyle = b.color + '30';
          ctx.fillRect(bx, by + bh - 14, bw, 14);

          // Building name
          ctx.fillStyle = b.color;
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(b.name.toUpperCase(), bx + bw / 2, by + bh - 4);

          // Icon
          ctx.font = '16px sans-serif';
          ctx.fillText(b.emoji, bx + bw / 2 - 8, by + 20);

          // Border highlight
          ctx.strokeStyle = b.color + '40';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

          // Draw desk/table inside
          const deskSprite = sprites?.buildings['desk'];
          if (deskSprite && deskSprite.complete) {
            ctx.drawImage(deskSprite, bx + bw / 2 - 8, by + bh / 2 - 8, 16, 16);
          }
        }

        // ── Draw Characters ──
        // Sort by Y for proper depth
        const sortedAgents = Object.values(agents).sort((a, b) => a.pixelY - b.pixelY);

        for (const agent of sortedAgents) {
          const ax = agent.pixelX;
          const ay = agent.pixelY;

          if (ax < clamped.x - 100 || ax > clamped.x + viewW / clamped.zoom + 100) continue;
          if (ay < clamped.y - 100 || ay > clamped.y + viewH / clamped.zoom + 100) continue;

          // Spawn effect
          if (agent.spawnEffect > 0) {
            const progress = 1 - agent.spawnEffect;
            const radius = progress * 40;
            ctx.beginPath();
            ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, radius, 0, Math.PI * 2);
            ctx.strokeStyle = agent.color + Math.floor(agent.spawnEffect * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = 2;
            ctx.stroke();

            // Inner glow
            ctx.beginPath();
            ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, radius * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = agent.color + Math.floor(agent.spawnEffect * 100).toString(16).padStart(2, '0');
            ctx.fill();
          }

          // Shadow under character
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.beginPath();
          ctx.ellipse(ax + TILE_SIZE / 2, ay + TILE_SIZE - 2, 10, 4, 0, 0, Math.PI * 2);
          ctx.fill();

          // Active glow
          if (agent.animState === 'work' || agent.animState === 'talk') {
            const glowRadius = 20 + Math.sin(gameTick * 0.05) * 5;
            const gradient = ctx.createRadialGradient(
              ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, 5,
              ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, glowRadius
            );
            gradient.addColorStop(0, agent.color + '30');
            gradient.addColorStop(1, agent.color + '00');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, glowRadius, 0, Math.PI * 2);
            ctx.fill();
          }

          // Draw character sprite
          const sprite = sprites?.characters[agent.agentId];
          if (sprite && sprite.complete && sprite.naturalWidth > 0) {
            const sheetSize = sprite.naturalWidth; // 384
            const tileSize = sheetSize / 4; // 96

            // Row based on direction: down=0, up=1, left=2, right=3
            const dirRow: Record<string, number> = { down: 0, up: 1, left: 2, right: 3 };
            // Col based on animation frame: idle=0, walk1=1, walk2=2, walk3=3
            let frameCol = 0;
            if (agent.animState === 'walk' || agent.isMoving) {
              frameCol = agent.animFrame % 3 + 1;
            } else if (agent.animState === 'work') {
              frameCol = Math.floor(gameTick / 20) % 3 + 1;
            }

            const row = dirRow[agent.direction] ?? 0;
            const sx = frameCol * tileSize;
            const sy = row * tileSize;

            // Draw at 2x of tile size (characters are bigger than tiles)
            const charSize = TILE_SIZE * 1.2;
            const charX = ax + (TILE_SIZE - charSize) / 2;
            const charY = ay - 8;

            ctx.drawImage(sprite, sx, sy, tileSize, tileSize, charX, charY, charSize, charSize);
          } else {
            // Fallback: colored circle
            ctx.fillStyle = agent.color;
            ctx.beginPath();
            ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2 - 5, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#F5D6C6';
            ctx.beginPath();
            ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2 - 18, 7, 0, Math.PI * 2);
            ctx.fill();
          }

          // Name tag
          ctx.fillStyle = agent.color + 'CC';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          const nameY = ay - 10;
          const nameWidth = ctx.measureText(agent.name).width + 6;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(ax + TILE_SIZE / 2 - nameWidth / 2, nameY - 7, nameWidth, 10);
          ctx.fillStyle = agent.color;
          ctx.fillText(agent.name, ax + TILE_SIZE / 2, nameY);

          // Active dot
          if (agent.animState === 'work' || agent.animState === 'talk') {
            const dotScale = 1 + Math.sin(gameTick * 0.1) * 0.3;
            ctx.fillStyle = agent.color;
            ctx.beginPath();
            ctx.arc(ax + TILE_SIZE - 2, ay - 2, 3 * dotScale, 0, Math.PI * 2);
            ctx.fill();
          }

          // Speech bubble
          if (agent.speechBubble) {
            const bubbleMaxW = 140;
            const bubbleText = agent.speechBubble.length > 80
              ? agent.speechBubble.slice(0, 77) + '...'
              : agent.speechBubble;

            ctx.font = '7px monospace';
            const metrics = ctx.measureText(bubbleText);
            const textW = Math.min(metrics.width, bubbleMaxW - 12);
            const lines = Math.ceil(metrics.width / (bubbleMaxW - 12));
            const bubbleW = textW + 12;
            const bubbleH = lines * 10 + 10;
            const bubbleX = ax + TILE_SIZE / 2 - bubbleW / 2;
            const bubbleY = ay - 28 - bubbleH;

            // Bubble background
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.beginPath();
            ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 4);
            ctx.fill();

            // Bubble border
            ctx.strokeStyle = agent.color + '60';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 4);
            ctx.stroke();

            // Tail
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.beginPath();
            ctx.moveTo(ax + TILE_SIZE / 2 - 4, bubbleY + bubbleH);
            ctx.lineTo(ax + TILE_SIZE / 2, bubbleY + bubbleH + 6);
            ctx.lineTo(ax + TILE_SIZE / 2 + 4, bubbleY + bubbleH);
            ctx.fill();

            // Text
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = '7px monospace';
            ctx.textAlign = 'left';
            // Word wrap
            const words = bubbleText.split(' ');
            let line = '';
            let lineY = bubbleY + 8;
            for (const word of words) {
              const testLine = line + word + ' ';
              if (ctx.measureText(testLine).width > bubbleMaxW - 12) {
                ctx.fillText(line.trim(), bubbleX + 6, lineY);
                line = word + ' ';
                lineY += 10;
              } else {
                line = testLine;
              }
            }
            ctx.fillText(line.trim(), bubbleX + 6, lineY);

            // Cursor for active speech
            if (agent.animState === 'talk') {
              ctx.fillStyle = agent.color;
              ctx.fillRect(bubbleX + 6 + ctx.measureText(line.trim()).width, lineY - 6, 5, 7);
            }
          }
        }

        ctx.restore();

        // ── Day/Night Overlay ──
        const dn = getDayNightOverlay(gameTick);
        if (dn.opacity > 0) {
          ctx.fillStyle = dn.color + Math.floor(dn.opacity * 255).toString(16).padStart(2, '0');
          ctx.fillRect(0, 0, viewW, viewH);
        }

        // ── Hovered Tile Highlight ──
        if (hoveredTile) {
          const screen = {
            x: (hoveredTile.x * TILE_SIZE - clamped.x) * clamped.zoom,
            y: (hoveredTile.y * TILE_SIZE - clamped.y) * clamped.zoom,
          };
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.strokeRect(screen.x, screen.y, TILE_SIZE * clamped.zoom, TILE_SIZE * clamped.zoom);
        }

        // ── Minimap ──
        const mmScale = 2.5;
        const mmW = MAP_COLS * mmScale;
        const mmH = MAP_ROWS * mmScale;
        const mmX = viewW - mmW - 8;
        const mmY = viewH - mmH - 8;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);

        if (map) {
          for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
              const tile = map[r][c];
              const colors: Record<number, string> = {
                [TileType.GRASS]: '#4a7c3f',
                [TileType.DIRT]: '#8B7355',
                [TileType.WATER]: '#3a7bd5',
                [TileType.FENCE]: '#6B4423',
                [TileType.BUILDING_FLOOR]: '#9e8e7e',
                [TileType.PATH]: '#a89070',
              };
              ctx.fillStyle = colors[tile] ?? '#4a7c3f';
              ctx.fillRect(mmX + c * mmScale, mmY + r * mmScale, mmScale, mmScale);
            }
          }

          // Buildings on minimap
          for (const b of BUILDINGS) {
            ctx.fillStyle = b.color + '80';
            ctx.fillRect(mmX + b.x * mmScale, mmY + b.y * mmScale, b.w * mmScale, b.h * mmScale);
          }

          // Agents on minimap
          for (const agent of Object.values(agents)) {
            ctx.fillStyle = agent.color;
            ctx.fillRect(
              mmX + (agent.pixelX / TILE_SIZE) * mmScale - 1.5,
              mmY + (agent.pixelY / TILE_SIZE) * mmScale - 1.5,
              3, 3
            );
          }
        }

        // Viewport rectangle on minimap
        const vpX = mmX + (clamped.x / TILE_SIZE) * mmScale;
        const vpY = mmY + (clamped.y / TILE_SIZE) * mmScale;
        const vpW = (viewW / clamped.zoom / TILE_SIZE) * mmScale;
        const vpH = (viewH / clamped.zoom / TILE_SIZE) * mmScale;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(vpX, vpY, vpW, vpH);

        // ── Time of day label ──
        const dn2 = getDayNightOverlay(gameTick);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(mmX, mmY - 14, 45, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '7px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(dn2.phase, mmX + 3, mmY - 5);

        ctx.restore();
      };

      render();
      return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
    };

    const cleanup = render();
    return cleanup;
  }, [agents, resources, sessionStatus, gameTick, hoveredTile]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block cursor-grab active:cursor-grabbing"
      style={{ imageRendering: 'pixelated' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
