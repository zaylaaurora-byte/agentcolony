'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Square, RotateCcw, Wifi, WifiOff, Sparkles,
  Send, MessageCircle, X,
} from 'lucide-react';
import { useChatStore } from '@/lib/chat-store';
import { AGENT_CONFIG, type AgentId, type AgentMessage, type Task } from '@/lib/agent-config';
import WorldRenderer, { type AgentEntity } from '@/components/simulation/WorldRenderer';
import ResourceBar from '@/components/simulation/ResourceBar';
import {
  TILE_SIZE, MAP_COLS, MAP_ROWS,
  createAgent,
  STATION_POSITIONS,
  type CharSkin, type Direction, type AgentState,
} from '@/lib/game-engine';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────
type SessionStatus = 'idle' | 'running' | 'paused' | 'complete' | 'error';

// ─── Convert game agent to entity for renderer ─────────────────────────────
function agentToEntity(id: string, agent: {
  name: string;
  skin: CharSkin;
  spriteSet: 'pixel-agents' | 'sprout-lands';
  color: string;
  tileX: number;
  tileY: number;
  state: AgentState;
  direction: Direction;
  animFrame: number;
  isMoving: boolean;
  speechBubble: string;
  speechTimer: number;
  emote: string;
  emoteTimer: number;
  spawnTimer: number;
  energy: number;
}): AgentEntity {
  return {
    agentId: id,
    name: agent.name,
    charType: agent.skin,
    spriteSet: agent.spriteSet,
    color: agent.color,
    x: agent.tileX,
    y: agent.tileY,
    state: agent.state,
    direction: agent.direction,
    animFrame: agent.animFrame,
    isMoving: agent.isMoving,
    speechBubble: agent.speechBubble,
    speechTimer: agent.speechTimer,
    emote: agent.emote,
    emoteTimer: agent.emoteTimer,
    spawnEffect: agent.spawnTimer > 0 ? agent.spawnTimer / 0.4 : 0,
    energy: agent.energy,
  };
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function Home() {
  const store = useChatStore();
  const { messages, streamingContent, tasks, sessionStatus, selectedAgents, connected } = store;
  const socketRef = useRef<Socket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState('');
  const [goal, setGoal] = useState('');
  const [showChat, setShowChat] = useState(false);

  // Resources
  const [resources, setResources] = useState({
    money: 1000, population: 1, totalEnergy: 100,
    tasksCompleted: 0, tasksFailed: 0, iteration: 0,
    maxIterations: 20, qualityScore: 0, qualityThreshold: 8,
  });

  // Game state in refs (no re-renders from game loop!)
  const gameAgentsRef = useRef<Map<string, any>>(new Map());
  const [agentEntities, setAgentEntities] = useState<Record<string, AgentEntity>>({});
  const gameTickRef = useRef(0);
  const [gameTick, setGameTick] = useState(0);

  // ─── Game Update Loop (runs at ~20fps, updates agent behaviors) ──────────
  useEffect(() => {
    const TICK_MS = 50;
    let lastTime = performance.now();

    const interval = setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      gameTickRef.current++;
      const tick = gameTickRef.current;
      let changed = false;

      const agents = gameAgentsRef.current;
      if (agents.size === 0) {
        if (tick % 6 === 0) setGameTick(tick);
        return;
      }

      const newEntities: Record<string, AgentEntity> = {};

      for (const [id, agent] of agents) {
        // ── Movement ──
        if (agent.path.length > 0 && agent.pathIndex < agent.path.length) {
          const speed = 3; // tiles per second
          agent.moveProgress += speed * dt;

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

            // Direction
            const dx = next.x - prev.x;
            const dy = next.y - prev.y;
            agent.direction = Math.abs(dx) > Math.abs(dy)
              ? (dx > 0 ? 'right' : 'left')
              : (dy > 0 ? 'down' : 'up');

            // Walk animation
            agent.animTimer += dt;
            if (agent.animTimer >= 0.15) {
              agent.animTimer -= 0.15;
              agent.animFrame = (agent.animFrame + 1) % 4;
            }
            agent.isMoving = true;
            changed = true;
          }

          // Check arrival
          if (agent.pathIndex >= agent.path.length - 1 && agent.moveProgress >= 1) {
            const dest = agent.path[agent.path.length - 1];
            agent.tileX = dest.x;
            agent.tileY = dest.y;
            agent.path = [];
            agent.pathIndex = 0;
            agent.moveProgress = 0;
            agent.isMoving = false;

            if (agent.isActive) {
              agent.state = 'type';
              agent.animTimer = 0;
            } else {
              agent.state = 'idle';
              agent.wanderTimer = 2 + Math.random() * 6;
              agent.idleTimer = 0;
            }
            changed = true;
          }
        } else {
          agent.isMoving = false;
        }

        // ── Type/Read animation ──
        if (agent.state === 'type' || agent.state === 'read') {
          agent.animTimer += dt;
          if (agent.animTimer >= 0.3) {
            agent.animTimer -= 0.3;
            agent.animFrame = agent.animFrame === 0 ? 1 : 0;
          }
          if (!agent.isActive) {
            agent.idleTimer += dt;
            if (agent.idleTimer > 1) {
              agent.state = 'idle';
              agent.idleTimer = 0;
              agent.wanderTimer = 2 + Math.random() * 6;
            }
          }
          changed = true;
        }

        // ── Idle behavior ──
        if (agent.state === 'idle') {
          agent.idleTimer += dt;

          // Random emote
          agent.emoteInterval -= dt;
          if (agent.emoteInterval <= 0) {
            const emotes = ['💭', '💤', '🎵', '👀', '✨', '🤔', '😄', '😎'];
            agent.emote = emotes[Math.floor(Math.random() * emotes.length)];
            agent.emoteTimer = 2 + Math.random() * 3;
            agent.emoteInterval = 4 + Math.random() * 8;
            changed = true;
          }

          // Wander
          agent.wanderTimer -= dt;
          if (agent.wanderTimer <= 0) {
            const range = 6;
            const tx = Math.max(2, Math.min(MAP_COLS - 3, Math.round(agent.tileX + (Math.random() - 0.5) * range * 2)));
            const ty = Math.max(2, Math.min(MAP_ROWS - 3, Math.round(agent.tileY + (Math.random() - 0.5) * range * 2)));
            agent.targetTileX = tx;
            agent.targetTileY = ty;
            agent.state = 'walk';
            agent.animTimer = 0;
            agent.animFrame = 0;
            // Simple path: just go to target
            agent.path = [{ x: tx, y: ty }];
            agent.pathIndex = 0;
            agent.moveProgress = 0;
            agent.wanderTimer = 3 + Math.random() * 10;
            changed = true;
          }

          // Reactivate
          if (agent.isActive) {
            agent.state = 'walk';
            changed = true;
          }
        }

        // ── Timers ──
        if (agent.spawnTimer > 0) {
          agent.spawnTimer = Math.max(0, agent.spawnTimer - dt);
          changed = true;
        }
        if (agent.speechTimer > 0) {
          agent.speechTimer -= dt;
          if (agent.speechTimer <= 0) agent.speechBubble = '';
          changed = true;
        }
        if (agent.emoteTimer > 0) {
          agent.emoteTimer -= dt;
          if (agent.emoteTimer <= 0) agent.emote = '';
          changed = true;
        }

        newEntities[id] = agentToEntity(id, agent);
      }

      // Throttle React updates
      if (changed) {
        if (tick % 2 === 0) {
          setGameTick(tick);
          if (tick % 4 === 0) {
            setAgentEntities(newEntities);
          }
        }
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, []);

  // ─── Socket Connection ──────────────────────────────────────────────────
  useEffect(() => {
    const socket = io('/?XTransformPort=3004', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => store.setConnected(true));
    socket.on('disconnect', () => store.setConnected(false));

    socket.on('session-init', (data: any) => {
      const posMap: Record<string, { x: number; y: number }> = {
        mastermind: { x: 4, y: 6 },
        worker: { x: 35, y: 6 },
        reviewer: { x: 4, y: 28 },
        creative: { x: 35, y: 28 },
        hacker: { x: 20, y: 10 },
        analyst: { x: 20, y: 20 },
      };

      const charTypeMap: Record<string, CharSkin> = {
        mastermind: 'mastermind', worker: 'worker', reviewer: 'reviewer',
        creative: 'creative', hacker: 'hacker', analyst: 'analyst',
      };

      gameAgentsRef.current = new Map();
      const entities: Record<string, AgentEntity> = {};

      for (const agentId of (data.agents || ['mastermind', 'worker'])) {
        const pos = posMap[agentId] || { x: 20, y: 15 };
        const config = AGENT_CONFIG[agentId as AgentId];
        const skin = charTypeMap[agentId] || 'worker';

        const agent = createAgent(agentId, config?.name ?? agentId, skin, config?.color ?? '#888', pos.x, pos.y);

        gameAgentsRef.current.set(agentId, agent);
        entities[agentId] = agentToEntity(agentId, agent);
      }

      setAgentEntities(entities);
      setResources(prev => ({
        ...prev,
        population: Object.keys(entities).length,
        maxIterations: data.config?.maxIterations || 20,
        qualityThreshold: data.config?.qualityThreshold || 8,
      }));
    });

    socket.on('agent-message', (msg: AgentMessage) => {
      store.addMessage(msg);
      store.clearStream(msg.agentId);

      const agent = gameAgentsRef.current.get(msg.agentId);
      if (agent) {
        agent.speechBubble = msg.content.slice(0, 150);
        agent.speechTimer = 5;
        agent.state = 'type';
        agent.animTimer = 0;
        agent.isActive = false; // Will go idle after grace period

        if (msg.role === 'executor') {
          setResources(prev => ({
            ...prev,
            money: prev.money - 10,
            tasksCompleted: prev.tasksCompleted + 1,
            totalEnergy: Math.max(0, prev.totalEnergy - 5),
          }));
        }
      }
    });

    socket.on('agent-stream', ({ agentId, chunk }: { agentId: string; chunk: string }) => {
      store.appendStream(agentId, chunk);

      const agent = gameAgentsRef.current.get(agentId);
      if (agent) {
        const existing = agent.speechBubble || '';
        agent.speechBubble = existing.length > 100 ? chunk : existing + chunk;
        agent.speechTimer = 5;
        agent.state = 'type';
        agent.isActive = true;
        agent.animTimer = 0;
      }
    });

    socket.on('agent-move', ({ agentId, targetX, targetY, station }: any) => {
      const agent = gameAgentsRef.current.get(agentId);
      if (!agent) return;

      let tx = targetX, ty = targetY;
      if (station && STATION_POSITIONS[station]) {
        tx = STATION_POSITIONS[station].x;
        ty = STATION_POSITIONS[station].y;
      }

      agent.targetTileX = tx;
      agent.targetTileY = ty;
      agent.path = [{ x: tx, y: ty }];
      agent.pathIndex = 0;
      agent.moveProgress = 0;
      agent.state = 'walk';
      agent.animTimer = 0;
      agent.animFrame = 0;
      agent.isActive = true; // Mark as active so it stays at destination
    });

    socket.on('agent-summoned', ({ agentId, name }: any) => {
      const config = AGENT_CONFIG[agentId as AgentId];
      const skins: CharSkin[] = ['worker', 'reviewer', 'creative', 'hacker', 'analyst'];
      const skin = skins[gameAgentsRef.current.size % skins.length];

      const spawnPos = { x: 15 + Math.random() * 10, y: 12 + Math.random() * 6 };
      const agent = createAgent(
        agentId,
        config?.name ?? name ?? agentId,
        skin,
        config?.color ?? '#888',
        Math.round(spawnPos.x),
        Math.round(spawnPos.y),
      );

      agent.speechBubble = '✨ Summoned!';
      agent.speechTimer = 3;
      agent.emote = '🤩';
      agent.emoteTimer = 3;

      gameAgentsRef.current.set(agentId, agent);
      setAgentEntities(prev => ({
        ...prev,
        [agentId]: agentToEntity(agentId, agent),
      }));

      setResources(prev => ({
        ...prev,
        population: prev.population + 1,
        money: prev.money - 100,
      }));
    });

    socket.on('task-update', (task: Task) => {
      store.updateTask(task);
      if (task.status === 'done') {
        setResources(prev => ({ ...prev, money: prev.money + 50 }));
      }
      if (task.status === 'failed') {
        setResources(prev => ({
          ...prev,
          tasksFailed: prev.tasksFailed + 1,
          money: prev.money - 25,
        }));
      }
    });

    socket.on('session-status', ({ status }: { status: string }) => {
      store.setSessionStatus(status as SessionStatus);
      if (status === 'complete' || status === 'error') {
        for (const [id, agent] of gameAgentsRef.current) {
          agent.isActive = false;
          agent.state = 'idle';
        }
      }
    });

    socket.on('iteration-update', (data: any) => {
      setResources(prev => ({
        ...prev,
        iteration: data.iteration,
        qualityScore: data.qualityScore,
        totalEnergy: Math.max(0, 100 - (data.iteration || 0) * 3),
      }));
    });

    return () => { socket.disconnect(); };
  }, [store]);

  // ─── Auto-scroll chat ──────────────────────────────────────────────────
  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, streamingContent]);

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (!socketRef.current || !goal.trim()) return;
    store.clearSession();
    gameAgentsRef.current = new Map();
    setAgentEntities({});
    setResources({
      money: 1000, population: 1, totalEnergy: 100,
      tasksCompleted: 0, tasksFailed: 0, iteration: 0,
      maxIterations: 20, qualityScore: 0, qualityThreshold: 8,
    });
    socketRef.current.emit('start-session', { goal: goal.trim(), agents: selectedAgents });
  }, [goal, selectedAgents, store]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !socketRef.current) return;
    if (sessionStatus === 'idle') {
      setGoal(trimmed);
      store.clearSession();
      gameAgentsRef.current = new Map();
      setAgentEntities({});
      setResources({
        money: 1000, population: 1, totalEnergy: 100,
        tasksCompleted: 0, tasksFailed: 0, iteration: 0,
        maxIterations: 20, qualityScore: 0, qualityThreshold: 8,
      });
      socketRef.current.emit('start-session', { goal: trimmed, agents: selectedAgents });
    } else {
      socketRef.current.emit('user-message', { message: trimmed });
    }
    setInput('');
  }, [input, sessionStatus, selectedAgents, store]);

  const handlePause = () => socketRef.current?.emit('pause-session');
  const handleResume = () => socketRef.current?.emit('resume-session');
  const handleStop = () => socketRef.current?.emit('stop-session');
  const handleReset = () => {
    store.clearSession();
    setGoal('');
    gameAgentsRef.current = new Map();
    setAgentEntities({});
    setResources({
      money: 1000, population: 1, totalEnergy: 100,
      tasksCompleted: 0, tasksFailed: 0, iteration: 0,
      maxIterations: 20, qualityScore: 0, qualityThreshold: 8,
    });
  };

  const isRunning = sessionStatus === 'running';
  const isPaused = sessionStatus === 'paused';
  const isIdle = sessionStatus === 'idle';
  const isDone = sessionStatus === 'complete' || sessionStatus === 'error';
  const streamingAgents = Object.keys(streamingContent);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a2e] overflow-hidden select-none">
      {/* ── Resource Bar ── */}
      <ResourceBar resources={resources} />

      {/* ── Status indicator ── */}
      <div className="absolute top-9 right-2 z-20 pointer-events-none">
        <div className="flex items-center gap-1.5">
          {isRunning && (
            <motion.span
              className="text-[9px] text-red-400 font-mono bg-red-500/10 px-1.5 py-0.5 rounded"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >● LIVE</motion.span>
          )}
          {isPaused && (
            <span className="text-[9px] text-yellow-400 font-mono bg-yellow-500/10 px-1.5 py-0.5 rounded">⏸ PAUSED</span>
          )}
          <div className={cn(
            'flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded-full',
            connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
          )}>
            {connected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
          </div>
        </div>
      </div>

      {/* ── Main World ── */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative">
          <WorldRenderer
            agents={agentEntities}
            resources={resources}
            sessionStatus={sessionStatus}
            gameTick={gameTick}
          />

          {/* ── Idle Overlay ── */}
          {isIdle && Object.keys(agentEntities).length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <motion.div className="flex gap-6 mb-6" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                {(selectedAgents as AgentId[]).map((id, i) => (
                  <motion.div
                    key={id}
                    className="flex flex-col items-center"
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.15 }}
                  >
                    <div
                      className="w-14 h-14 rounded-full border-2 flex items-center justify-center text-xl"
                      style={{
                        borderColor: AGENT_CONFIG[id].color,
                        backgroundColor: AGENT_CONFIG[id].color + '20',
                      }}
                    >
                      {id === 'mastermind' ? '🧙' : id === 'worker' ? '👷' : id === 'reviewer' ? '🔬' : '🎨'}
                    </div>
                    <span className="text-[9px] font-bold mt-1" style={{ color: AGENT_CONFIG[id].color }}>
                      {AGENT_CONFIG[id].name}
                    </span>
                    <span className="text-[7px] text-white/25">{AGENT_CONFIG[id].description}</span>
                  </motion.div>
                ))}
              </motion.div>

              <motion.h2 initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}
                className="text-xl font-bold text-white/80 mb-1">🌍 Agent Colony</motion.h2>
              <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}
                className="text-xs text-white/30 mb-5 text-center max-w-sm">
                Your AI agents live in this world. Give them a task and watch them plan, build, and iterate.
              </motion.p>

              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }}
                className="flex flex-wrap justify-center gap-1.5 max-w-md px-4">
                {['Plan a coffee shop strategy', 'Write a sci-fi short story', 'Design a fitness app', 'Create a startup pitch'].map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setGoal(ex)}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 bg-black/30 text-white/40 hover:bg-white/10 hover:text-white/70 transition-all pointer-events-auto"
                  >{ex}</button>
                ))}
              </motion.div>
            </div>
          )}

          {/* ── Complete Banner ── */}
          {isDone && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-30">
              <div className="bg-emerald-500/20 border border-emerald-500/30 backdrop-blur-md rounded-xl px-4 py-2 text-center">
                <p className="text-xs font-bold text-emerald-300">
                  {resources.qualityScore >= resources.qualityThreshold ? '✨ Quality Threshold Reached!' : '✅ Session Complete'}
                </p>
                <p className="text-[10px] text-emerald-300/50">
                  {resources.iteration} iterations • Quality: {resources.qualityScore || 'N/A'}/10
                  • Earned: {(resources.tasksCompleted * 50).toLocaleString()} coins
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Task Board ── */}
          {!isIdle && tasks.length > 0 && (
            <motion.div initial={{ x: 200, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
              className="absolute top-10 right-2 w-52 z-20">
              <div className="bg-black/60 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-white/5 flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-white/50">📋 TASKS</span>
                  <span className="ml-auto text-[9px] text-white/25">
                    {tasks.filter(t => t.status === 'done').length}/{tasks.length}
                  </span>
                </div>
                <ScrollArea className="max-h-36">
                  <div className="p-1.5 space-y-1">
                    {tasks.map((task) => (
                      <div key={task.taskId} className={cn(
                        'flex items-start gap-1 p-1.5 rounded-lg text-[9px]',
                        task.status === 'in_progress' ? 'bg-blue-500/10' :
                        task.status === 'done' ? 'bg-emerald-500/10' :
                        task.status === 'failed' ? 'bg-red-500/10' : 'bg-white/[0.03]',
                      )}>
                        <span>{task.status === 'in_progress' ? '⏳' : task.status === 'done' ? '✅' : task.status === 'failed' ? '❌' : '⬜'}</span>
                        <p className="text-white/50 leading-relaxed line-clamp-2 flex-1">{task.description}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          )}

          {/* ── Agent Selector (idle) ── */}
          {isIdle && (
            <motion.div initial={{ x: -200, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.8 }}
              className="absolute top-10 left-2 z-20">
              <div className="bg-black/60 backdrop-blur-md rounded-xl border border-white/10 p-2.5 space-y-1.5 w-44">
                <span className="text-[9px] font-semibold text-white/30 px-0.5">🧑‍🤝‍🧑 TEAM</span>
                {(Object.keys(AGENT_CONFIG) as AgentId[]).map((id) => {
                  const isSel = selectedAgents.includes(id);
                  return (
                    <button key={id} onClick={() => store.toggleAgent(id)} className={cn(
                      'flex items-center gap-2 w-full p-1.5 rounded-lg transition-all text-left',
                      isSel ? 'bg-white/10' : 'opacity-40 hover:opacity-60',
                    )}>
                      <div className="w-7 h-7 rounded-full border flex items-center justify-center text-sm"
                        style={{ borderColor: AGENT_CONFIG[id].color, backgroundColor: AGENT_CONFIG[id].color + (isSel ? '30' : '10') }}>
                        {id === 'mastermind' ? '🧙' : id === 'worker' ? '👷' : id === 'reviewer' ? '🔬' : '🎨'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold truncate" style={{ color: isSel ? AGENT_CONFIG[id].color : 'rgba(255,255,255,0.3)' }}>
                          {AGENT_CONFIG[id].name}
                        </p>
                        <p className="text-[7px] text-white/20 truncate">{AGENT_CONFIG[id].description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Bottom Controls ── */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-3">
            <div className="flex items-center gap-1.5">
              {isIdle && (
                <div className="flex-1 flex gap-1.5">
                  <Input
                    value={goal}
                    onChange={e => setGoal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleStart()}
                    placeholder="Give your colony a task..."
                    className="h-10 rounded-lg bg-black/60 border-white/10 text-xs text-white placeholder:text-white/25 backdrop-blur-md"
                  />
                  <Button onClick={handleStart} disabled={!goal.trim()}
                    className="h-10 rounded-lg px-5 text-xs font-medium"
                    style={{ background: 'linear-gradient(135deg, #8B5CF6, #EC4899)' }}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Launch
                  </Button>
                </div>
              )}
              {(isRunning || isPaused) && (
                <div className="flex gap-1.5 w-full">
                  <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="Send a message to the colony..."
                    disabled={isPaused}
                    className="flex-1 h-10 rounded-lg bg-black/60 border-white/10 text-xs text-white placeholder:text-white/25 backdrop-blur-md disabled:opacity-50"
                  />
                  <Button onClick={handleSend} disabled={!input.trim()} size="icon"
                    className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/15 text-white">
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                  {isRunning && (
                    <Button onClick={handlePause} variant="outline" size="icon"
                      className="h-10 w-10 rounded-lg border-white/10 bg-white/5 text-white">
                      <Pause className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isPaused && (
                    <Button onClick={handleResume} size="icon"
                      className="h-10 w-10 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button onClick={handleStop} size="icon"
                    className="h-10 w-10 rounded-lg bg-red-500/20 text-red-400 border border-red-500/20">
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {isDone && (
                <Button onClick={handleReset} variant="outline"
                  className="w-full h-10 rounded-lg border-white/10 bg-black/60 text-white backdrop-blur-md">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> New Task
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── Chat Panel ── */}
        <AnimatePresence>
          {showChat && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="shrink-0 border-l border-white/10 bg-[#0d0d1a]/95 backdrop-blur-md overflow-hidden"
            >
              <div className="w-[320px] h-full flex flex-col">
                <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white/50">📜 Colony Log</h3>
                  <button onClick={() => setShowChat(false)} className="text-white/30 hover:text-white/60">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-2 space-y-2">
                  {messages.length === 0 && !streamingAgents.length && (
                    <p className="text-[10px] text-white/15 text-center py-8">No messages yet. Start a session to see agent communications.</p>
                  )}
                  {messages.map((msg, idx) => {
                    const cfg = AGENT_CONFIG[msg.agentId as AgentId];
                    const isUser = msg.agentId === 'user';
                    return (
                      <div key={`${msg.agentId}-${idx}`} className="p-2 rounded-lg bg-white/[0.03]">
                        <div className="flex items-center gap-1 mb-0.5">
                          {!isUser && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cfg?.color }} />}
                          <span className="text-[9px] font-semibold" style={{ color: isUser ? '#fff' : cfg?.color }}>{msg.agentName}</span>
                          <span className="text-[7px] text-white/15 ml-auto">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[10px] text-white/50 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    );
                  })}
                  {streamingAgents.map((aid) => {
                    const cfg = AGENT_CONFIG[aid as AgentId];
                    if (!streamingContent[aid]) return null;
                    return (
                      <div key={`s-${aid}`} className="p-2 rounded-lg bg-white/[0.03]">
                        <div className="flex items-center gap-1 mb-0.5">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cfg?.color }} />
                          <span className="text-[9px] font-semibold" style={{ color: cfg?.color }}>{cfg?.name}</span>
                          <motion.span className="text-[8px] text-purple-400" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }}>
                            working...
                          </motion.span>
                        </div>
                        <p className="text-[10px] text-white/50 leading-relaxed whitespace-pre-wrap">
                          {streamingContent[aid]}
                          <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>▊</motion.span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ── Floating Chat Button ── */}
      <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1.5">
        <button onClick={() => setShowChat(!showChat)} className={cn(
          'p-2 rounded-lg backdrop-blur-md border transition-colors',
          showChat ? 'bg-white/10 border-white/20 text-white' : 'bg-black/40 border-white/10 text-white/50 hover:text-white/70',
        )}>
          <MessageCircle className="h-4 w-4" />
        </button>
      </div>

      {/* ── Branding ── */}
      <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 3, repeat: Infinity }}>
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          </motion.div>
          <span className="text-[10px] font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
            AgentColony
          </span>
          <span className="text-[8px] text-white/15">v4.0</span>
        </div>
      </div>
    </div>
  );
}
