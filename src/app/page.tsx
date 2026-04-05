'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Square, RotateCcw, Wifi, WifiOff, Sparkles, Send, MessageCircle, Loader2, Trophy } from 'lucide-react';
import { useChatStore } from '@/lib/chat-store';
import { AGENT_CONFIG, type AgentId, type AgentMessage, type Task } from '@/lib/agent-config';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ─── 2D World Constants ──────────────────────────────────────────────────

interface AgentPosition {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  station: string;
}

interface StationConfig {
  id: string;
  label: string;
  x: number;
  y: number;
  icon: string;
}

const STATIONS: StationConfig[] = [
  { id: 'planning-desk', label: 'Planning Desk', x: 20, y: 25, icon: '📋' },
  { id: 'workbench', label: 'Workbench', x: 50, y: 60, icon: '🔧' },
  { id: 'review-desk', label: 'Review Desk', x: 80, y: 25, icon: '🔍' },
  { id: 'creative-studio', label: 'Studio', x: 50, y: 30, icon: '🎨' },
];

// ─── Main Component ──────────────────────────────────────────────────────

export default function Home() {
  const {
    messages,
    streamingContent,
    tasks,
    sessionStatus,
    selectedAgents,
    connected,
    goal,
    setGoal,
    addMessage,
    appendStream,
    clearStream,
    updateTask,
    setSessionStatus,
    setConnected,
    clearSession,
  } = useChatStore();

  const socketRef = useRef<Socket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [agentPositions, setAgentPositions] = useState<Record<string, AgentPosition>>({});
  const [currentIteration, setCurrentIteration] = useState(0);
  const [maxIterations, setMaxIterations] = useState(20);
  const [qualityThreshold, setQualityThreshold] = useState(8);
  const [qualityScore, setQualityScore] = useState(0);
  const [finalOutput, setFinalOutput] = useState('');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Connect
  useEffect(() => {
    const socket = io('/?XTransformPort=3004', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('session-init', (data: any) => {
      setAgentPositions(data.agentPositions || {});
      setMaxIterations(data.config?.maxIterations || 20);
      setQualityThreshold(data.config?.qualityThreshold || 8);
    });

    socket.on('agent-message', (msg: AgentMessage) => {
      addMessage(msg);
      setActiveAgent(null);
      clearStream(msg.agentId);
    });

    socket.on('agent-stream', ({ agentId, chunk }: { agentId: string; chunk: string }) => {
      setActiveAgent(agentId);
      appendStream(agentId, chunk);
    });

    socket.on('agent-move', ({ agentId, x, y, station }: any) => {
      setAgentPositions((prev) => ({
        ...prev,
        [agentId]: { ...prev[agentId], targetX: x, targetY: y, station },
      }));
    });

    socket.on('task-update', (task: Task) => updateTask(task));

    socket.on('session-status', ({ status }: { status: string }) => {
      setSessionStatus(status as any);
      if (status === 'complete' || status === 'error') {
        Object.keys(streamingContent).forEach(clearStream);
        setActiveAgent(null);
      }
    });

    socket.on('iteration-update', (data: any) => {
      setCurrentIteration(data.iteration);
      setQualityScore(data.qualityScore);
    });

    socket.on('quality-reached', (data: any) => {
      setQualityScore(data.score);
    });

    socket.on('final-output', ({ content }: { content: string }) => {
      setFinalOutput(content);
    });

    socket.on('session-error', ({ message }: { message: string }) => {
      console.error('Session error:', message);
    });

    return () => { socket.disconnect(); };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Animate positions smoothly
  const animatedPositions = useMemo(() => {
    const result: Record<string, AgentPosition> = {};
    for (const [id, pos] of Object.entries(agentPositions)) {
      result[id] = {
        ...pos,
        x: pos.x + (pos.targetX - pos.x) * 0.1,
        y: pos.y + (pos.targetY - pos.y) * 0.1,
      };
    }
    return result;
  }, [agentPositions]);

  const handleStart = useCallback(() => {
    if (!socketRef.current || !goal.trim()) return;
    clearSession();
    setFinalOutput('');
    setCurrentIteration(0);
    setQualityScore(0);
    socketRef.current.emit('start-session', {
      goal: goal.trim(),
      agents: selectedAgents,
    });
  }, [goal, selectedAgents, clearSession]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !socketRef.current) return;

    if (sessionStatus === 'idle') {
      setGoal(trimmed);
      clearSession();
      setFinalOutput('');
      setCurrentIteration(0);
      setQualityScore(0);
      socketRef.current.emit('start-session', {
        goal: trimmed,
        agents: selectedAgents,
      });
    } else {
      socketRef.current.emit('user-message', { message: trimmed });
    }
    setInput('');
  }, [input, sessionStatus, selectedAgents, setGoal, clearSession]);

  const handlePause = () => socketRef.current?.emit('pause-session');
  const handleResume = () => socketRef.current?.emit('resume-session');
  const handleStop = () => socketRef.current?.emit('stop-session');
  const handleReset = () => { clearSession(); setFinalOutput(''); setAgentPositions({}); setCurrentIteration(0); setQualityScore(0); };

  const activeStreamingAgents = Object.keys(streamingContent);
  const isRunning = sessionStatus === 'running';
  const isPaused = sessionStatus === 'paused';
  const isIdle = sessionStatus === 'idle';
  const isDone = sessionStatus === 'complete' || sessionStatus === 'error';

  // Truncate for speech bubbles
  const truncate = (text: string, len: number) => text.length > len ? text.slice(0, len) + '...' : text;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a2e] overflow-hidden select-none">
      {/* ── Top Bar ── */}
      <header className="shrink-0 h-12 border-b border-white/10 bg-[#16162a] flex items-center px-4 gap-3 z-20">
        <div className="flex items-center gap-2">
          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            <Sparkles className="h-5 w-5 text-purple-400" />
          </motion.div>
          <span className="font-bold text-sm bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
            AgentChat
          </span>
        </div>

        {/* Iteration tracker */}
        {!isIdle && (
          <div className="flex items-center gap-2 ml-4">
            <Badge variant="outline" className="text-[10px] border-purple-500/40 text-purple-300 bg-purple-500/10">
              Iteration {currentIteration}/{maxIterations}
            </Badge>
            {qualityScore > 0 && (
              <Badge variant="outline" className={cn(
                'text-[10px]',
                qualityScore >= qualityThreshold ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-yellow-500/40 text-yellow-300 bg-yellow-500/10'
              )}>
                <Trophy className="h-2.5 w-2.5 mr-1" />
                Quality: {qualityScore}/{qualityThreshold}
              </Badge>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Chat toggle */}
          <button
            onClick={() => setShowChat(!showChat)}
            className={cn('p-1.5 rounded-lg transition-colors', showChat ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5')}
          >
            <MessageCircle className="h-4 w-4" />
          </button>

          {/* Config toggle */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={cn('p-1.5 rounded-lg transition-colors text-[10px] font-mono', showConfig ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5')}
          >
            {'</>'}
          </button>

          <div className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full', connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          </div>
        </div>
      </header>

      {/* ── Main Area ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 2D World View */}
        <div className="flex-1 relative overflow-hidden">
          {/* Ground / Environment */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460]" />

          {/* Grid lines (subtle) */}
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />

          {/* Floor decoration */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-3xl border border-white/5 bg-white/[0.02]" />

          {/* ── Stations ── */}
          {STATIONS.map((station) => (
            <motion.div
              key={station.id}
              className="absolute flex flex-col items-center"
              style={{ left: `${station.x}%`, top: `${station.y}%`, transform: 'translate(-50%, -50%)' }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className={cn(
                'w-16 h-16 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center text-2xl transition-all duration-300',
                Object.values(agentPositions).some(p => p.station === station.id) && 'border-purple-500/40 bg-purple-500/10 shadow-lg shadow-purple-500/10'
              )}>
                {station.icon}
              </div>
              <span className="text-[9px] text-white/30 mt-1 font-medium">{station.label}</span>
            </motion.div>
          ))}

          {/* ── 2D Characters ── */}
          {(selectedAgents as AgentId[]).map((agentId) => {
            const config = AGENT_CONFIG[agentId];
            const pos = animatedPositions[agentId];
            if (!pos) return null;

            const isActive = activeAgent === agentId || activeStreamingAgents.includes(agentId);
            const streamText = streamingContent[agentId] || '';
            const lastMsg = messages.filter(m => m.agentId === agentId).slice(-1)[0];
            const bubbleText = isActive ? truncate(streamText, 80) : lastMsg ? truncate(lastMsg.content, 80) : '';

            return (
              <motion.div
                key={agentId}
                className="absolute z-10 flex flex-col items-center"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                animate={{
                  left: `${pos.targetX}%`,
                  top: `${pos.targetY}%`,
                }}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
              >
                {/* Speech Bubble */}
                <AnimatePresence>
                  {bubbleText && (
                    <motion.div
                      initial={{ opacity: 0, y: 5, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 5, scale: 0.9 }}
                      className="absolute -top-28 left-1/2 -translate-x-1/2 w-56 z-20"
                    >
                      <div className="relative bg-white/10 backdrop-blur-md rounded-2xl px-3 py-2 border border-white/10 shadow-xl">
                        <p className="text-[11px] text-white/80 leading-relaxed line-clamp-4">
                          {bubbleText}
                          {isActive && (
                            <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>
                              ▊
                            </motion.span>
                          )}
                        </p>
                        {/* Bubble tail */}
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-white/10 border-r border-b border-white/10" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Character sprite */}
                <motion.div
                  className="relative"
                  animate={isActive ? { y: [0, -3, 0] } : {}}
                  transition={isActive ? { duration: 0.6, repeat: Infinity } : {}}
                >
                  {/* Glow ring */}
                  {isActive && (
                    <motion.div
                      className="absolute -inset-2 rounded-full opacity-40 blur-sm"
                      style={{ backgroundColor: config.color }}
                      animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.2, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}

                  {/* Character body */}
                  <div
                    className="w-12 h-12 rounded-xl border-2 overflow-hidden shadow-lg"
                    style={{ borderColor: isActive ? config.color : 'rgba(255,255,255,0.2)' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/sprites/${agentId}.png`} alt={config.name} className="w-full h-full object-cover" />
                  </div>

                  {/* Name tag */}
                  <div
                    className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: config.color + '30', color: config.color }}
                  >
                    {config.name}
                  </div>

                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#1a1a2e]"
                      style={{ backgroundColor: config.color }}
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                </motion.div>
              </motion.div>
            );
          })}

          {/* ── Idle State ── */}
          {isIdle && Object.keys(agentPositions).length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              <motion.div
                className="flex -space-x-6 mb-6"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                {(Object.keys(AGENT_CONFIG) as AgentId[]).map((id, i) => (
                  <motion.div
                    key={id}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.15 }}
                    className="relative"
                  >
                    <div className="w-16 h-16 rounded-xl border-2 overflow-hidden shadow-xl" style={{ borderColor: AGENT_CONFIG[id].color }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/sprites/${id}.png`} alt={AGENT_CONFIG[id].name} className="w-full h-full object-cover" />
                    </div>
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-bold whitespace-nowrap" style={{ color: AGENT_CONFIG[id].color }}>
                      {AGENT_CONFIG[id].name}
                    </span>
                  </motion.div>
                ))}
              </motion.div>

              <motion.h2
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-xl font-bold text-white/80 mb-1"
              >
                Your Agents Are Ready
              </motion.h2>
              <motion.p
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-sm text-white/40 mb-6 text-center max-w-sm px-4"
              >
                Give them a task and watch them collaborate in real-time.
                They&apos;ll keep improving until the quality is top-notch.
              </motion.p>

              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="flex flex-wrap justify-center gap-2 max-w-md px-4"
              >
                {['Plan a coffee shop marketing strategy', 'Write a short sci-fi story', 'Design a workout app', 'Create a business plan'].map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => { setGoal(ex); }}
                    className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 transition-all"
                  >
                    {ex}
                  </button>
                ))}
              </motion.div>
            </div>
          )}

          {/* ── Complete Overlay ── */}
          {isDone && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-30"
            >
              <div className="bg-emerald-500/20 border border-emerald-500/30 backdrop-blur-md rounded-2xl px-5 py-3 text-center">
                <p className="text-sm font-bold text-emerald-300">
                  {qualityScore >= qualityThreshold ? '✨ Quality Threshold Reached!' : '✅ Session Complete'}
                </p>
                <p className="text-[11px] text-emerald-300/60">
                  {currentIteration} iterations • Final quality: {qualityScore || 'N/A'}/10
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Bottom Controls (floating) ── */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-4">
            <div className="flex items-center gap-2">
              {isIdle && (
                <div className="flex-1 flex gap-2">
                  <Input
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                    placeholder="Enter your task... (e.g., Build me a landing page)"
                    className="h-11 rounded-xl bg-white/5 border-white/10 text-sm text-white placeholder:text-white/30 focus-visible:ring-purple-500/50"
                  />
                  <Button onClick={handleStart} disabled={!goal.trim()} className="h-11 rounded-xl px-6 font-medium" style={{ background: 'linear-gradient(135deg, #8B5CF6, #EC4899)' }}>
                    <Play className="h-4 w-4 mr-1.5" /> Start
                  </Button>
                </div>
              )}

              {isRunning && (
                <div className="flex gap-2 w-full">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Say something to help..."
                    className="flex-1 h-11 rounded-xl bg-white/5 border-white/10 text-sm text-white placeholder:text-white/30 focus-visible:ring-purple-500/50"
                  />
                  <Button onClick={handleSend} disabled={!input.trim()} size="icon" className="h-11 w-11 rounded-xl bg-white/10 hover:bg-white/20 text-white">
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button onClick={handlePause} variant="outline" size="icon" className="h-11 w-11 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10">
                    <Pause className="h-4 w-4" />
                  </Button>
                  <Button onClick={handleStop} size="icon" className="h-11 w-11 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20">
                    <Square className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {isPaused && (
                <div className="flex gap-2 w-full">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Give guidance while paused..."
                    className="flex-1 h-11 rounded-xl bg-white/5 border-white/10 text-sm text-white placeholder:text-white/30 focus-visible:ring-purple-500/50"
                  />
                  <Button onClick={handleSend} disabled={!input.trim()} size="icon" className="h-11 w-11 rounded-xl bg-white/10 hover:bg-white/20 text-white">
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button onClick={handleResume} size="icon" className="h-11 w-11 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/20">
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button onClick={handleStop} size="icon" className="h-11 w-11 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20">
                    <Square className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {isDone && (
                <div className="flex gap-2 w-full">
                  <Button onClick={handleReset} variant="outline" className="flex-1 h-11 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10">
                    <RotateCcw className="h-4 w-4 mr-1.5" /> New Task
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ── Task Board (floating, right side) ── */}
          {!isIdle && tasks.length > 0 && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="absolute top-4 right-4 w-64 z-20"
            >
              <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
                <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
                  <Loader2 className={cn('h-3 w-3 text-purple-400', isRunning && 'animate-spin')} />
                  <span className="text-[11px] font-semibold text-white/60">Tasks</span>
                  <span className="ml-auto text-[10px] text-white/30">{tasks.filter(t => t.status === 'done').length}/{tasks.length}</span>
                </div>
                <ScrollArea className="max-h-48">
                  <div className="p-2 space-y-1">
                    {tasks.map((task) => (
                      <div key={task.taskId} className={cn(
                        'flex items-start gap-1.5 p-1.5 rounded-lg text-[10px]',
                        task.status === 'in_progress' ? 'bg-blue-500/10' :
                        task.status === 'done' ? 'bg-emerald-500/10' :
                        'bg-white/5'
                      )}>
                        <span className={cn(
                          'mt-0.5',
                          task.status === 'in_progress' ? 'text-blue-400' :
                          task.status === 'done' ? 'text-emerald-400' :
                          'text-white/20'
                        )}>
                          {task.status === 'in_progress' ? '⏳' : task.status === 'done' ? '✅' : '⬜'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white/60 leading-relaxed line-clamp-2">{task.description}</p>
                          {task.qualityScore && (
                            <span className={cn(
                              'text-[9px]',
                              task.qualityScore >= qualityThreshold ? 'text-emerald-400' : 'text-yellow-400'
                            )}>
                              Score: {task.qualityScore}/10
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          )}

          {/* ── Agent Selector (floating, left side) ── */}
          {isIdle && (
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="absolute top-4 left-4 z-20"
            >
              <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-3 space-y-2">
                <span className="text-[10px] font-semibold text-white/40 px-1">TEAM</span>
                {(Object.keys(AGENT_CONFIG) as AgentId[]).map((id) => {
                  const isSelected = selectedAgents.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => useChatStore.getState().toggleAgent(id)}
                      className={cn(
                        'flex items-center gap-2 w-full p-2 rounded-xl transition-all text-left',
                        isSelected ? 'bg-white/10' : 'opacity-40'
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden border" style={{ borderColor: isSelected ? AGENT_CONFIG[id].color : 'transparent' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/sprites/${id}.png`} alt={AGENT_CONFIG[id].name} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold" style={{ color: isSelected ? AGENT_CONFIG[id].color : 'rgba(255,255,255,0.4)' }}>
                          {AGENT_CONFIG[id].name}
                        </p>
                        <p className="text-[9px] text-white/30">{AGENT_CONFIG[id].description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Chat Panel (slide out) ── */}
        <AnimatePresence>
          {showChat && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 border-l border-white/10 bg-[#16162a] overflow-hidden"
            >
              <div className="w-[360px] h-full flex flex-col">
                <div className="px-4 py-3 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-white/60">Conversation Log</h3>
                </div>
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                  {messages.length === 0 && !activeStreamingAgents.length && (
                    <p className="text-xs text-white/20 text-center py-8">No messages yet...</p>
                  )}
                  {messages.map((msg, idx) => {
                    const cfg = AGENT_CONFIG[msg.agentId as AgentId];
                    const isUser = msg.agentId === 'user';
                    return (
                      <div key={`${msg.agentId}-${idx}`} className={cn('p-2.5 rounded-xl', isUser ? 'bg-white/5' : 'bg-white/[0.02]')}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-4 h-4 rounded-full overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={isUser ? '/logo.svg' : `/sprites/${msg.agentId}.png`} alt="" className="w-full h-full object-cover" />
                          </div>
                          <span className="text-[10px] font-semibold" style={{ color: isUser ? '#fff' : cfg?.color }}>
                            {msg.agentName}
                          </span>
                          <span className="text-[9px] text-white/20 ml-auto">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/60 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    );
                  })}
                  {/* Active streaming */}
                  {activeStreamingAgents.map((agentId) => {
                    const cfg = AGENT_CONFIG[agentId as AgentId];
                    if (!streamingContent[agentId]) return null;
                    return (
                      <div key={`stream-${agentId}`} className="p-2.5 rounded-xl bg-white/[0.03]">
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-4 h-4 rounded-full overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/sprites/${agentId}.png`} alt="" className="w-full h-full object-cover" />
                          </div>
                          <span className="text-[10px] font-semibold" style={{ color: cfg?.color }}>{cfg?.name}</span>
                          <motion.span className="text-[9px] text-purple-400" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }}>
                            typing...
                          </motion.span>
                        </div>
                        <p className="text-[11px] text-white/60 leading-relaxed whitespace-pre-wrap">
                          {streamingContent[agentId]}
                          <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>▊</motion.span>
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Final output */}
                {finalOutput && (
                  <div className="border-t border-white/5 p-3">
                    <h4 className="text-[10px] font-semibold text-emerald-400 mb-1">FINAL OUTPUT</h4>
                    <ScrollArea className="max-h-32">
                      <p className="text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap">{finalOutput}</p>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Config Panel (slide out) ── */}
        <AnimatePresence>
          {showConfig && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 border-l border-white/10 bg-[#16162a] overflow-hidden"
            >
              <div className="w-[400px] h-full flex flex-col">
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white/60">agent-config.json</h3>
                  <Button
                    onClick={() => socketRef.current?.emit('reload-config')}
                    size="sm"
                    className="h-7 text-[10px] rounded-lg bg-white/10 hover:bg-white/15 text-white/60"
                  >
                    Reload
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    <p className="text-[11px] text-white/30 mb-4">
                      Edit <code className="text-purple-400">agent-config.json</code> in your project root to customize:
                    </p>
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                        <h4 className="text-[11px] font-semibold text-purple-400 mb-1">📋 User Context</h4>
                        <p className="text-[10px] text-white/40 leading-relaxed">Auto-fed to every agent. They never ask about this — they already know.</p>
                        <div className="mt-2 space-y-1 text-[10px] font-mono text-white/25">
                          <p>context.about_user</p>
                          <p>context.project_info</p>
                          <p>context.preferences</p>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                        <h4 className="text-[11px] font-semibold text-orange-400 mb-1">🤖 Agent Personalities</h4>
                        <p className="text-[10px] text-white/40 leading-relaxed">Customize each agent&apos;s personality, role, and extra context.</p>
                        <div className="mt-2 space-y-1 text-[10px] font-mono text-white/25">
                          <p>agents.mastermind.personality</p>
                          <p>agents.worker.extra_context</p>
                          <p>agents.reviewer.personality</p>
                          <p>agents.creative.personality</p>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                        <h4 className="text-[11px] font-semibold text-emerald-400 mb-1">🔄 Loop Settings</h4>
                        <p className="text-[10px] text-white/40 leading-relaxed">Control how agents iterate and improve.</p>
                        <div className="mt-2 space-y-1 text-[10px] font-mono text-white/25">
                          <p>loop.max_iterations: {maxIterations}</p>
                          <p>loop.auto_improve: true</p>
                          <p>loop.quality_threshold: {qualityThreshold}</p>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                        <h4 className="text-[11px] font-semibold text-pink-400 mb-1">🔑 Access Tokens</h4>
                        <p className="text-[10px] text-white/40 leading-relaxed">Store API tokens here. Agents auto-know they&apos;re available.</p>
                        <div className="mt-2 space-y-1 text-[10px] font-mono text-white/25">
                          <p>tokens.openai_api_key</p>
                          <p>tokens.github_token</p>
                          <p>tokens.* (any custom keys)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
