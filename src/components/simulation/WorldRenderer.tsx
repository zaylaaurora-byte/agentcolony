'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  GameState, TILE_SIZE, MAP_COLS, MAP_ROWS, WORLD_W, WORLD_H,
  Agent, AgentState, Direction, CharSkin, DEFAULT_ZOOM,
  TileType, BUILDINGS, isWalkable,
} from '@/lib/game-engine';
import { getDayNightOverlay } from '@/lib/game-world';
import {
  loadAllSprites, onSpritesLoaded, getSpriteForAgent,
  getSpriteDimensions, isReady,
} from '@/lib/sprite-cache';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AgentEntity {
  agentId: string;
  name: string;
  charType: CharSkin;
  spriteSet: 'pixel-agents' | 'sprout-lands';
  color: string;
  x: number;
  y: number;
  state: AgentState;
  direction: Direction;
  animFrame: number;
  isMoving: boolean;
  speechBubble: string;
  speechTimer: number;
  emote: string;
  emoteTimer: number;
  spawnEffect: number;
  energy: number;
}

export interface WorldRendererProps {
  agents: Record<string, AgentEntity>;
  resources: {
    money: number;
    population: number;
    totalEnergy: number;
    tasksCompleted: number;
    tasksFailed: number;
    iteration: number;
    maxIterations: number;
    qualityScore: number;
    qualityThreshold: number;
  };
  sessionStatus: string;
  gameTick: number;
}

// ─── Camera ───────────────────────────────────────────────────────────────────
interface Camera {
  x: number;
  y: number;
  zoom: number;
}

// ─── Pixel-art tile colors ───────────────────────────────────────────────────
const TILE_COLORS: Record<number, string> = {
  [TileType.GRASS]: '#5a8c4a',
  [TileType.GRASS_DARK]: '#4a7a3a',
  [TileType.GRASS_LIGHT]: '#6a9c5a',
  [TileType.DIRT]: '#8B7355',
  [TileType.WATER]: '#4a8ae5',
  [TileType.WATER_DEEP]: '#2a5ba5',
  [TileType.PATH]: '#b89878',
  [TileType.PATH_STONE]: '#a88868',
  [TileType.BUILDING_FLOOR]: '#9a8a7a',
  [TileType.FENCE]: '#6B4423',
  [TileType.FLOWER_RED]: '#5a8c4a',
  [TileType.FLOWER_YELLOW]: '#5a8c4a',
  [TileType.FLOWER_BLUE]: '#5a8c4a',
  [TileType.FLOWER_WHITE]: '#5a8c4a',
  [TileType.WALL]: '#3a3a4a',
  [TileType.VOID]: '#1a1a2e',
};

const FLOWER_COLORS: Record<number, string> = {
  [TileType.FLOWER_RED]: '#ff6b6b',
  [TileType.FLOWER_YELLOW]: '#ffd93d',
  [TileType.FLOWER_BLUE]: '#6bcbff',
  [TileType.FLOWER_WHITE]: '#ffffff',
};

// ─── Activity labels for tooltip ──────────────────────────────────────────────
const ACTIVITY_LABELS: Record<string, string> = {
  idle: 'Relaxing',
  walk: 'Moving',
  type: 'Typing...',
  read: 'Reading...',
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WorldRenderer({ agents, resources, sessionStatus, gameTick }: WorldRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const animFrameRef = useRef(0);
  const lastTimeRef = useRef(0);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: DEFAULT_ZOOM });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0 });
  const staticWorldRef = useRef<HTMLCanvasElement | null>(null);
  const spritesReadyRef = useRef(false);
  const gameTimeRef = useRef(0);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const minimapDirtyRef = useRef(true);
  const mouseWorldRef = useRef({ x: 0, y: 0, screenX: 0, screenY: 0 });
  const hoveredAgentRef = useRef<string | null>(null);

  // React state for tooltip (updated at low frequency)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; role: string; activity: string; color: string } | null>(null);

  // ─── Initialize game state ─────────────────────────────────────────────────
  useEffect(() => {
    const gs = new GameState();
    gameRef.current = gs;

    // Center camera on the map
    cameraRef.current.x = (WORLD_W - 800) / 2;
    cameraRef.current.y = (WORLD_H - 600) / 2;
  }, []);

  // ─── Load sprites ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadAllSprites().then(() => {
      spritesReadyRef.current = true;
      buildStaticWorld();
    });
  }, []);

  // ─── Build static world (offscreen canvas) ─────────────────────────────────
  const buildStaticWorld = useCallback(() => {
    const gs = gameRef.current;
    if (!gs) return;

    const canvas = document.createElement('canvas');
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    const ctx = canvas.getContext('2d')!;

    // Batch-draw tiles by color (pixel-agents optimization)
    const batches = new Map<string, { x: number; y: number }[]>();

    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const t = gs.tiles[r][c];
        const color = TILE_COLORS[t] || '#5a8c4a';
        if (!batches.has(color)) batches.set(color, []);
        batches.get(color)!.push({ x: c * TILE_SIZE, y: r * TILE_SIZE });
      }
    }

    for (const [color, pts] of batches) {
      ctx.fillStyle = color;
      for (const p of pts) ctx.fillRect(p.x, p.y, TILE_SIZE, TILE_SIZE);
    }

    // Grass texture variation
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const t = gs.tiles[r][c];
        if ((t === TileType.GRASS || t === TileType.GRASS_LIGHT) && ((c * 7 + r * 13 + c * r) % 5) < 2) {
          ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const t = gs.tiles[r][c];
        if ((t === TileType.GRASS || t === TileType.GRASS_DARK) && ((c * 11 + r * 3 + c * r * 7) % 8) < 2) {
          ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Water shimmer base
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (gs.tiles[r][c] === TileType.WATER && ((c + r * 3) % 4) === 0) {
          ctx.fillRect(c * TILE_SIZE + 4, r * TILE_SIZE + 4, 6, 2);
        }
      }
    }

    // Water deep shading
    ctx.fillStyle = 'rgba(0,0,50,0.15)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (gs.tiles[r][c] === TileType.WATER_DEEP) {
          ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Flowers
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const fc = FLOWER_COLORS[gs.tiles[r][c]];
        if (fc) {
          const px = c * TILE_SIZE + TILE_SIZE / 2;
          const py = r * TILE_SIZE + TILE_SIZE / 2;
          ctx.fillStyle = '#2d5a27';
          ctx.fillRect(px - 0.5, py + 1, 1, 4);
          ctx.fillStyle = fc;
          ctx.beginPath();
          ctx.arc(px, py - 1, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffd93d';
          ctx.beginPath();
          ctx.arc(px, py - 1, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Fences
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (gs.tiles[r][c] === TileType.FENCE) {
          const px = c * TILE_SIZE;
          const py = r * TILE_SIZE;
          ctx.fillStyle = '#5a3a1a';
          ctx.fillRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
          ctx.fillStyle = '#9B7B4A';
          ctx.fillRect(px + 4, py + 3, TILE_SIZE - 8, 2);
          ctx.fillStyle = '#7B5B3A';
          ctx.fillRect(px, py + 7, TILE_SIZE, 3);
        }
      }
    }

    // Buildings
    for (const b of BUILDINGS) {
      const bx = b.x * TILE_SIZE;
      const by = b.y * TILE_SIZE;
      const bw = b.w * TILE_SIZE;
      const bh = b.h * TILE_SIZE;

      // Floor pattern
      ctx.fillStyle = b.color + '18';
      ctx.fillRect(bx, by, bw, bh);
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

      // Inner glow
      ctx.strokeStyle = b.color + '20';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);

      // Name
      ctx.fillStyle = b.color + 'CC';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(b.name.toUpperCase(), bx + bw / 2, by + bh - 6);

      // Emoji
      ctx.font = '16px sans-serif';
      ctx.fillText(b.emoji, bx + bw / 2, by + 18);

      // Desk
      ctx.fillStyle = b.color + '35';
      ctx.fillRect(bx + bw / 2 - 8, by + bh / 2, 16, 6);
      ctx.fillStyle = b.color + '25';
      ctx.fillRect(bx + bw / 2 - 10, by + bh / 2 + 6, 3, 5);
      ctx.fillRect(bx + bw / 2 + 7, by + bh / 2 + 6, 3, 5);
    }

    // Decorations
    for (const deco of gs.decorations) {
      const px = deco.x * TILE_SIZE + TILE_SIZE / 2;
      const py = deco.y * TILE_SIZE + TILE_SIZE / 2;

      if (deco.type === 'rock') {
        ctx.fillStyle = deco.variant < 2 ? '#7a7a7a' : '#8a8a8a';
        ctx.beginPath();
        ctx.ellipse(px, py + 1, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(px - 1, py - 1, 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (deco.type === 'bush') {
        ctx.fillStyle = '#2d6a22';
        ctx.beginPath();
        ctx.ellipse(px, py + 1, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3d8a32';
        ctx.beginPath();
        ctx.arc(px - 1, py - 1, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (deco.type === 'grass_tuft') {
        ctx.fillStyle = '#4a9a3e';
        for (let i = -2; i <= 2; i++) {
          ctx.fillRect(px + i * 2 - 0.5, py + 2, 1, 4 - Math.abs(i));
        }
      } else if (deco.type === 'stump') {
        ctx.fillStyle = '#6B4423';
        ctx.beginPath();
        ctx.ellipse(px, py + 2, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8B6B3A';
        ctx.beginPath();
        ctx.ellipse(px, py + 1, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    staticWorldRef.current = canvas;
    minimapDirtyRef.current = true;
  }, []);

  // Build static world once tiles are ready
  useEffect(() => {
    if (gameRef.current && !staticWorldRef.current) {
      const timer = setTimeout(buildStaticWorld, 50);
      return () => clearTimeout(timer);
    }
  }, [buildStaticWorld]);

  // ─── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ─── Mouse handlers ────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      dragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        camStartX: cameraRef.current.x,
        camStartY: cameraRef.current.y,
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

    // Track mouse position in world coords (for hover detection)
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const cssX = e.clientX - c.getBoundingClientRect().left;
    const cssY = e.clientY - c.getBoundingClientRect().top;
    const cam = cameraRef.current;
    const viewW = c.clientWidth;
    const viewH = c.clientHeight;
    const offsetX = (viewW - WORLD_W * cam.zoom) / 2;
    const offsetY = (viewH - WORLD_H * cam.zoom) / 2;
    mouseWorldRef.current = {
      x: (cssX - offsetX) / cam.zoom + cam.x,
      y: (cssY - offsetY) / cam.zoom + cam.y,
      screenX: e.clientX,
      screenY: e.clientY,
    };
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const cam = cameraRef.current;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    cam.zoom = Math.max(1.5, Math.min(6, cam.zoom * factor));
  }, []);

  // ─── Main Render Loop — runs ONCE, never restarts (pixel-agents pattern) ──
  useEffect(() => {
    let running = true;
    let tooltipCheckCounter = 0;

    const render = (timestamp: number) => {
      if (!running) return;

      // Delta time (capped at 100ms)
      const dt = lastTimeRef.current === 0 ? 0 : Math.min((timestamp - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = timestamp;
      gameTimeRef.current += dt;

      const canvas = canvasRef.current;
      if (!canvas) { animFrameRef.current = requestAnimationFrame(render); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { animFrameRef.current = requestAnimationFrame(render); return; }

      const w = canvas.width;
      const h = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      const cam = cameraRef.current;

      // Clamp camera
      const viewW = w / dpr / cam.zoom;
      const viewH = h / dpr / cam.zoom;
      cam.x = Math.max(0, Math.min(WORLD_W - viewW, cam.x));
      cam.y = Math.max(0, Math.min(WORLD_H - viewH, cam.y));
      cam.zoom = Math.max(1.5, Math.min(6, cam.zoom));

      // ── Clear ──
      ctx.clearRect(0, 0, w, h);

      // ── Background ──
      ctx.fillStyle = '#2a4a1a';
      ctx.fillRect(0, 0, w, h);

      // ── Save and set up camera transform ──
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = false;

      const offsetX = Math.floor((w / dpr - WORLD_W * cam.zoom) / 2);
      const offsetY = Math.floor((h / dpr - WORLD_H * cam.zoom) / 2);
      ctx.translate(offsetX, offsetY);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // ── Blit static world ──
      if (staticWorldRef.current) {
        ctx.drawImage(staticWorldRef.current, 0, 0);
      }

      const gt = gameTimeRef.current;

      // ── Animated water shimmer ──
      const gs = gameRef.current;
      if (gs) {
        const vl = Math.max(0, Math.floor(cam.x / TILE_SIZE) - 1);
        const vr = Math.min(MAP_COLS, Math.ceil((cam.x + viewW) / TILE_SIZE) + 1);
        const vt = Math.max(0, Math.floor(cam.y / TILE_SIZE) - 1);
        const vb = Math.min(MAP_ROWS, Math.ceil((cam.y + viewH) / TILE_SIZE) + 1);

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for (let r = vt; r < vb; r++) {
          for (let c = vl; c < vr; c++) {
            if (gs.tiles[r][c] === TileType.WATER || gs.tiles[r][c] === TileType.WATER_DEEP) {
              if (((gt * 2 + c * 3 + r * 7) % 3) < 1) {
                const sx = c * TILE_SIZE + 3;
                const sy = r * TILE_SIZE + 5 + Math.sin(gt * 2 + c * 0.5) * 1.5;
                ctx.fillRect(sx, sy, 7, 1.5);
              }
            }
          }
        }
      }

      // ── Draw Agents (z-sorted by Y, like pixel-agents renderScene) ──
      const agentList = Object.values(agents);
      const sorted = [...agentList].sort((a, b) => a.y - b.y);

      // Track which agent the mouse is hovering over
      let newHovered: string | null = null;

      for (const agent of sorted) {
        // Cull offscreen
        const ax = agent.x * TILE_SIZE;
        const ay = agent.y * TILE_SIZE;
        if (ax < cam.x - 80 || ax > cam.x + viewW + 80) continue;
        if (ay < cam.y - 80 || ay > cam.y + viewH + 80) continue;

        // ── Hit test for hover ──
        const mw = mouseWorldRef.current;
        const hitW = 12;
        const hitH = 18;
        if (mw.x >= ax - hitW && mw.x <= ax + TILE_SIZE + hitW &&
            mw.y >= ay - hitH && mw.y <= ay + TILE_SIZE) {
          newHovered = agent.agentId;
        }

        // ── Shadow ──
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(ax + TILE_SIZE / 2, ay + TILE_SIZE - 1, 6, 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // ── Spawn effect ──
        if (agent.spawnEffect > 0) {
          drawSpawnEffect(ctx, ax + TILE_SIZE / 2, ay + TILE_SIZE / 2, agent.spawnEffect, gt, agent.color);
        }

        // ── Active glow ──
        if (agent.state === 'type' || agent.state === 'read') {
          const glowR = 12 + Math.sin(gt * 3) * 2;
          ctx.fillStyle = agent.color + '12';
          ctx.beginPath();
          ctx.arc(ax + TILE_SIZE / 2, ay + TILE_SIZE / 2 - 4, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // ── Selection/hover outline ──
        if (hoveredAgentRef.current === agent.agentId) {
          ctx.strokeStyle = agent.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(ax - 1, ay - 4, TILE_SIZE + 2, TILE_SIZE + 4);
          ctx.setLineDash([]);
        }

        // ── Draw character sprite ──
        const drawn = drawCharacter(ctx, agent, gt);
        if (!drawn) {
          drawFallbackCharacter(ctx, agent, gt);
        }

        // ── Name tag ──
        drawNameTag(ctx, agent, ax, ay, gt);

        // ── Speech bubble ──
        if (agent.speechBubble) {
          drawSpeechBubble(ctx, agent, ax, ay, gt);
        }

        // ── Emote ──
        if (agent.emoteTimer > 0 && agent.emote) {
          const float = Math.sin(gt * 3) * 2;
          const alpha = Math.min(1, agent.emoteTimer / 1);
          ctx.globalAlpha = alpha;
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(agent.emote, ax + TILE_SIZE / 2, ay - 20 + float);
          ctx.globalAlpha = 1;
        }
      }

      hoveredAgentRef.current = newHovered;

      // ── Day/Night cycle overlay ──
      const dayNight = getDayNightOverlay(gt);
      if (dayNight.opacity > 0) {
        ctx.fillStyle = dayNight.color;
        ctx.globalAlpha = dayNight.opacity;
        ctx.fillRect(cam.x - 10, cam.y - 10, viewW + 20, viewH + 20);
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // ── Minimap (cached, updates when dirty) ──
      if (gs && minimapDirtyRef.current) {
        minimapRef.current = buildMinimap(gs, agentList, cam, w / dpr, h / dpr);
        minimapDirtyRef.current = false;
      }
      if (minimapRef.current) {
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.drawImage(minimapRef.current, 8, h / dpr - minimapRef.current.height - 8);
        ctx.restore();
      }

      // ── Vignette ──
      ctx.save();
      ctx.scale(dpr, dpr);
      const grad = ctx.createRadialGradient(w / dpr / 2, h / dpr / 2, w / dpr * 0.3, w / dpr / 2, h / dpr / 2, w / dpr * 0.7);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w / dpr, h / dpr);
      ctx.restore();

      // ── Tooltip (update at low frequency via React state) ──
      tooltipCheckCounter++;
      if (tooltipCheckCounter % 10 === 0) {
        if (newHovered) {
          const a = agents[newHovered];
          if (a) {
            setTooltip({
              x: a.x,
              y: a.y,
              name: a.name,
              role: ACTIVITY_LABELS[a.state] || a.state,
              activity: a.speechBubble ? a.speechBubble.slice(0, 60) + (a.speechBubble.length > 60 ? '...' : '') : '',
              color: a.color,
            });
          } else {
            setTooltip(null);
          }
        } else {
          setTooltip(prev => prev ? null : prev); // Only clear if there was one
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, []); // ← EMPTY deps! Loop runs once, reads from refs/props

  return (
    <div className="relative w-full h-full">
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
      {/* ── Hover Tooltip ── */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-30"
          style={{
            left: '50%',
            bottom: 12,
            transform: 'translateX(-50%)',
          }}
        >
          <div
            className="px-3 py-1.5 rounded-lg border backdrop-blur-md"
            style={{
              backgroundColor: 'rgba(0,0,0,0.85)',
              borderColor: tooltip.color + '60',
            }}
          >
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tooltip.color }} />
              <span className="text-[10px] font-bold" style={{ color: tooltip.color }}>{tooltip.name}</span>
              <span className="text-[9px] text-white/40">·</span>
              <span className="text-[9px] text-white/60">{tooltip.role}</span>
            </div>
            {tooltip.activity && (
              <p className="text-[8px] text-white/40 mt-0.5 max-w-48 truncate">&quot;{tooltip.activity}&quot;</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Character Drawing ────────────────────────────────────────────────────────
function drawCharacter(
  ctx: CanvasRenderingContext2D,
  agent: AgentEntity,
  gt: number,
): boolean {
  if (!isReady()) return false;

  // Use game-time-based animation frame for walk cycle (4 frames)
  let animFrame = agent.animFrame;
  if (agent.state === 'walk' || agent.isMoving) {
    // Smooth walk cycle: 4 frames at ~6fps
    animFrame = Math.floor(gt * 6) % 4;
  } else if (agent.state === 'type') {
    animFrame = Math.floor(gt * 3) % 2;
  } else if (agent.state === 'read') {
    animFrame = 0;
  }

  const img = getSpriteForAgent(
    agent.charType,
    agent.spriteSet,
    agent.state === 'idle' ? 'idle' : agent.state,
    agent.direction,
    animFrame,
  );

  if (!img || !img.complete || img.naturalWidth === 0) return false;

  const dims = getSpriteDimensions(agent.spriteSet);
  const ax = agent.x * TILE_SIZE;
  const ay = agent.y * TILE_SIZE;

  ctx.imageSmoothingEnabled = false;

  // Center sprite horizontally, anchor at feet
  const drawX = ax + (TILE_SIZE - dims.w) / 2;
  const drawY = ay + TILE_SIZE - dims.h;

  ctx.drawImage(img, drawX, drawY, dims.w, dims.h);

  // Spawn effect alpha
  if (agent.spawnEffect > 0) {
    ctx.globalAlpha = 1 - agent.spawnEffect;
    ctx.drawImage(img, drawX, drawY, dims.w, dims.h);
    ctx.globalAlpha = agent.spawnEffect;
    ctx.fillStyle = `rgba(100, 255, 100, ${agent.spawnEffect * 0.3})`;
    ctx.fillRect(drawX, drawY, dims.w, dims.h);
    ctx.globalAlpha = 1;
  }

  return true;
}

// ─── Fallback Character ───────────────────────────────────────────────────────
function drawFallbackCharacter(
  ctx: CanvasRenderingContext2D,
  agent: AgentEntity,
  gt: number,
): void {
  const ax = agent.x * TILE_SIZE;
  const ay = agent.y * TILE_SIZE;
  const cx = ax + TILE_SIZE / 2;
  const cy = ay + TILE_SIZE / 2;

  // Body
  ctx.fillStyle = agent.color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#F5D6C6';
  ctx.beginPath();
  ctx.arc(cx, cy - 7, 4, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#333';
  const blink = Math.sin(gt * 4) > 0.95;
  if (!blink) {
    ctx.fillRect(cx - 2, cy - 8, 1.5, 1.5);
    ctx.fillRect(cx + 0.5, cy - 8, 1.5, 1.5);
  } else {
    ctx.fillRect(cx - 2, cy - 7, 1.5, 0.8);
    ctx.fillRect(cx + 0.5, cy - 7, 1.5, 0.8);
  }

  // Walk bob
  if (agent.state === 'idle') {
    const bob = Math.sin(gt * 2) * 0.5;
    ctx.fillStyle = agent.color + '40';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8 + bob, 4, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Name Tag ─────────────────────────────────────────────────────────────────
function drawNameTag(
  ctx: CanvasRenderingContext2D,
  agent: AgentEntity,
  ax: number,
  ay: number,
  gt: number,
): void {
  const name = agent.name;
  ctx.font = 'bold 6px monospace';
  ctx.textAlign = 'center';
  const nw = ctx.measureText(name).width + 6;
  const nx = ax + TILE_SIZE / 2;
  const ny = ay - 22;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.roundRect(nx - nw / 2, ny - 5, nw, 9, 2);
  ctx.fill();

  // Text
  ctx.fillStyle = agent.color;
  ctx.fillText(name, nx, ny + 2);

  // Activity indicator (pulsing dot)
  if (agent.state === 'type' || agent.state === 'read') {
    const pulse = 1 + Math.sin(gt * 5) * 0.2;
    ctx.fillStyle = agent.state === 'type' ? '#F59E0B' : '#8B5CF6';
    ctx.beginPath();
    ctx.arc(nx + nw / 2 + 1, ny, 2 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Speech Bubble (improved) ────────────────────────────────────────────────
function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  agent: AgentEntity,
  ax: number,
  ay: number,
  gt: number,
): void {
  const text = agent.speechBubble.length > 100
    ? agent.speechBubble.slice(0, 97) + '...'
    : agent.speechBubble;

  ctx.font = '6px monospace';
  const maxW = 100;
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
  if (lines.length > 4) lines.length = 4;

  let maxLineW = 0;
  for (const l of lines) maxLineW = Math.max(maxLineW, ctx.measureText(l).width);

  const bubbleW = maxLineW + 10;
  const bubbleH = lines.length * 8 + 8;
  const bubbleX = ax + TILE_SIZE / 2 - bubbleW / 2;
  const bubbleY = ay - 40 - bubbleH;

  // Fade in effect
  const fadeAlpha = Math.min(1, agent.speechTimer / 0.3);

  // Background with agent color tint
  ctx.globalAlpha = fadeAlpha;
  ctx.fillStyle = 'rgba(10, 10, 30, 0.9)';
  ctx.beginPath();
  ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 4);
  ctx.fill();

  // Accent border (top line in agent's color)
  ctx.strokeStyle = agent.color + '70';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bubbleX + 4, bubbleY);
  ctx.lineTo(bubbleX + bubbleW - 4, bubbleY);
  ctx.stroke();

  // Tail pointing to agent head
  const tailX = ax + TILE_SIZE / 2;
  const tailY = bubbleY + bubbleH;
  ctx.fillStyle = 'rgba(10, 10, 30, 0.9)';
  ctx.beginPath();
  ctx.moveTo(tailX - 3, tailY);
  ctx.lineTo(tailX, tailY + 5);
  ctx.lineTo(tailX + 3, tailY);
  ctx.fill();

  // Text
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'left';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bubbleX + 5, bubbleY + 8 + i * 8);
  }

  // Typing cursor for active agents
  if ((agent.state === 'type' || agent.state === 'read') && Math.sin(gt * 6) > 0) {
    const lastW = ctx.measureText(lines[lines.length - 1]).width;
    ctx.fillStyle = agent.color;
    ctx.fillRect(bubbleX + 5 + lastW, bubbleY + 2 + (lines.length - 1) * 8, 3, 5);
  }

  ctx.globalAlpha = 1;
}

// ─── Spawn Effect (matrix-style) ──────────────────────────────────────────────
function drawSpawnEffect(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  progress: number,
  gt: number,
  color: string,
): void {
  const p = 1 - progress;
  const alpha = Math.floor(progress * 200).toString(16).padStart(2, '0');
  ctx.strokeStyle = color + alpha;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, p * 25, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + gt * 3;
    const dist = p * 18 + Math.sin(gt * 5 + i) * 3;
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    ctx.fillStyle = color + alpha;
    ctx.beginPath();
    ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = `rgba(100, 255, 100, ${progress * 0.2})`;
  ctx.beginPath();
  ctx.arc(cx, cy, 12 * progress, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Minimap (built once, cached) ─────────────────────────────────────────────
function buildMinimap(
  gs: GameState,
  agents: AgentEntity[],
  cam: Camera,
  canvasW: number,
  canvasH: number,
): HTMLCanvasElement {
  const scale = 2;
  const mmW = MAP_COLS * scale;
  const mmH = MAP_ROWS * scale;
  const pad = 8;

  const canvas = document.createElement('canvas');
  canvas.width = mmW + pad * 2;
  canvas.height = mmH + pad * 2;
  const ctx = canvas.getContext('2d')!;
  const ox = pad;
  const oy = pad;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 4);
  ctx.fill();

  // Day/night phase label
  const dn = getDayNightOverlay(0);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(dn.phase, ox, oy - 5);

  // Tiles (batched)
  const batches = new Map<string, { x: number; y: number }[]>();
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const color = TILE_COLORS[gs.tiles[r][c]] || '#5a8c4a';
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
  }

  // Agents
  for (const a of agents) {
    ctx.fillStyle = a.color;
    ctx.fillRect(ox + a.x * scale - 1, oy + a.y * scale - 1, 3, 3);
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
