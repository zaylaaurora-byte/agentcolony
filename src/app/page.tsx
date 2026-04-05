'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Square, RotateCcw, Wifi, WifiOff, Sparkles, Send, MessageCircle, Loader2, Trophy, X } from 'lucide-react';
import { useChatStore } from '@/lib/chat-store';
import { AGENT_CONFIG, type AgentId, type AgentMessage, type Task } from '@/lib/agent-config';
import { GameCharacter, type AnimState } from '@/components/chat/GameCharacter';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────

interface AgentPosition { x: number; y: number; targetX: number; targetY: number; station: string }
type SessionStatus = 'idle' | 'running' | 'paused' | 'complete' | 'error';

// ─── Station configs ────────────────────────────────────────────────────

const STATIONS = [
  { id: 'planning-desk', label: 'Planning', emoji: '📋', x: 18, y: 22 },
  { id: 'workbench', label: 'Workshop', emoji: '🔧', x: 50, y: 55 },
  { id: 'review-desk', label: 'QA Lab', emoji: '🔍', x: 82, y: 22 },
  { id: 'creative-studio', label: 'Studio', emoji: '🎨', x: 50, y: 28 },
];

// ─── Main Component ──────────────────────────────────────────────────────

export default function Home() {
  const store = useChatStore();
  const { messages, streamingContent, tasks, sessionStatus, selectedAgents, connected } = store;
  const socketRef = useRef<Socket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [goal, setGoal] = useState('');
  const [agentPositions, setAgentPositions] = useState<Record<string, AgentPosition>>({});
  const [activeAgents, setActiveAgents] = useState<string[]>(selectedAgents);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [maxIterations, setMaxIterations] = useState(20);
  const [qualityThreshold, setQualityThreshold] = useState(8);
  const [qualityScore, setQualityScore] = useState(0);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [summonedAgents, setSummonedAgents] = useState<string[]>([]);
  const [worldTime, setWorldTime] = useState(0);

  // World time ticks
  useEffect(() => {
    if (sessionStatus === 'running') {
      const interval = setInterval(() => setWorldTime(t => t + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [sessionStatus]);

  // Connect to socket
  useEffect(() => {
    const socket = io('/?XTransformPort=3004', {
      transports: ['websocket', 'polling'], forceNew: true, reconnection: true, reconnectionAttempts: 10,
    });
    socketRef.current = socket;
    socket.on('connect', () => store.setConnected(true));
    socket.on('disconnect', () => store.setConnected(false));

    socket.on('session-init', (data: any) => {
      setAgentPositions(data.agentPositions || {});
      setMaxIterations(data.config?.maxIterations || 20);
      setQualityThreshold(data.config?.qualityThreshold || 8);
    });

    socket.on('agent-message', (msg: AgentMessage) => {
      store.addMessage(msg);
      setActiveAgentId(null);
      store.clearStream(msg.agentId);
    });

    socket.on('agent-stream', ({ agentId, chunk }: { agentId: string; chunk: string }) => {
      setActiveAgentId(agentId);
      store.appendStream(agentId, chunk);
    });

    socket.on('agent-move', ({ agentId, targetX, targetY, station }: any) => {
      setAgentPositions(prev => ({ ...prev, [agentId]: { ...prev[agentId], targetX, targetY, station } }));
    });

    socket.on('agent-summoned', ({ agentId, name, position }: any) => {
      setAgentPositions(prev => ({ ...prev, [agentId]: position }));
      setSummonedAgents(prev => [...prev, agentId]);
      setActiveAgents(prev => [...prev, agentId]);
    });

    socket.on('task-update', (task: Task) => store.updateTask(task));
    socket.on('session-status', ({ status }: { status: string }) => {
      store.setSessionStatus(status as SessionStatus);
      if (status === 'complete' || status === 'error') {
        setActiveAgentId(null);
        store.clearStream('mastermind'); store.clearStream('worker');
        store.clearStream('reviewer'); store.clearStream('creative');
      }
    });
    socket.on('iteration-update', (data: any) => { setCurrentIteration(data.iteration); setQualityScore(data.qualityScore); });
    socket.on('session-error', ({ message }: { message: string }) => console.error('Session error:', message));

    return () => { socket.disconnect(); };
  }, []);

  // Auto-scroll chat
  useEffect(() => { chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, streamingContent]);

  const handleStart = useCallback(() => {
    if (!socketRef.current || !goal.trim()) return;
    store.clearSession(); setSummonedAgents([]); setActiveAgents([...selectedAgents]);
    setCurrentIteration(0); setQualityScore(0); setWorldTime(0);
    socketRef.current.emit('start-session', { goal: goal.trim(), agents: selectedAgents });
  }, [goal, selectedAgents]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !socketRef.current) return;
    if (sessionStatus === 'idle') { setGoal(trimmed); store.clearSession(); setSummonedAgents([]); setActiveAgents([...selectedAgents]); setCurrentIteration(0); setQualityScore(0);
      socketRef.current.emit('start-session', { goal: trimmed, agents: selectedAgents });
    } else { socketRef.current.emit('user-message', { message: trimmed }); }
    setInput('');
  }, [input, sessionStatus, selectedAgents]);

  const handlePause = () => socketRef.current?.emit('pause-session');
  const handleResume = () => socketRef.current?.emit('resume-session');
  const handleStop = () => socketRef.current?.emit('stop-session');
  const handleReset = () => { store.clearSession(); setGoal(''); setAgentPositions({}); setSummonedAgents([]); setActiveAgents([...selectedAgents]); setCurrentIteration(0); setQualityScore(0); };

  const isRunning = sessionStatus === 'running';
  const isPaused = sessionStatus === 'paused';
  const isIdle = sessionStatus === 'idle';
  const isDone = sessionStatus === 'complete' || sessionStatus === 'error';
  const streamingAgents = Object.keys(streamingContent);
  const trunc = (t: string, n: number) => t.length > n ? t.slice(0, n) + '...' : t;

  // Determine anim state for each agent
  const getAnimState = (agentId: string): AnimState => {
    if (activeAgentId === agentId || streamingAgents.includes(agentId)) {
      const pos = agentPositions[agentId];
      return pos?.station === 'idle' ? 'talk' : 'work';
    }
    return 'idle';
  };

  const allActiveAgents = [...new Set([...activeAgents, ...summonedAgents])];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a2e] overflow-hidden select-none">
      {/* ── Header ── */}
      <header className="shrink-0 h-11 border-b border-white/10 bg-[#12122a] flex items-center px-3 gap-2 z-20">
        <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 3, repeat: Infinity }}>
          <Sparkles className="h-4 w-4 text-purple-400" />
        </motion.div>
        <span className="font-bold text-xs bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">AgentChat</span>

        {!isIdle && (
          <div className="flex items-center gap-1.5 ml-3">
            <span className="text-[10px] text-white/40 font-mono">ITER {currentIteration}/{maxIterations}</span>
            {qualityScore > 0 && (
              <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded', qualityScore >= qualityThreshold ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400')}>
                <Trophy className="h-2.5 w-2.5 inline mr-0.5" />{qualityScore}/{qualityThreshold}
              </span>
            )}
            {isRunning && (
              <motion.span className="text-[10px] text-purple-400 font-mono" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}>
                LIVE
              </motion.span>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setShowChat(!showChat)} className={cn('p-1.5 rounded-lg transition-colors', showChat ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70')}>
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
          <div className={cn('flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full', connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
            {connected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
          </div>
        </div>
      </header>

      {/* ── Main Area ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ── 2D World ── */}
        <div className="flex-1 relative overflow-hidden">
          {/* Sky gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#1a3a1a]" />

          {/* Isometric grass floor */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 38px, rgba(255,255,255,0.03) 38px, rgba(255,255,255,0.03) 40px),
                              repeating-linear-gradient(90deg, transparent, transparent 38px, rgba(255,255,255,0.03) 38px, rgba(255,255,255,0.03) 40px)`,
          }} />

          {/* Grass patches */}
          <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-green-900/20 to-transparent" />

          {/* Walls / room boundary */}
          <div className="absolute top-[12%] left-[8%] right-[8%] bottom-[15%] border-2 border-white/5 rounded-3xl bg-white/[0.01]" />

          {/* ── Stations (furniture) ── */}
          {STATIONS.map((station) => {
            const occupied = Object.values(agentPositions).some(p => p.station === station.id);
            return (
              <motion.div key={station.id} className="absolute flex flex-col items-center z-[5]"
                style={{ left: `${station.x}%`, top: `${station.y}%`, transform: 'translate(-50%, -50%)' }}
                initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
                <div className={cn(
                  'w-14 h-14 rounded-xl border flex flex-col items-center justify-center transition-all duration-500',
                  occupied ? 'border-white/20 bg-white/10 shadow-lg' : 'border-white/5 bg-white/[0.03]'
                )}>
                  <span className="text-lg">{station.emoji}</span>
                </div>
                <span className="text-[8px] text-white/25 mt-0.5 font-medium tracking-wide">{station.label.toUpperCase()}</span>
              </motion.div>
            );
          })}

          {/* ── Characters ── */}
          {allActiveAgents.map((agentId) => {
            const config = AGENT_CONFIG[agentId as keyof typeof AGENT_CONFIG];
            if (!config) return null;
            const pos = agentPositions[agentId];
            if (!pos) return null;
            const animState = getAnimState(agentId);
            const isActive = activeAgentId === agentId || streamingAgents.includes(agentId);
            const streamText = streamingContent[agentId] || '';
            const lastMsg = messages.filter(m => m.agentId === agentId).slice(-1)[0];
            const bubbleText = isActive ? trunc(streamText, 90) : lastMsg ? trunc(lastMsg.content, 90) : '';
            const isSummoned = summonedAgents.includes(agentId);
            const isMoving = pos.x !== pos.targetX || pos.y !== pos.targetY;

            return (
              <motion.div key={agentId} className="absolute z-10"
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
                animate={{ left: `${pos.targetX}%`, top: `${pos.targetY}%` }}
                transition={{ duration: 1.2, ease: 'easeInOut' }}>
                {/* Speech bubble */}
                <AnimatePresence>
                  {bubbleText && (
                    <motion.div initial={{ opacity: 0, y: 5, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.8 }}
                      className="absolute -top-32 left-1/2 -translate-x-1/2 w-52 z-30">
                      <div className="relative bg-black/60 backdrop-blur-md rounded-xl px-2.5 py-2 border border-white/10">
                        <p className="text-[10px] text-white/80 leading-relaxed">
                          {bubbleText}
                          {isActive && <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>▊</motion.span>}
                        </p>
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-black/60 border-r border-b border-white/10" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Character */}
                <div className={cn(isSummoned && 'animate-summon', isMoving && 'animate-walk-cycle')}>
                  <div className="relative">
                    {isActive && (
                      <motion.div className="absolute -inset-2 rounded-full opacity-30 blur-sm"
                        style={{ backgroundColor: config.color }}
                        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.15, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity }} />
                    )}
                    <GameCharacter agentId={agentId as AgentId} color={config.color} name={config.name}
                      animState={isMoving ? 'walk' : animState} size={40} />
                    {/* Name tag */}
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-bold px-1.5 py-0.5 rounded-md"
                      style={{ backgroundColor: config.color + '25', color: config.color }}>
                      {config.name}
                    </div>
                    {/* Active indicator */}
                    {isActive && (
                      <motion.div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#1a1a2e]"
                        style={{ backgroundColor: config.color }}
                        animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                    )}
                    {/* Summon effect */}
                    {isSummoned && (
                      <motion.div className="absolute -inset-4 rounded-full border-2"
                        style={{ borderColor: config.color + '40' }}
                        initial={{ scale: 0.5, opacity: 1 }} animate={{ scale: 2, opacity: 0 }}
                        transition={{ duration: 0.8 }} />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* ── Idle State ── */}
          {isIdle && Object.keys(agentPositions).length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-4">
              <motion.div className="flex gap-4 mb-5" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                {(selectedAgents as AgentId[]).map((id, i) => (
                  <motion.div key={id} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.12 }}>
                    <GameCharacter agentId={id} color={AGENT_CONFIG[id].color} name={AGENT_CONFIG[id].name} animState="idle" size={52} />
                    <p className="text-center text-[9px] mt-1 font-bold" style={{ color: AGENT_CONFIG[id].color }}>{AGENT_CONFIG[id].name}</p>
                  </motion.div>
                ))}
              </motion.div>
              <motion.h2 initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
                className="text-lg font-bold text-white/70 mb-1">Your Agents Are Ready</motion.h2>
              <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}
                className="text-xs text-white/30 mb-5 text-center max-w-sm">
                Give them a task. They&apos;ll plan, execute, review, and iterate until it&apos;s perfect. Mastermind can summon more agents mid-session.
              </motion.p>
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}
                className="flex flex-wrap justify-center gap-1.5 max-w-md">
                {['Plan a coffee shop marketing strategy', 'Write a sci-fi short story', 'Design a fitness app', 'Create a startup pitch'].map((ex, i) => (
                  <button key={i} onClick={() => setGoal(ex)}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 transition-all">
                    {ex}
                  </button>
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
                  {qualityScore >= qualityThreshold ? '✨ Quality Threshold Reached!' : '✅ Session Complete'}
                </p>
                <p className="text-[10px] text-emerald-300/50">{currentIteration} iterations • Quality: {qualityScore || 'N/A'}/10</p>
              </div>
            </motion.div>
          )}

          {/* ── Task Board (floating) ── */}
          {!isIdle && tasks.length > 0 && (
            <motion.div initial={{ x: 200, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
              className="absolute top-3 right-3 w-56 z-20">
              <div className="bg-black/50 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-white/5 flex items-center gap-1.5">
                  <Loader2 className={cn('h-3 w-3 text-purple-400', isRunning && 'animate-spin')} />
                  <span className="text-[10px] font-semibold text-white/50">TASKS</span>
                  <span className="ml-auto text-[9px] text-white/25">{tasks.filter(t => t.status === 'done').length}/{tasks.length}</span>
                </div>
                <ScrollArea className="max-h-40">
                  <div className="p-1.5 space-y-1">
                    {tasks.map((task) => (
                      <div key={task.taskId} className={cn(
                        'flex items-start gap-1 p-1.5 rounded-lg text-[9px]',
                        task.status === 'in_progress' ? 'bg-blue-500/10' : task.status === 'done' ? 'bg-emerald-500/10' : 'bg-white/[0.03]'
                      )}>
                        <span>{task.status === 'in_progress' ? '⏳' : task.status === 'done' ? '✅' : '⬜'}</span>
                        <p className="text-white/50 leading-relaxed line-clamp-2 flex-1">{task.description}</p>
                        {task.qualityScore ? <span className={task.qualityScore >= qualityThreshold ? 'text-emerald-400' : 'text-yellow-400'}>{task.qualityScore}/10</span> : null}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          )}

          {/* ── Agent Selector (idle, floating left) ── */}
          {isIdle && (
            <motion.div initial={{ x: -200, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.7 }}
              className="absolute top-3 left-3 z-20">
              <div className="bg-black/50 backdrop-blur-md rounded-xl border border-white/10 p-2.5 space-y-1.5 w-44">
                <span className="text-[9px] font-semibold text-white/30 px-0.5">TEAM</span>
                {(Object.keys(AGENT_CONFIG) as AgentId[]).map((id) => {
                  const isSel = selectedAgents.includes(id);
                  return (
                    <button key={id} onClick={() => store.toggleAgent(id)}
                      className={cn('flex items-center gap-2 w-full p-1.5 rounded-lg transition-all text-left', isSel ? 'bg-white/10' : 'opacity-40 hover:opacity-60')}>
                      <GameCharacter agentId={id} color={AGENT_CONFIG[id].color} name={AGENT_CONFIG[id].name} animState="idle" size={28} />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold truncate" style={{ color: isSel ? AGENT_CONFIG[id].color : 'rgba(255,255,255,0.3)' }}>{AGENT_CONFIG[id].name}</p>
                        <p className="text-[8px] text-white/20 truncate">{AGENT_CONFIG[id].description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Bottom Controls ── */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-3">
            <div className="flex items-center gap-1.5">
              {isIdle && (
                <div className="flex-1 flex gap-1.5">
                  <Input value={goal} onChange={e => setGoal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleStart()}
                    placeholder="Enter your task..."
                    className="h-10 rounded-lg bg-white/5 border-white/10 text-xs text-white placeholder:text-white/25" />
                  <Button onClick={handleStart} disabled={!goal.trim()} className="h-10 rounded-lg px-5 text-xs font-medium"
                    style={{ background: 'linear-gradient(135deg, #8B5CF6, #EC4899)' }}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Start
                  </Button>
                </div>
              )}
              {(isRunning || isPaused) && (
                <div className="flex gap-1.5 w-full">
                  <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="Say something to help..." disabled={isPaused}
                    className="flex-1 h-10 rounded-lg bg-white/5 border-white/10 text-xs text-white placeholder:text-white/25 disabled:opacity-50" />
                  <Button onClick={handleSend} disabled={!input.trim()} size="icon" className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/15 text-white"><Send className="h-3.5 w-3.5" /></Button>
                  {isRunning && <Button onClick={handlePause} variant="outline" size="icon" className="h-10 w-10 rounded-lg border-white/10 bg-white/5 text-white"><Pause className="h-3.5 w-3.5" /></Button>}
                  {isPaused && <Button onClick={handleResume} size="icon" className="h-10 w-10 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"><Play className="h-3.5 w-3.5" /></Button>}
                  <Button onClick={handleStop} size="icon" className="h-10 w-10 rounded-lg bg-red-500/20 text-red-400 border border-red-500/20"><Square className="h-3.5 w-3.5" /></Button>
                </div>
              )}
              {isDone && (
                <Button onClick={handleReset} variant="outline" className="w-full h-10 rounded-lg border-white/10 bg-white/5 text-white">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> New Task
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── Chat Panel ── */}
        <AnimatePresence>
          {showChat && (
            <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 320, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="shrink-0 border-l border-white/10 bg-[#12122a] overflow-hidden">
              <div className="w-[320px] h-full flex flex-col">
                <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white/50">LOG</h3>
                  <button onClick={() => setShowChat(false)} className="text-white/30 hover:text-white/60"><X className="h-3.5 w-3.5" /></button>
                </div>
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-2 space-y-2">
                  {messages.length === 0 && !streamingAgents.length && <p className="text-[10px] text-white/15 text-center py-8">No messages yet</p>}
                  {messages.map((msg, idx) => {
                    const cfg = AGENT_CONFIG[msg.agentId as AgentId];
                    const isUser = msg.agentId === 'user';
                    return (
                      <div key={`${msg.agentId}-${idx}`} className="p-2 rounded-lg bg-white/[0.03]">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[9px] font-semibold" style={{ color: isUser ? '#fff' : cfg?.color }}>{msg.agentName}</span>
                          <span className="text-[8px] text-white/15 ml-auto">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
                          <span className="text-[9px] font-semibold" style={{ color: cfg?.color }}>{cfg?.name}</span>
                          <motion.span className="text-[8px] text-purple-400" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }}>typing</motion.span>
                        </div>
                        <p className="text-[10px] text-white/50 leading-relaxed whitespace-pre-wrap">{streamingContent[aid]}<motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>▊</motion.span></p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
