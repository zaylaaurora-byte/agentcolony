'use client';

import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Pause, Square, Send, FastForward, RotateCcw,
  MessageCircle, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/lib/chat-store';
import type { SessionStatus } from '@/lib/agent-config';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SimulationControlsProps {
  onGoalSubmit: (goal: string, agents: string[]) => void;
  onSendMessage: (message: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
}

type Speed = 1 | 2 | 3;

// ─── Example Goals ──────────────────────────────────────────────────────────

const EXAMPLE_GOALS = [
  'Plan a coffee shop marketing strategy',
  'Write a sci-fi short story',
  'Design a fitness app',
  'Create a startup pitch',
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function SimulationControls({
  onGoalSubmit,
  onSendMessage,
  onPause,
  onResume,
  onStop,
  onReset,
}: SimulationControlsProps) {
  const store = useChatStore();
  const { sessionStatus, selectedAgents, goal } = store;
  const [inputValue, setInputValue] = useState('');
  const [speed, setSpeed] = useState<Speed>(1);

  const isIdle = sessionStatus === 'idle';
  const isRunning = sessionStatus === 'running';
  const isPaused = sessionStatus === 'paused';
  const isDone = sessionStatus === 'complete' || sessionStatus === 'error';

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    const goalText = inputValue.trim() || goal.trim();
    if (!goalText) return;
    onGoalSubmit(goalText, selectedAgents);
    setInputValue('');
  }, [inputValue, goal, selectedAgents, onGoalSubmit]);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputValue('');
  }, [inputValue, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (isIdle) {
        handleStart();
      } else if (isRunning) {
        handleSend();
      }
    }
  }, [isIdle, isRunning, handleStart, handleSend]);

  const cycleSpeed = useCallback(() => {
    setSpeed(prev => prev === 1 ? 2 : prev === 2 ? 3 : 1);
  }, []);

  const handleExampleClick = useCallback((example: string) => {
    setInputValue(example);
    store.setGoal(example);
  }, [store]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative z-30">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="pointer-events-auto"
      >
        {/* ── Idle State: Goal Input ───────────────────────────────────────── */}
        {isIdle && (
          <div className="max-w-2xl mx-auto px-4 pb-4 space-y-3">
            {/* Example goals */}
            <div className="flex flex-wrap justify-center gap-1.5">
              {EXAMPLE_GOALS.map((ex, i) => (
                <motion.button
                  key={i}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  onClick={() => handleExampleClick(ex)}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 bg-black/30
                    text-white/40 hover:bg-white/10 hover:text-white/70 transition-all backdrop-blur-sm"
                >
                  {ex}
                </motion.button>
              ))}
            </div>

            {/* Goal input + Start */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
                <Input
                  value={inputValue}
                  onChange={e => { setInputValue(e.target.value); store.setGoal(e.target.value); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter your task for the agents..."
                  className="h-10 rounded-lg bg-black/40 border-white/10 text-xs text-white
                    placeholder:text-white/25 backdrop-blur-sm pl-9 pr-3"
                />
              </div>
              <Button
                onClick={handleStart}
                disabled={!inputValue.trim() && !goal.trim()}
                className="h-10 rounded-lg px-5 text-xs font-medium shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                }}
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Start
              </Button>
            </div>
          </div>
        )}

        {/* ── Running / Paused State: Message Input + Controls ─────────────── */}
        {(isRunning || isPaused) && (
          <div className="max-w-2xl mx-auto px-4 pb-4">
            <div className="flex items-center gap-2">
              {/* Message input */}
              <div className="flex-1 relative">
                <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
                <Input
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Say something to help the agents..."
                  disabled={isPaused}
                  className="h-10 rounded-lg bg-black/40 border-white/10 text-xs text-white
                    placeholder:text-white/25 backdrop-blur-sm pl-9 pr-3 disabled:opacity-50"
                />
              </div>

              {/* Send */}
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isPaused}
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-lg border-white/10 bg-black/40 text-white
                  hover:bg-white/10 backdrop-blur-sm shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>

              {/* Pause / Resume */}
              {isRunning && (
                <Button
                  onClick={onPause}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-lg border-white/10 bg-black/40 text-yellow-400
                    hover:bg-yellow-500/10 backdrop-blur-sm shrink-0"
                >
                  <Pause className="h-3.5 w-3.5" />
                </Button>
              )}
              {isPaused && (
                <Button
                  onClick={onResume}
                  size="icon"
                  className="h-10 w-10 rounded-lg bg-emerald-500/20 text-emerald-400
                    border border-emerald-500/20 hover:bg-emerald-500/30 backdrop-blur-sm shrink-0"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              )}

              {/* Speed */}
              <Button
                onClick={cycleSpeed}
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-lg border-white/10 bg-black/40 backdrop-blur-sm shrink-0"
              >
                <FastForward className={cn('h-3.5 w-3.5', speed > 1 && 'text-purple-400')} />
                <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-bold text-white/50">
                  {speed}x
                </span>
              </Button>

              {/* Stop */}
              <Button
                onClick={onStop}
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-lg border-red-500/20 bg-red-500/10 text-red-400
                  hover:bg-red-500/20 backdrop-blur-sm shrink-0"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Complete / Error State: Reset ─────────────────────────────────── */}
        {isDone && (
          <div className="max-w-2xl mx-auto px-4 pb-4">
            <Button
              onClick={onReset}
              variant="outline"
              className="w-full h-10 rounded-lg border-white/10 bg-black/40 text-white
                hover:bg-white/10 backdrop-blur-sm"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              New Task
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
