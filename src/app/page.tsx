'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, MessageSquare, Sparkles } from 'lucide-react';
import { useChatStore } from '@/lib/chat-store';
import { AGENT_CONFIG, type AgentId, type AgentMessage } from '@/lib/agent-config';
import { AgentAvatar } from '@/components/chat/AgentAvatar';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { TaskBoard } from '@/components/chat/TaskBoard';
import { AgentSelector } from '@/components/chat/AgentSelector';
import { SessionControls } from '@/components/chat/SessionControls';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function Home() {
  const {
    messages,
    streamingContent,
    tasks,
    sessionStatus,
    selectedAgents,
    connected,
    goal,
    addMessage,
    appendStream,
    clearStream,
    updateTask,
    setSessionStatus,
    setConnected,
    setGoal,
    clearSession,
  } = useChatStore();

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTaskBoard, setShowTaskBoard] = useState(true);

  // Connect to Socket.IO
  useEffect(() => {
    const socket = io('/?XTransformPort=3004', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 15000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to agent-chat service');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from agent-chat service');
      setConnected(false);
    });

    socket.on('agent-message', (msg: AgentMessage) => {
      addMessage(msg);
    });

    socket.on('agent-stream', ({ agentId, chunk }: { agentId: string; chunk: string }) => {
      appendStream(agentId, chunk);
    });

    socket.on('task-update', (task: any) => {
      updateTask(task);
    });

    socket.on('session-status', ({ status }: { status: string }) => {
      setSessionStatus(status as any);
      if (status === 'complete' || status === 'error') {
        // Clear any remaining streaming
        Object.keys(streamingContent).forEach((id) => clearStream(id));
      }
    });

    socket.on('session-error', ({ message }: { message: string }) => {
      console.error('Session error:', message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleGoalSubmit = useCallback(
    (newGoal: string) => {
      setGoal(newGoal);
      if (socketRef.current) {
        socketRef.current.emit('start-session', {
          goal: newGoal,
          agents: selectedAgents,
        });
      }
    },
    [selectedAgents, setGoal]
  );

  const handleUserMessage = useCallback(
    (message: string) => {
      if (!socketRef.current) return;
      if (sessionStatus === 'idle') {
        handleGoalSubmit(message);
      } else {
        socketRef.current.emit('user-message', { message });
      }
    },
    [sessionStatus, handleGoalSubmit]
  );

  // Build the unified message list (completed messages + streaming)
  const activeStreamingAgents = Object.keys(streamingContent);
  const hasActiveStream = activeStreamingAgents.length > 0;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden dark">
      {/* ── Header ── */}
      <header className="shrink-0 border-b bg-card/80 backdrop-blur-sm px-4 py-2.5 flex items-center gap-3 z-10">
        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="lg:hidden p-1.5 rounded-lg hover:bg-muted/60 transition-colors"
        >
          <MessageSquare className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <motion.div
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-pink-400"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          <div>
            <h1 className="text-base font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
              AgentChat
            </h1>
            <p className="text-[10px] text-muted-foreground -mt-0.5">
              Watch AI agents collaborate
            </p>
          </div>
        </div>

        {/* Agent avatars strip */}
        <div className="hidden sm:flex items-center gap-1 ml-4">
          {(selectedAgents as AgentId[]).map((agentId) => (
            <AgentAvatar
              key={agentId}
              agentId={agentId}
              size="sm"
              showBadge={false}
              isActive={activeStreamingAgents.includes(agentId)}
            />
          ))}
        </div>

        {/* Status indicators */}
        <div className="ml-auto flex items-center gap-2">
          {sessionStatus !== 'idle' && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] gap-1',
                sessionStatus === 'running' && 'border-purple-500/50 text-purple-400',
                sessionStatus === 'paused' && 'border-yellow-500/50 text-yellow-400',
                sessionStatus === 'complete' && 'border-emerald-500/50 text-emerald-400',
                sessionStatus === 'error' && 'border-red-500/50 text-red-400'
              )}
            >
              {hasActiveStream && (
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-current"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
              {sessionStatus}
            </Badge>
          )}
          <div
            className={cn(
              'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full',
              connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            )}
          >
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'Live' : 'Offline'}
          </div>

          {/* Mobile task board toggle */}
          <button
            onClick={() => setShowTaskBoard(!showTaskBoard)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-muted/60 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar — Agent Selector */}
        <AnimatePresence>
          {showSidebar && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 border-r bg-card/40 overflow-hidden hidden lg:block"
            >
              <div className="w-[260px] h-full flex flex-col">
                <div className="p-4 flex-1 overflow-y-auto">
                  <AgentSelector />

                  {/* Agent Descriptions */}
                  <div className="mt-6 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground/80 px-1">
                      Agent Details
                    </h3>
                    {(selectedAgents as AgentId[]).map((agentId) => {
                      const config = AGENT_CONFIG[agentId];
                      const isActive = activeStreamingAgents.includes(agentId);
                      return (
                        <motion.div
                          key={agentId}
                          animate={isActive ? { borderColor: config.color + '80' } : {}}
                          className="p-3 rounded-xl border border-border/40 bg-muted/20"
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: config.color }}
                            />
                            <span className="text-xs font-semibold" style={{ color: config.color }}>
                              {config.name}
                            </span>
                            {isActive && (
                              <motion.span
                                className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300"
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              >
                                thinking...
                              </motion.span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {config.description}
                          </p>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Center — Chat Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Goal display */}
          {goal && sessionStatus !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 py-2.5 border-b bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-orange-500/5"
            >
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground/70">Goal:</span> {goal}
              </p>
            </motion.div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto">
              {messages.length === 0 && !hasActiveStream ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center h-full min-h-[60vh] px-6 text-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="relative mb-6"
                  >
                    <div className="flex -space-x-4">
                      {(Object.keys(AGENT_CONFIG) as AgentId[]).map((id, i) => (
                        <motion.div
                          key={id}
                          initial={{ x: -20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: i * 0.1 }}
                          className="relative"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={AGENT_CONFIG[id].avatar}
                            alt={AGENT_CONFIG[id].name}
                            className="w-16 h-16 rounded-full border-3 border-background shadow-lg object-cover"
                            style={{ borderColor: AGENT_CONFIG[id].color }}
                          />
                        </motion.div>
                      ))}
                    </div>
                    <motion.div
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-32 h-4 rounded-full blur-md"
                      style={{
                        background: 'linear-gradient(90deg, #8B5CF640, #EC489940, #F9731640)',
                      }}
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    />
                  </motion.div>

                  <motion.h2
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent mb-2"
                  >
                    Welcome to AgentChat
                  </motion.h2>
                  <motion.p
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-sm text-muted-foreground max-w-md leading-relaxed"
                  >
                    Select your agents on the left, then type a goal below.
                    Watch as the Mastermind plans tasks and delegates to the Worker — all in real-time!
                  </motion.p>

                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full"
                  >
                    {[
                      'Plan a marketing strategy for a coffee shop',
                      'Write a short story about a space robot',
                      'Design a workout routine for beginners',
                      'Create a business plan for a mobile app',
                    ].map((example, i) => (
                      <button
                        key={i}
                        onClick={() => handleGoalSubmit(example)}
                        className="text-left p-3 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/40 hover:border-purple-500/30 transition-all text-xs text-foreground/70 hover:text-foreground"
                      >
                        <Sparkles className="h-3 w-3 inline mr-1.5 text-purple-400/60" />
                        {example}
                      </button>
                    ))}
                  </motion.div>
                </div>
              ) : (
                /* Messages List */
                <div className="py-2">
                  <AnimatePresence mode="popLayout">
                    {messages.map((msg, idx) => (
                      <MessageBubble key={`${msg.agentId}-${msg.timestamp}-${idx}`} message={msg} />
                    ))}
                  </AnimatePresence>

                  {/* Active streaming message */}
                  {hasActiveStream &&
                    activeStreamingAgents.map((agentId) => {
                      const config = AGENT_CONFIG[agentId as AgentId];
                      if (!config || !streamingContent[agentId]) return null;
                      return (
                        <MessageBubble
                          key={`streaming-${agentId}`}
                          message={{
                            agentId,
                            agentName: config.name,
                            role: config.role,
                            content: '',
                            timestamp: new Date().toISOString(),
                          }}
                          isStreaming={true}
                          streamContent={streamingContent[agentId]}
                        />
                      );
                    })}

                  <div ref={chatEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Controls */}
          <SessionControls socket={socketRef.current} />
          <ChatInput onGoalSubmit={handleUserMessage} />
        </main>

        {/* Right Panel — Task Board */}
        <AnimatePresence>
          {showTaskBoard && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 border-l bg-card/40 overflow-hidden hidden lg:block"
            >
              <div className="w-[280px] h-full">
                <TaskBoard tasks={tasks} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
