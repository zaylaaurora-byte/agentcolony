'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  generateMap, TILE_SIZE, MAP_COLS, MAP_ROWS, WORLD_W, WORLD_H,
  TileType, BUILDINGS, clampCamera, getDayNightOverlay, createMinimapCanvas,
  TILE_WALKABLE,
  type Camera, type Resources, type Decoration,
} from '@/lib/game-world';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AgentEntity {
  agentId: string;
  tileX: number;
  tileY: number;
  pixelX: number;
  pixelY: number;
  targetTileX: number;
  targetTileY: number;
  direction: 'down' | 'up' | 'left' | 'right';
  animState: 'idle' | 'walk' | 'work' | 'talk' | 'wander';
  animFrame: number;
  animTimer: number;
  isMoving: boolean;
  speechBubble: string;
  speechTimer: number;
  spawnEffect: number;
  color: string;
  name: string;
  energy: number;
  charType: 'mastermind' | 'worker' | 'reviewer' | 'creative' | 'hacker' | 'analyst';
  // Alive behaviors
  wanderTimer: number;
  idleTimer: number;
  emote: string;
  emoteTimer: number;
}

export interface WorldRendererProps {
  agents: Record<string, AgentEntity>;
  resources: Resources;
  sessionStatus: string;
  gameTick: number;
}

// ─── Sprite Constants ──────────────────────────────────────────────────────
// pixel-agents frames: 16x24 each, individual PNGs
// Sprout Lands character: 32x32 each, individual PNGs
const CHAR_RENDER_SCALE = 3;
const PA_FRAME_W = 16;
const PA_FRAME_H = 24;
const PA_RENDER_W = PA_FRAME_W * CHAR_RENDER_SCALE; // 48
const PA_RENDER_H = PA_FRAME_H * CHAR_RENDER_SCALE; // 72

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorldRenderer({ agents, resources, sessionStatus, gameTick }: WorldRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // ALL mutable state in refs — NEVER as effect dependencies
  const agentsRef = useRef(agents);
  const gameTickRef = useRef(gameTick);
  const resourcesRef = useRef(resources);
  const sessionRef = useRef(sessionStatus);

  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<TileType[][] | null>(null);
  const decorRef = useRef<Decoration[]>([]);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const minimapDirtyRef = useRef(true);

  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1.5 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0 });
  const animFrameRef = useRef(0);
  const lastFrameTimeRef = useRef(0);

  // Character sprite caches (Image objects)
  const charSpritesRef = useRef<Record<string, HTMLImageElement>>({});
  const charSpritesLoadedRef = useRef(false);
  const tileImgCacheRef = useRef<Record<string, HTMLImageElement>>({});
  const tileSpritesLoadedRef = useRef(false);

  // Sync props to refs (cheap, no re-renders)
  agentsRef.current = agents;
  gameTickRef.current = gameTick;
  resourcesRef.current = resources;
  sessionRef.current = sessionStatus;

  // ─── Generate map once ───────────────────────────────────────────────────
  useEffect(() => {
    const { tiles, decorations } = generateMap();
    mapRef.current = tiles;
    decorRef.current = decorations;
  }, []);

  // ─── Load tile sprites (Sprout Lands tilesets) ───────────────────────────
  useEffect(() => {
    const tileSources: Record<string, string> = {
      grass_0: '/sprites/sprout-lands/tilesets/Grass.png',
      hills: '/sprites/sprout-lands/tilesets/Hills.png',
      water: '/sprites/sprout-lands/tilesets/Water.png',
      fences: '/sprites/sprout-lands/tilesets/Fences.png',
      house: '/sprites/sprout-lands/tilesets/Wooden House.png',
      doors: '/sprites/sprout-lands/tilesets/Doors.png',
      dirt: '/sprites/sprout-lands/tilesets/Tilled_Dirt.png',
    };

    let loaded = 0;
    const total = Object.keys(tileSources).length;

    for (const [key, src] of Object.entries(tileSources)) {
      const img = new Image();
      img.onload = () => {
        tileImgCacheRef.current[key] = img;
        loaded++;
        if (loaded >= total) tileSpritesLoadedRef.current = true;
      };
      img.onerror = () => {
        loaded++;
        if (loaded >= total) tileSpritesLoadedRef.current = true;
      };
      img.src = src;
    }
  }, []);

  // ─── Load character sprites (pixel-agents) ───────────────────────────────
  useEffect(() => {
    const charTypes = ['mastermind', 'worker', 'reviewer', 'creative', 'hacker', 'analyst'] as const;
    const directions = ['down', 'up', 'right', 'left'] as const;
    const actions = ['walk1', 'walk2', 'walk3', 'walk4', 'type1', 'type2', 'read'] as const;

    let loaded = 0;
    const total = charTypes.length * directions.length * actions.length;

    for (const charType of charTypes) {
      for (const dir of directions) {
        for (const action of actions) {
          const key = `${charType}_${dir}_${action}`;
          const img = new Image();
          img.onload = () => {
            charSpritesRef.current[key] = img;
            loaded++;
            if (loaded >= total) charSpritesLoadedRef.current = true;
          };
          img.onerror = () => {
            loaded++;
            if (loaded >= total) charSpritesLoadedRef.current = true;
          };
          img.src = `/sprites/characters/pixel-agents/${charType}/${dir}_${action}.png`;
        }
      }
    }
  }, []);

  // ─── Pre-render static world ─────────────────────────────────────────────
  const renderStaticWorld = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const canvas = document.createElement('canvas');
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    const ctx = canvas.getContext('2d')!;
    const tileSprites = tileSpritesLoadedRef.current;

    // Rich tile colors (fallback when sprite tiles aren't loaded)
    const tileColors: Record<number, string> = {
      [TileType.GRASS]: '#5a8c4a',
      [TileType.GRASS_DARK]: '#4a7a3a',
      [TileType.GRASS_LIGHT]: '#6a9c5a',
      [TileType.DIRT]: '#8B7355',
      [TileType.WATER]: '#4a8ae5',
      [TileType.WATER_DEEP]: '#2a5ba5',
      [TileType.FENCE_H]: '#6B4423',
      [TileType.FENCE_V]: '#6B4423',
      [TileType.FENCE_CORNER]: '#5a3a1a',
      [TileType.BUILDING_FLOOR]: '#a09080',
      [TileType.PATH]: '#b89878',
      [TileType.PATH_STONE]: '#a88868',
      [TileType.HILL]: '#7a6a5a',
      [TileType.TILLED]: '#7a6040',
      [TileType.FLOWER_RED]: '#5a8c4a',
      [TileType.FLOWER_YELLOW]: '#5a8c4a',
      [TileType.FLOWER_BLUE]: '#5a8c4a',
      [TileType.FLOWER_WHITE]: '#5a8c4a',
    };

    // Batch-draw tiles by color (minimizes fillStyle changes)
    const batches = new Map<string, { x: number; y: number; w: number; h: number }[]>();
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const t = map[r][c];
        const color = tileColors[t] || '#5a8c4a';
        if (!batches.has(color)) batches.set(color, []);
        batches.get(color)!.push({ x: c * TILE_SIZE, y: r * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
      }
    }
    for (const [color, rects] of batches) {
      ctx.fillStyle = color;
      for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    // ── Grass texture details ──
    // Subtle dark patches
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const t = map[r][c];
        if (t === TileType.GRASS || t === TileType.GRASS_LIGHT) {
          if (((c * 7 + r * 13 + c * r) % 5) < 2) {
            ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }
    // Subtle light patches
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const t = map[r][c];
        if (t === TileType.GRASS || t === TileType.GRASS_DARK) {
          if (((c * 11 + r * 3 + c * r * 7) % 8) < 2) {
            ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    // ── Water sparkle ──
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (map[r][c] === TileType.WATER) {
          if (((c + r * 3) % 4) === 0) {
            ctx.fillRect(c * TILE_SIZE + 6, r * TILE_SIZE + 6, 8, 2);
          }
        }
      }
    }

    // ── Water deep shading ──
    ctx.fillStyle = 'rgba(0,0,50,0.15)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (map[r][c] === TileType.WATER_DEEP) {
          ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // ── Fence details ──
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const t = map[r][c];
        if (t === TileType.FENCE_H || t === TileType.FENCE_V) {
          const px = c * TILE_SIZE;
          const py = r * TILE_SIZE;
          // Post
          ctx.fillStyle = '#5a3a1a';
          ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          // Top highlight
          ctx.fillStyle = '#9B7B4A';
          ctx.fillRect(px + 4, py + 3, TILE_SIZE - 8, 3);
          // Rail
          ctx.fillStyle = '#7B5B3A';
          if (t === TileType.FENCE_H) {
            ctx.fillRect(px, py + 12, TILE_SIZE, 4);
          } else {
            ctx.fillRect(px + 12, py, 4, TILE_SIZE);
          }
        }
        if (t === TileType.FENCE_CORNER) {
          const px = c * TILE_SIZE;
          const py = r * TILE_SIZE;
          ctx.fillStyle = '#5a3a1a';
          ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          ctx.fillStyle = '#8B6B3A';
          ctx.fillRect(px + 6, py + 6, TILE_SIZE - 12, TILE_SIZE - 12);
        }
      }
    }

    // ── Path details ──
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (map[r][c] === TileType.PATH || map[r][c] === TileType.PATH_STONE) {
          const px = c * TILE_SIZE;
          const py = r * TILE_SIZE;
          // Edge darkening
          ctx.fillStyle = 'rgba(0,0,0,0.05)';
          ctx.fillRect(px, py, TILE_SIZE, 1);
          ctx.fillRect(px, py, 1, TILE_SIZE);
          // Stone pebbles on path_stone
          if (map[r][c] === TileType.PATH_STONE) {
            ctx.fillStyle = 'rgba(160,130,100,0.4)';
            ctx.fillRect(px + 5, py + 5, 6, 6);
            ctx.fillRect(px + 18, py + 16, 8, 6);
          }
        }
      }
    }

    // ── Flower overlays ──
    const flowerColors: Record<number, string> = {
      [TileType.FLOWER_RED]: '#ff6b6b',
      [TileType.FLOWER_YELLOW]: '#ffd93d',
      [TileType.FLOWER_BLUE]: '#6bcbff',
      [TileType.FLOWER_WHITE]: '#ffffff',
    };
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const fc = flowerColors[map[r][c]];
        if (fc) {
          const px = c * TILE_SIZE + TILE_SIZE / 2;
          const py = r * TILE_SIZE + TILE_SIZE / 2;
          // Stem
          ctx.fillStyle = '#2d5a27';
          ctx.fillRect(px - 0.5, py + 2, 1, 6);
          // Petals
          ctx.fillStyle = fc;
          ctx.beginPath();
          ctx.arc(px, py - 1, 3, 0, Math.PI * 2);
          ctx.fill();
          // Center
          ctx.fillStyle = '#ffd93d';
          ctx.beginPath();
          ctx.arc(px, py - 1, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ── Building interiors ──
    for (const b of BUILDINGS) {
      const bx = b.x * TILE_SIZE;
      const by = b.y * TILE_SIZE;
      const bw = b.w * TILE_SIZE;
      const bh = b.h * TILE_SIZE;

      // Floor
      ctx.fillStyle = b.color + '18';
      ctx.fillRect(bx, by, bw, bh);

      // Floor tile pattern
      ctx.fillStyle = b.color + '10';
      for (let fy = 0; fy < b.h; fy++) {
        for (let fx = 0; fx < b.w; fx++) {
          if ((fx + fy) % 2 === 0) {
            ctx.fillRect(bx + fx * TILE_SIZE, by + fy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }

      // Border
      ctx.strokeStyle = b.color + '60';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);

      // Inner border glow
      ctx.strokeStyle = b.color + '20';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);

      // Name
      ctx.fillStyle = b.color + 'CC';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(b.name.toUpperCase(), bx + bw / 2, by + bh - 8);

      // Emoji
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.emoji, bx + bw / 2, by + 22);

      // Desk
      ctx.fillStyle = b.color + '35';
      ctx.fillRect(bx + bw / 2 - 10, by + bh / 2, 20, 8);
      ctx.fillStyle = b.color + '25';
      ctx.fillRect(bx + bw / 2 - 12, by + bh / 2 + 8, 4, 6);
      ctx.fillRect(bx + bw / 2 + 8, by + bh / 2 + 8, 4, 6);
    }

    // ── Decorations ──
    for (const deco of decorRef.current) {
      const px = deco.x * TILE_SIZE;
      const py = deco.y * TILE_SIZE;
      const cx = px + TILE_SIZE / 2;
      const cy = py + TILE_SIZE / 2;

      if (deco.type === 'rock') {
        ctx.fillStyle = deco.variant < 2 ? '#7a7a7a' : '#8a8a8a';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 2, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = deco.variant < 2 ? '#9a9a9a' : '#aaa';
        ctx.beginPath();
        ctx.arc(cx - 1, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(cx - 2, cy - 1, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (deco.type === 'bush') {
        ctx.fillStyle = '#2d6a22';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 2, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3d8a32';
        ctx.beginPath();
        ctx.ellipse(cx - 2, cy, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a9a3e';
        ctx.beginPath();
        ctx.arc(cx - 3, cy - 1, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (deco.type === 'grass_tuft') {
        ctx.fillStyle = '#4a9a3e';
        for (let i = -2; i <= 2; i++) {
          ctx.fillRect(cx + i * 2 - 0.5, cy + 4, 1, 5 - Math.abs(i));
        }
      } else if (deco.type === 'stump') {
        ctx.fillStyle = '#6B4423';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 3, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8B6B3A';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 1, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Rings
        ctx.strokeStyle = '#6B4423';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy + 1, 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    staticCanvasRef.current = canvas;
  }, []);

  // ─── Build static world after map is ready ───────────────────────────────
  useEffect(() => {
    if (mapRef.current && !staticCanvasRef.current) {
      renderStaticWorld();
    }
  }, [renderStaticWorld]);

  // ─── Mouse handlers ──────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      dragRef.current = {
        dragging: true, startX: e.clientX, startY: e.clientY,
        camStartX: cameraRef.current.x, camStartY: cameraRef.current.y,
      };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { dragging, startX, startY, camStartX, camStartY } = dragRef.current;
    if (dragging) {
      const cam = cameraRef.current;
      cam.x = camStartX - (e.clientX - startX) / cam.zoom;
      cam.y = camStartY - (e.clientY - startY) / cam.zoom;
      minimapDirtyRef.current = true;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const cam = cameraRef.current;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    cam.zoom = Math.max(0.5, Math.min(3, cam.zoom * factor));
    minimapDirtyRef.current = true;
  }, []);

  // ─── Canvas resize ───────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = c.clientWidth;
      c.height = c.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ─── Center camera ───────────────────────────────────────────────────────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const cam = cameraRef.current;
    cam.x = (WORLD_W - c.width / cam.zoom) / 2;
    cam.y = (WORLD_H - c.height / cam.zoom) / 2;
  }, []);

  // ─── MAIN RENDER LOOP — runs once, never restarts ────────────────────────
  useEffect(() => {
    let running = true;
    let frameCount = 0;

    const render = (timestamp: number) => {
      if (!running) return;

      // Throttle to ~30fps
      const elapsed = timestamp - lastFrameTimeRef.current;
      if (elapsed < 33) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTimeRef.current = timestamp;
      frameCount++;

      const canvas = canvasRef.current;
      if (!canvas) { animFrameRef.current = requestAnimationFrame(render); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { animFrameRef.current = requestAnimationFrame(render); return; }

      const w = canvas.width;
      const h = canvas.height;
      const cam = clampCamera(cameraRef.current, w, h);
      cameraRef.current = cam;
      const tick = gameTickRef.current;
      const currentAgents = agentsRef.current;

      // ── Clear ──
      ctx.clearRect(0, 0, w, h);

      // ── Background (sky color) ──
      ctx.fillStyle = '#3a6a2a';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // ── Blit pre-rendered static world (single draw call!) ──
      if (staticCanvasRef.current) {
        ctx.drawImage(staticCanvasRef.current, 0, 0);
      }

      // ── Animated water shimmer ──
      const map = mapRef.current;
      if (map) {
        const viewLeft = Math.max(0, Math.floor(cam.x / TILE_SIZE) - 1);
        const viewRight = Math.min(MAP_COLS, Math.ceil((cam.x + w / cam.zoom) / TILE_SIZE) + 1);
        const viewTop = Math.max(0, Math.floor(cam.y / TILE_SIZE) - 1);
        const viewBottom = Math.min(MAP_ROWS, Math.ceil((cam.y + h / cam.zoom) / TILE_SIZE) + 1);

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        for (let r = viewTop; r < viewBottom; r++) {
          for (let c = viewLeft; c < viewRight; c++) {
            const t = map[r][c];
            if (t === TileType.WATER || t === TileType.WATER_DEEP) {
              const shimmer = ((tick * 0.5 + c * 3 + r * 7) % 40) < 20;
              if (shimmer) {
                const px = c * TILE_SIZE;
                const py = r * TILE_SIZE;
                ctx.fillRect(px + 6, py + 8 + Math.sin(tick * 0.02 + c) * 2, 10, 2);
              }
            }
          }
        }
      }

      // ── Draw characters (sorted by Y for depth) ──
      const sortedAgents = Object.values(currentAgents).sort((a, b) => a.pixelY - b.pixelY);
      const spritesReady = charSpritesLoadedRef.current;

      for (const agent of sortedAgents) {
        const ax = agent.pixelX;
        const ay = agent.pixelY;

        // Cull offscreen agents
        const viewW = w / cam.zoom;
        const viewH = h / cam.zoom;
        if (ax < cam.x - 100 || ax > cam.x + viewW + 100) continue;
        if (ay < cam.y - 100 || ay > cam.y + viewH + 100) continue;

        // ── Shadow ──
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(ax + TILE_SIZE / 2, ay + TILE_SIZE - 2, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // ── Spawn effect ──
        if (agent.spawnEffect > 0) {
          const progress = 1 - agent.spawnEffect;
          const alpha = Math.floor(agent.spawnEffect * 180).toString(16).padStart(2, '0');
          ctx.strokeStyle = agent.color + alpha;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, progress * 40, 0, Math.PI * 2);
          ctx.stroke();

          // Sparkle particles
          for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + tick * 0.03;
            const dist = progress * 30 + Math.sin(tick * 0.1 + i) * 5;
            const sx = ax + TILE_SIZE / 2 + Math.cos(angle) * dist;
            const sy = ay + TILE_SIZE / 2 + Math.sin(angle) * dist;
            ctx.fillStyle = agent.color + alpha;
            ctx.beginPath();
            ctx.arc(sx, sy, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // ── Active glow (work/talk state) ──
        if (agent.animState === 'work' || agent.animState === 'talk') {
          const glowR = 24 + Math.sin(tick * 0.04) * 4;
          ctx.fillStyle = agent.color + '15';
          ctx.beginPath();
          ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2 - 10, glowR, 0, Math.PI * 2);
          ctx.fill();

          // Pulsing ring
          const pulseR = 20 + Math.sin(tick * 0.08) * 8;
          ctx.strokeStyle = agent.color + '30';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2 - 10, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // ── Draw character sprite ──
        const charType = agent.charType || 'worker';
        let drawn = false;

        if (spritesReady) {
          // Determine animation frame
          const dir = agent.direction;
          let action = 'walk1';
          if (agent.isMoving || agent.animState === 'walk' || agent.animState === 'wander') {
            const walkFrames = ['walk1', 'walk2', 'walk3', 'walk4'];
            action = walkFrames[agent.animFrame % 4];
          } else if (agent.animState === 'work') {
            action = Math.floor(tick / 15) % 2 === 0 ? 'type1' : 'type2';
          } else if (agent.animState === 'talk') {
            action = Math.floor(tick / 12) % 2 === 0 ? 'type1' : 'read';
          } else {
            action = 'walk1'; // idle frame
          }

          const spriteKey = `${charType}_${dir}_${action}`;
          const img = charSpritesRef.current[spriteKey];

          if (img && img.complete && img.naturalWidth > 0) {
            const drawX = ax + (TILE_SIZE - PA_RENDER_W) / 2;
            const drawY = ay - PA_RENDER_H + TILE_SIZE + 6;

            // Draw at 3x scale
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, PA_FRAME_W, PA_FRAME_H, drawX, drawY, PA_RENDER_W, PA_RENDER_H);
            ctx.imageSmoothingEnabled = true;
            drawn = true;
          }
        }

        // Fallback: pixel character
        if (!drawn) {
          drawFallbackChar(ctx, agent, ax, ay, tick);
        }

        // ── Name tag ──
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        const nameText = agent.name;
        const nw = ctx.measureText(nameText).width + 8;
        const ny = ay - PA_RENDER_H + 2;
        ctx.beginPath();
        ctx.roundRect(ax + TILE_SIZE / 2 - nw / 2, ny - 8, nw, 11, 3);
        ctx.fill();

        ctx.fillStyle = agent.color;
        ctx.fillText(nameText, ax + TILE_SIZE / 2, ny);

        // Role indicator
        if (agent.animState === 'work' || agent.animState === 'talk') {
          const ds = 1.2 + Math.sin(tick * 0.1) * 0.3;
          ctx.fillStyle = agent.animState === 'work' ? '#F59E0B' : '#8B5CF6';
          ctx.beginPath();
          ctx.arc(ax + TILE_SIZE - 1, ny - 4, 3 * ds, 0, Math.PI * 2);
          ctx.fill();
        }

        // ── Speech bubble ──
        if (agent.speechBubble) {
          drawSpeechBubble(ctx, agent, ax, ay, tick);
        }

        // ── Emote ──
        if (agent.emoteTimer > 0 && agent.emote) {
          ctx.font = '16px sans-serif';
          ctx.textAlign = 'center';
          const emoteFloat = Math.sin(tick * 0.06) * 4;
          const emoteAlpha = Math.min(1, agent.emoteTimer / 20);
          ctx.globalAlpha = emoteAlpha;
          ctx.fillText(agent.emote, ax + TILE_SIZE / 2, ay - PA_RENDER_H - 14 + emoteFloat);
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();

      // ── Day/Night overlay ──
      const dn = getDayNightOverlay(tick);
      if (dn.opacity > 0) {
        ctx.fillStyle = dn.color;
        ctx.globalAlpha = dn.opacity;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      // ── Minimap (update every 15 frames to save perf) ──
      if (map && frameCount % 15 === 0 && minimapDirtyRef.current) {
        const agentList = Object.values(currentAgents).map(a => ({
          pixelX: a.pixelX, pixelY: a.pixelY, color: a.color,
        }));
        const mm = createMinimapCanvas(map, agentList, cam, w, h);
        if (mm) {
          minimapRef.current = mm;
          minimapDirtyRef.current = false;
        }
      }
      if (minimapRef.current) {
        const mm = minimapRef.current;
        ctx.drawImage(mm, w - mm.width - 8, h - mm.height - 8);
      }

      // ── Vignette effect ──
      const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.7);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, []); // ← EMPTY deps! Loop runs once, reads from refs

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block cursor-grab active:cursor-grabbing"
      style={{ imageRendering: 'auto' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// ─── Fallback character renderer ────────────────────────────────────────────
function drawFallbackChar(
  ctx: CanvasRenderingContext2D,
  agent: AgentEntity,
  ax: number,
  ay: number,
  tick: number,
) {
  const cx = ax + TILE_SIZE / 2;
  const cy = ay + TILE_SIZE / 2;

  // Body
  ctx.fillStyle = agent.color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 10, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#F5D6C6';
  ctx.beginPath();
  ctx.arc(cx, cy - 14, 8, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#333';
  const blink = Math.sin(tick * 0.05) > 0.95;
  if (!blink) {
    ctx.fillRect(cx - 4, cy - 15, 2, 2);
    ctx.fillRect(cx + 2, cy - 15, 2, 2);
  } else {
    ctx.fillRect(cx - 4, cy - 14, 2, 1);
    ctx.fillRect(cx + 2, cy - 14, 2, 1);
  }

  // Idle bob
  if (agent.animState === 'idle' && !agent.isMoving) {
    const bob = Math.sin(tick * 0.03) * 1;
    ctx.fillStyle = agent.color + '40';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 16 + bob, 8, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Speech bubble renderer ────────────────────────────────────────────────
function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  agent: AgentEntity,
  ax: number,
  ay: number,
  tick: number,
) {
  const text = agent.speechBubble.length > 120
    ? agent.speechBubble.slice(0, 117) + '...'
    : agent.speechBubble;

  ctx.font = '7px monospace';
  const maxW = 140;
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW) {
      lines.push(line.trim());
      line = word + ' ';
    } else {
      line = test;
    }
  }
  if (line.trim()) lines.push(line.trim());
  if (lines.length > 5) lines.length = 5;

  // Measure bubble size
  let maxLineW = 0;
  for (const l of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(l).width);
  }
  const bubbleW = maxLineW + 14;
  const bubbleH = lines.length * 10 + 10;
  const bubbleX = ax + TILE_SIZE / 2 - bubbleW / 2;
  const bubbleY = ay - PA_RENDER_H - bubbleH - 12;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.beginPath();
  ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 5);
  ctx.fill();

  // Colored accent border
  ctx.strokeStyle = agent.color + '50';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 5);
  ctx.stroke();

  // Tail
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.beginPath();
  ctx.moveTo(ax + TILE_SIZE / 2 - 5, bubbleY + bubbleH);
  ctx.lineTo(ax + TILE_SIZE / 2, bubbleY + bubbleH + 6);
  ctx.lineTo(ax + TILE_SIZE / 2 + 5, bubbleY + bubbleH);
  ctx.fill();

  // Text
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'left';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bubbleX + 7, bubbleY + 10 + i * 10);
  }

  // Blinking cursor for active speech
  if (agent.animState === 'talk' || agent.animState === 'work') {
    const lastLineW = ctx.measureText(lines[lines.length - 1]).width;
    if (Math.sin(tick * 0.15) > 0) {
      ctx.fillStyle = agent.color;
      ctx.fillRect(
        bubbleX + 7 + lastLineW,
        bubbleY + 10 + (lines.length - 1) * 10 - 6,
        5, 7,
      );
    }
  }
}
