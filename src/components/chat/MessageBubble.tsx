'use client';

import { motion } from "framer-motion";
import { AGENT_CONFIG, type AgentMessage } from "@/lib/agent-config";
import { AgentAvatar } from "./AgentAvatar";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: AgentMessage;
  isStreaming?: boolean;
  streamContent?: string;
}

export function MessageBubble({
  message,
  isStreaming,
  streamContent,
}: MessageBubbleProps) {
  const config = AGENT_CONFIG[message.agentId as keyof typeof AGENT_CONFIG];
  const content = isStreaming ? streamContent : message.content;

  if (!config) return null;

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("flex gap-3 p-3 rounded-xl transition-colors", "hover:bg-muted/50")}
    >
      <div className="shrink-0 mt-0.5">
        <AgentAvatar agentId={message.agentId as keyof typeof AGENT_CONFIG} isActive={isStreaming} size="sm" showBadge={false} />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color: config.color }}
          >
            {message.agentName}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full text-white/90 font-medium"
            style={{ backgroundColor: config.color + "40" }}
          >
            {message.role}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">{time}</span>
        </div>
        <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
          {content}
          {isStreaming && (
            <motion.span
              className="inline-block ml-1"
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              ▊
            </motion.span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
