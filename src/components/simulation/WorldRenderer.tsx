'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  generateMap, TILE_SIZE, MAP_COLS, MAP_ROWS, WORLD_W, WORLD_H,
  TileType, BUILDINGS, STATION_POSITIONS,
  getDayNightOverlay, clampCamera, screenToWorld,
  type Camera, type Resources,
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
  path: { x: number; y: number }[];
  direction: 'down' | 'up' | 'left' | 'right';
  animState: 'idle' | 'walk' | 'work' | 'talk' | 'summon' | 'wander';
  animFrame: number;
  animTimer: number;
  isMoving: boolean;
  speechBubble: string;
  speechTimer: number;
  spawnEffect: number;
  color: string;
  name: string;
  energy: number;
  // Alive behaviors
  wanderTimer: number;
  wanderCount: number;
  idleTimer: number;
  emote: string;
  emoteTimer: number;
  charIndex: number; // which pixel-agents character to use (0-5)
}

export interface WorldRendererProps {
  agents: Record<string, AgentEntity>;
  resources: Resources;
  sessionStatus: string;
  gameTick: number;
}

// ─── PERFORMANCE: Pre-rendered tile atlas ────────────────────────────────────
// Instead of drawing 1200 individual tile images every frame, we pre-render
// the ENTIRE static world into a single offscreen canvas and just blit it.

const ATLAS_TILE_SIZE = 16; // source tiles are 16px
const RENDER_TILE = 32; // rendered at 32px

// ─── Character sprite layout from pixel-agents ─────────────────────────────
// 7 cols: walk1,walk2,walk3,walk4, type1, type2, read
// 4 rows: down, up, right, left
// Frame size: 16x24 source, rendered at 48x72 (3x)
const CHAR_FRAME_W = 16;
const CHAR_FRAME_H = 24;
const CHAR_SCALE = 3;
const CHAR_RENDER_W = CHAR_FRAME_W * CHAR_SCALE; // 48
const CHAR_RENDER_H = CHAR_FRAME_H * CHAR_SCALE; // 72
const CHAR_COLS = 7;
const CHAR_ROWS = 4;

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorldRenderer({ agents, resources, sessionStatus, gameTick }: WorldRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null); // offscreen cache
  const staticDirtyRef = useRef(true);
  const mapRef = useRef<TileType[][] | null>(null);
  const decorRef = useRef<{ x: number; y: number; type: string; seed: number }[]>([]);
  const charImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const charImagesLoadedRef = useRef(false);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1.5 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0 });
  const lastFrameTimeRef = useRef(0);
  const fpsRef = useRef(60);
  const animFrameRef = useRef(0);

  // ─── Generate map once ───────────────────────────────────────────────────
  useEffect(() => {
    const map = generateMap();
    mapRef.current = map;

    const rng = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
    const rand = rng(42);
    const decos: typeof decorRef.current = [];
    for (let y = 0; y < MAP_ROWS; y++) {
      for (let x = 0; x < MAP_COLS; x++) {
        if (map[y][x] !== TileType.GRASS && map[y][x] !== TileType.DIRT) continue;
        let skip = false;
        for (const b of BUILDINGS) {
          if (x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h) skip = true;
        }
        if (x >= 7 && x <= 9 && (y >= 6 || y >= 21)) skip = true;
        if (x >= 30 && x <= 32 && (y >= 6 || y >= 21)) skip = true;
        if (skip) continue;
        const r = rand();
        if (r < 0.02) decos.push({ x, y, type: 'rock', seed: rand() });
        else if (r < 0.045) decos.push({ x, y, type: 'flower', seed: rand() });
        else if (r < 0.07) decos.push({ x, y, type: 'plant', seed: rand() });
        else if (r < 0.085) decos.push({ x, y, type: 'bush', seed: rand() });
      }
    }
    decorRef.current = decos;
  }, []);

  // ─── Load character sprites ──────────────────────────────────────────────
  useEffect(() => {
    const charNames = ['mastermind', 'worker', 'reviewer', 'creative', 'hacker', 'analyst'];
    let loaded = 0;
    for (const name of charNames) {
      const img = new Image();
      img.onload = () => {
        charImagesRef.current[name] = img;
        loaded++;
        if (loaded >= charNames.length) charImagesLoadedRef.current = true;
      };
      img.onerror = () => {
        loaded++;
        if (loaded >= charNames.length) charImagesLoadedRef.current = true;
      };
      img.src = `/sprites/characters/pixel-agents/${name}/sheet_3x.png`;
    }
  }, []);

  // ─── Pre-render static world to offscreen canvas ─────────────────────────
  const renderStaticWorld = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const map = mapRef.current;
    if (!map) return;

    const canvas = document.createElement('canvas');
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    const sCtx = canvas.getContext('2d')!;

    // Draw all tiles using simple colored rectangles (fast!)
    const colors: Record<number, string> = {
      [TileType.GRASS]: '#5a8c4a',
      [TileType.DIRT]: '#8B7355',
      [TileType.WATER]: '#3a7bd5',
      [TileType.FENCE]: '#6B4423',
      [TileType.BUILDING_FLOOR]: '#9e8e7e',
      [TileType.PATH]: '#b09070',
    };

    // Batch all same-type tiles together (reduces fillStyle changes)
    const tileBuckets = new Map<number, { x: number; y: number }[]>();
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const t = map[r][c];
        if (!tileBuckets.has(t)) tileBuckets.set(t, []);
        tileBuckets.get(t)!.push({ x: c * TILE_SIZE, y: r * TILE_SIZE });
      }
    }

    // Draw each tile type as a batch
    for (const [type, tiles] of tileBuckets) {
      sCtx.fillStyle = colors[type] || '#5a8c4a';
      for (const t of tiles) {
        sCtx.fillRect(t.x, t.y, TILE_SIZE, TILE_SIZE);
      }
    }

    // Add subtle grass variation using deterministic noise
    sCtx.fillStyle = 'rgba(0,0,0,0.03)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (map[r][c] === TileType.GRASS) {
          const hash = ((c * 7 + r * 13 + c * r) % 5);
          if (hash < 2) {
            sCtx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    // Add grass highlights
    sCtx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (map[r][c] === TileType.GRASS) {
          const hash = ((c * 11 + r * 3 + c * r * 7) % 8);
          if (hash < 2) {
            sCtx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    // Draw water with animated-looking pattern
    sCtx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (map[r][c] === TileType.WATER) {
          const hash = ((c + r) % 3);
          if (hash === 0) {
            sCtx.fillRect(c * TILE_SIZE + 4, r * TILE_SIZE + 4, TILE_SIZE - 8, 2);
          }
        }
      }
    }

    // Draw fences
    sCtx.fillStyle = '#5a3a1a';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (map[r][c] === TileType.FENCE) {
          sCtx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          sCtx.fillStyle = '#8B6B3A';
          sCtx.fillRect(c * TILE_SIZE + 2, r * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          sCtx.fillStyle = '#5a3a1a';
        }
      }
    }

    // Draw paths with subtle stone pattern
    sCtx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (map[r][c] === TileType.PATH) {
          const hash = ((c * 3 + r * 7) % 6);
          if (hash < 2) {
            sCtx.fillRect(c * TILE_SIZE + 4, r * TILE_SIZE + 4, 6, 6);
          }
        }
      }
    }

    // Draw building interiors
    for (const b of BUILDINGS) {
      const bx = b.x * TILE_SIZE;
      const by = b.y * TILE_SIZE;
      const bw = b.w * TILE_SIZE;
      const bh = b.h * TILE_SIZE;
      // Darker floor inside
      sCtx.fillStyle = b.color + '15';
      sCtx.fillRect(bx, by, bw, bh);
      // Border
      sCtx.strokeStyle = b.color + '50';
      sCtx.lineWidth = 2;
      sCtx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      // Name
      sCtx.fillStyle = b.color + 'AA';
      sCtx.font = 'bold 10px monospace';
      sCtx.textAlign = 'center';
      sCtx.fillText(b.name.toUpperCase(), bx + bw / 2, by + bh - 6);
      // Emoji
      sCtx.font = '20px sans-serif';
      sCtx.fillText(b.emoji, bx + bw / 2 - 10, by + 24);
      // Desk icon
      sCtx.fillStyle = b.color + '40';
      sCtx.fillRect(bx + bw / 2 - 8, by + bh / 2 - 4, 16, 8);
    }

    // Draw decorations
    for (const deco of decorRef.current) {
      const px = deco.x * TILE_SIZE;
      const py = deco.y * TILE_SIZE;
      if (deco.type === 'rock') {
        sCtx.fillStyle = '#888';
        sCtx.beginPath();
        sCtx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 5, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.fillStyle = '#aaa';
        sCtx.beginPath();
        sCtx.arc(px + TILE_SIZE / 2 - 1, py + TILE_SIZE / 2 - 1, 3, 0, Math.PI * 2);
        sCtx.fill();
      } else if (deco.type === 'flower') {
        const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'];
        sCtx.fillStyle = colors[Math.floor(deco.seed * 4)];
        sCtx.beginPath();
        sCtx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 3, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.fillStyle = '#2d5a27';
        sCtx.fillRect(px + TILE_SIZE / 2 - 0.5, py + TILE_SIZE / 2 + 2, 1, 6);
      } else if (deco.type === 'plant') {
        sCtx.fillStyle = '#3a7a2e';
        sCtx.beginPath();
        sCtx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 5, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.fillStyle = '#4a9a3e';
        sCtx.beginPath();
        sCtx.arc(px + TILE_SIZE / 2 - 2, py + TILE_SIZE / 2 - 2, 3, 0, Math.PI * 2);
        sCtx.fill();
      } else if (deco.type === 'bush') {
        sCtx.fillStyle = '#2d6a22';
        sCtx.beginPath();
        sCtx.ellipse(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 8, 5, 0, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.fillStyle = '#3d8a32';
        sCtx.beginPath();
        sCtx.ellipse(px + TILE_SIZE / 2 - 2, py + TILE_SIZE / 2 - 1, 5, 3, 0, 0, Math.PI * 2);
        sCtx.fill();
      }
    }

    staticCanvasRef.current = canvas;
    staticDirtyRef.current = false;
  }, []);

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
  }, []);

  // ─── Resize ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = c.clientWidth;
      c.height = c.clientHeight;
      staticDirtyRef.current = true;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Center camera on first load
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const cam = cameraRef.current;
    cam.x = (WORLD_W - c.width / cam.zoom) / 2;
    cam.y = (WORLD_H - c.height / cam.zoom) / 2;
  }, []);

  // ─── Render loop (throttled to ~30fps, uses offscreen cache) ──────────────
  useEffect(() => {
    let running = true;

    const render = (timestamp: number) => {
      if (!running) return;

      // Throttle to ~30fps
      const elapsed = timestamp - lastFrameTimeRef.current;
      if (elapsed < 33) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTimeRef.current = timestamp;
      fpsRef.current = 1000 / elapsed;

      const canvas = canvasRef.current;
      if (!canvas) { animFrameRef.current = requestAnimationFrame(render); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { animFrameRef.current = requestAnimationFrame(render); return; }

      const w = canvas.width;
      const h = canvas.height;
      const cam = cameraRef.current;

      // Rebuild static canvas if needed
      if (staticDirtyRef.current || !staticCanvasRef.current) {
        renderStaticWorld(ctx, w, h);
      }

      // Clamp camera
      const clamped = clampCamera(cam, w, h);
      cameraRef.current = clamped;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.scale(clamped.zoom, clamped.zoom);
      ctx.translate(-clamped.x, -clamped.y);

      // ── Blit pre-rendered world (single drawImage!) ──
      if (staticCanvasRef.current) {
        ctx.drawImage(staticCanvasRef.current, 0, 0);
      }

      // ── Draw animated water shimmer ──
      const map = mapRef.current;
      if (map) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (let r = 0; r < MAP_ROWS; r++) {
          for (let c = 0; c < MAP_COLS; c++) {
            if (map[r][c] === TileType.WATER) {
              const shimmer = ((gameTick + c * 3 + r * 7) % 60) < 30;
              if (shimmer) {
                ctx.fillRect(c * TILE_SIZE + 4, r * TILE_SIZE + 8, 8, 2);
              }
            }
          }
        }

        // ── Draw swaying decorations ──
        for (const deco of decorRef.current) {
          if (deco.type === 'flower' || deco.type === 'plant') {
            const sway = Math.sin(gameTick * 0.03 + deco.seed * 50) * 1.5;
            const px = deco.x * TILE_SIZE;
            const py = deco.y * TILE_SIZE;
            if (deco.type === 'flower') {
              const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'];
              ctx.fillStyle = colors[Math.floor(deco.seed * 4)];
              ctx.beginPath();
              ctx.arc(px + TILE_SIZE / 2 + sway, py + TILE_SIZE / 2, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // ── Draw Characters ──
      const sortedAgents = Object.values(agents).sort((a, b) => a.pixelY - b.pixelY);
      const charLoaded = charImagesLoadedRef.current;

      for (const agent of sortedAgents) {
        const ax = agent.pixelX;
        const ay = agent.pixelY;

        // Cull offscreen agents
        if (ax < clamped.x - 100 || ax > clamped.x + w / clamped.zoom + 100) continue;
        if (ay < clamped.y - 100 || ay > clamped.y + h / clamped.zoom + 100) continue;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(ax + TILE_SIZE / 2, ay + TILE_SIZE - 2, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Spawn effect
        if (agent.spawnEffect > 0) {
          const progress = 1 - agent.spawnEffect;
          ctx.strokeStyle = agent.color + Math.floor(agent.spawnEffect * 200).toString(16).padStart(2, '0');
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, progress * 35, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Active glow
        if (agent.animState === 'work' || agent.animState === 'talk') {
          const r = 22 + Math.sin(gameTick * 0.05) * 5;
          ctx.fillStyle = agent.color + '18';
          ctx.beginPath();
          ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw character from pixel-agents sprite sheet
        if (charLoaded) {
          const charName = agent.charIndex !== undefined
            ? ['mastermind', 'worker', 'reviewer', 'creative', 'hacker', 'analyst'][agent.charIndex] || 'mastermind'
            : agent.agentId;
          const charImg = charImagesRef.current[charName];
          if (charImg && charImg.complete) {
            // Sprite layout: 7 cols (walk1-4, type1-2, read) × 4 rows (down, up, right, left)
            const dirRow: Record<string, number> = { down: 0, up: 1, right: 2, left: 3 };
            let frameCol = 0;
            if (agent.animState === 'walk' || agent.isMoving) {
              frameCol = agent.animFrame % 4; // walk frames 0-3
            } else if (agent.animState === 'work' || agent.animState === 'talk') {
              frameCol = 4 + (Math.floor(gameTick / 15) % 2); // type frames 4-5
            } else if (agent.animState === 'wander') {
              frameCol = agent.animFrame % 4;
            }

            const row = dirRow[agent.direction] ?? 0;
            const srcX = frameCol * CHAR_RENDER_W;
            const srcY = row * CHAR_RENDER_H;

            // Draw character centered on tile
            const drawX = ax + (TILE_SIZE - CHAR_RENDER_W) / 2;
            const drawY = ay - CHAR_RENDER_H + TILE_SIZE + 4;

            ctx.drawImage(charImg, srcX, srcY, CHAR_RENDER_W, CHAR_RENDER_H, drawX, drawY, CHAR_RENDER_W, CHAR_RENDER_H);
          } else {
            // Fallback colored circle
            drawFallbackCharacter(ctx, agent, ax, ay);
          }
        } else {
          drawFallbackCharacter(ctx, agent, ax, ay);
        }

        // Name tag
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const nameText = agent.name;
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        const nw = ctx.measureText(nameText).width + 6;
        const ny = ay - CHAR_RENDER_H + 2;
        ctx.fillRect(ax + TILE_SIZE / 2 - nw / 2, ny - 7, nw, 10);
        ctx.fillStyle = agent.color;
        ctx.fillText(nameText, ax + TILE_SIZE / 2, ny);

        // Active indicator dot
        if (agent.animState === 'work' || agent.animState === 'talk') {
          const ds = 1 + Math.sin(gameTick * 0.1) * 0.3;
          ctx.fillStyle = agent.color;
          ctx.beginPath();
          ctx.arc(ax + TILE_SIZE - 2, ny - 4, 3 * ds, 0, Math.PI * 2);
          ctx.fill();
        }

        // Speech bubble
        if (agent.speechBubble) {
          drawSpeechBubble(ctx, agent, ax, ay, gameTick);
        }

        // Emote (for alive behaviors)
        if (agent.emoteTimer > 0) {
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          const emoteY = ay - CHAR_RENDER_H - 10 - Math.sin(gameTick * 0.08) * 3;
          ctx.fillText(agent.emote, ax + TILE_SIZE / 2, emoteY);
        }
      }

      ctx.restore();

      // ── Day/Night overlay ──
      const dn = getDayNightOverlay(gameTick);
      if (dn.opacity > 0) {
        ctx.fillStyle = dn.color;
        ctx.globalAlpha = dn.opacity;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      // ── Minimap ──
      drawMinimap(ctx, map, agents, clamped, w, h, gameTick);

      // ── FPS counter (debug) ──
      // ctx.fillStyle = 'rgba(255,255,255,0.5)';
      // ctx.font = '10px monospace';
      // ctx.textAlign = 'left';
      // ctx.fillText(`${Math.round(fpsRef.current)}fps`, 5, h - 5);

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [agents, gameTick, renderStaticWorld]);

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

// ─── Helper: Draw fallback character ────────────────────────────────────────
function drawFallbackCharacter(ctx: CanvasRenderingContext2D, agent: AgentEntity, ax: number, ay: number) {
  ctx.fillStyle = agent.color;
  ctx.beginPath();
  ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2 - 5, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F5D6C6';
  ctx.beginPath();
  ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2 - 18, 7, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Helper: Draw speech bubble ─────────────────────────────────────────────
function drawSpeechBubble(ctx: CanvasRenderingContext2D, agent: AgentEntity, ax: number, ay: number, tick: number) {
  const text = agent.speechBubble.length > 100 ? agent.speechBubble.slice(0, 97) + '...' : agent.speechBubble;
  ctx.font = '7px monospace';
  const maxW = 130;
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

  const bubbleW = Math.min(...lines.map(l => ctx.measureText(l).width)) + 12;
  const realW = Math.max(bubbleW, ctx.measureText(lines[0]).width + 12);
  const bubbleH = lines.length * 10 + 8;
  const bx = ax + TILE_SIZE / 2 - realW / 2;
  const by = ay - CHAR_RENDER_H - bubbleH - 8;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath();
  ctx.roundRect(bx, by, realW, bubbleH, 4);
  ctx.fill();

  // Border
  ctx.strokeStyle = agent.color + '40';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, realW, bubbleH, 4);
  ctx.stroke();

  // Tail
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath();
  ctx.moveTo(ax + TILE_SIZE / 2 - 4, by + bubbleH);
  ctx.lineTo(ax + TILE_SIZE / 2, by + bubbleH + 5);
  ctx.lineTo(ax + TILE_SIZE / 2 + 4, by + bubbleH);
  ctx.fill();

  // Text
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'left';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bx + 6, by + 9 + i * 10);
  }

  // Cursor for active speech
  if (agent.animState === 'talk' || agent.animState === 'work') {
    const lastLineWidth = ctx.measureText(lines[lines.length - 1]).width;
    ctx.fillStyle = agent.color;
    const cursorVisible = Math.sin(tick * 0.15) > 0;
    if (cursorVisible) {
      ctx.fillRect(bx + 6 + lastLineWidth, by + 9 + (lines.length - 1) * 10 - 6, 5, 7);
    }
  }
}

// ─── Helper: Draw minimap ───────────────────────────────────────────────────
function drawMinimap(
  ctx: CanvasRenderingContext2D,
  map: TileType[][] | null,
  agents: Record<string, AgentEntity>,
  cam: Camera,
  w: number,
  h: number,
  tick: number,
) {
  if (!map) return;

  const scale = 2.5;
  const mmW = MAP_COLS * scale;
  const mmH = MAP_ROWS * scale;
  const mx = w - mmW - 8;
  const my = h - mmH - 8;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(mx - 2, my - 2, mmW + 4, mmH + 4);

  // Tiles (simple colors)
  const colors: Record<number, string> = {
    [TileType.GRASS]: '#5a8c4a',
    [TileType.DIRT]: '#8B7355',
    [TileType.WATER]: '#3a7bd5',
    [TileType.FENCE]: '#6B4423',
    [TileType.BUILDING_FLOOR]: '#9e8e7e',
    [TileType.PATH]: '#b09070',
  };

  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      ctx.fillStyle = colors[map[r][c]] || '#5a8c4a';
      ctx.fillRect(mx + c * scale, my + r * scale, scale, scale);
    }
  }

  // Buildings
  for (const b of BUILDINGS) {
    ctx.fillStyle = b.color + '80';
    ctx.fillRect(mx + b.x * scale, my + b.y * scale, b.w * scale, b.h * scale);
  }

  // Agents
  for (const agent of Object.values(agents)) {
    ctx.fillStyle = agent.color;
    ctx.fillRect(
      mx + (agent.pixelX / TILE_SIZE) * scale - 1.5,
      my + (agent.pixelY / TILE_SIZE) * scale - 1.5,
      3, 3,
    );
  }

  // Viewport rect
  const vpX = mx + (cam.x / TILE_SIZE) * scale;
  const vpY = my + (cam.y / TILE_SIZE) * scale;
  const vpW = (w / cam.zoom / TILE_SIZE) * scale;
  const vpH = (h / cam.zoom / TILE_SIZE) * scale;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(vpX, vpY, vpW, vpH);

  // Time label
  const dn = getDayNightOverlay(tick);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(mx, my - 14, 45, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '7px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(dn.phase, mx + 3, my - 5);
}
