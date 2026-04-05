'use client';

import { motion } from "framer-motion";
import { AGENT_CONFIG, type AgentId } from "@/lib/agent-config";
import { cn } from "@/lib/utils";

interface AgentAvatarProps {
  agentId: AgentId;
  isActive?: boolean;
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
};

const badgeSizeClasses = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
  lg: "text-xs px-2 py-0.5",
};

export function AgentAvatar({
  agentId,
  isActive = false,
  size = "md",
  showBadge = true,
}: AgentAvatarProps) {
  const config = AGENT_CONFIG[agentId];
  if (!config) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.div
        className={cn("relative", sizeClasses[size])}
        animate={isActive ? { scale: [1, 1.05, 1] } : {}}
        transition={isActive ? { duration: 2, repeat: Infinity } : {}}
      >
        {isActive && (
          <motion.div
            className="absolute inset-0 rounded-full animate-pulse-glow"
            style={{ backgroundColor: config.color, opacity: 0.3 }}
          />
        )}
        <div
          className={cn(
            "relative rounded-full overflow-hidden border-2 transition-all duration-300",
            sizeClasses[size],
            isActive ? "shadow-lg" : "border-transparent"
          )}
          style={{ borderColor: config.color }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={config.avatar}
            alt={config.name}
            className="w-full h-full object-cover rounded-full"
          />
        </div>
        {isActive && (
          <motion.div
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
            style={{ backgroundColor: config.color }}
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </motion.div>
      {showBadge && (
        <span
          className={cn(
            "rounded-full font-medium text-white whitespace-nowrap",
            badgeSizeClasses[size]
          )}
          style={{ backgroundColor: config.color }}
        >
          {config.name}
        </span>
      )}
    </div>
  );
}
