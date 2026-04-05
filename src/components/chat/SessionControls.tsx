'use client';

import { motion } from "framer-motion";
import { Pause, Play, Square, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/lib/chat-store";
import type { Socket } from "socket.io-client";

interface SessionControlsProps {
  socket: Socket | null;
}

export function SessionControls({ socket }: SessionControlsProps) {
  const { sessionStatus, clearSession, goal, selectedAgents } = useChatStore();

  const isRunning = sessionStatus === "running";
  const isPaused = sessionStatus === "paused";
  const isComplete = sessionStatus === "complete";
  const isError = sessionStatus === "error";
  const isIdle = sessionStatus === "idle";

  const handleStart = () => {
    if (!socket || !goal.trim() || !isIdle) return;
    socket.emit("start-session", {
      goal: goal.trim(),
      agents: selectedAgents,
    });
  };

  const handlePause = () => {
    if (!socket || !isRunning) return;
    socket.emit("pause-session");
  };

  const handleResume = () => {
    if (!socket || !isPaused) return;
    socket.emit("resume-session");
  };

  const handleStop = () => {
    if (!socket || (sessionStatus !== "running" && sessionStatus !== "paused"))
      return;
    socket.emit("stop-session");
  };

  const handleReset = () => {
    clearSession();
  };

  return (
    <div className="flex items-center gap-2 p-3 border-t bg-card">
      {isIdle && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1"
        >
          <Button
            onClick={handleStart}
            disabled={!goal.trim()}
            className="w-full rounded-xl font-medium"
            style={{
              background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
            }}
          >
            <Play className="h-4 w-4 mr-2" />
            Start Session
          </Button>
        </motion.div>
      )}

      {isRunning && (
        <>
          <Button
            onClick={handlePause}
            variant="outline"
            size="sm"
            className="rounded-lg flex-1"
          >
            <Pause className="h-4 w-4 mr-1.5" />
            Pause
          </Button>
          <Button
            onClick={handleStop}
            variant="destructive"
            size="sm"
            className="rounded-lg flex-1"
          >
            <Square className="h-4 w-4 mr-1.5" />
            Stop
          </Button>
        </>
      )}

      {isPaused && (
        <>
          <Button
            onClick={handleResume}
            size="sm"
            className="rounded-lg flex-1"
            style={{ background: "linear-gradient(135deg, #10B981, #3B82F6)" }}
          >
            <Play className="h-4 w-4 mr-1.5" />
            Resume
          </Button>
          <Button
            onClick={handleStop}
            variant="destructive"
            size="sm"
            className="rounded-lg flex-1"
          >
            <Square className="h-4 w-4 mr-1.5" />
            Stop
          </Button>
        </>
      )}

      {(isComplete || isError) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1">
          <Button
            onClick={handleReset}
            variant="outline"
            className="w-full rounded-xl"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            New Session
          </Button>
        </motion.div>
      )}
    </div>
  );
}
