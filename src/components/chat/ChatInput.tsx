'use client';

import { useState, useRef, useCallback } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatStore } from "@/lib/chat-store";

interface ChatInputProps {
  onGoalSubmit?: (goal: string) => void;
}

export function ChatInput({ onGoalSubmit }: ChatInputProps) {
  const { sessionStatus, goal, setGoal } = useChatStore();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isIdle = sessionStatus === "idle";
  const isRunning = sessionStatus === "running" || sessionStatus === "paused";
  const canSend = isIdle || isRunning;

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (isIdle && onGoalSubmit) {
      onGoalSubmit(trimmed);
      setGoal(trimmed);
    }
    // For running sessions, user-message is emitted by ChatView

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isIdle, onGoalSubmit, setGoal]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const placeholder = isIdle
    ? "Describe your goal... (e.g., Plan a marketing strategy for a new product)"
    : isRunning
      ? "Send a message to the agents..."
      : goal
        ? "Session complete. Start a new one?"
        : "Describe your goal...";

  return (
    <div className="flex gap-2 items-end p-3 border-t bg-card">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={!canSend}
        className="min-h-[44px] max-h-[120px] resize-none rounded-xl bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-ring/50"
        rows={1}
      />
      <Button
        onClick={handleSend}
        disabled={!canSend || !input.trim()}
        size="icon"
        className="h-11 w-11 shrink-0 rounded-xl"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
