'use client';

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { AGENT_CONFIG, type AgentId } from "@/lib/agent-config";
import { useChatStore } from "@/lib/chat-store";
import { cn } from "@/lib/utils";

export function AgentSelector() {
  const { selectedAgents, toggleAgent, sessionStatus } = useChatStore();
  const isLocked = sessionStatus !== "idle";

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground/80 px-1">
        Select Agents
      </h3>
      <div className="space-y-2">
        {(Object.keys(AGENT_CONFIG) as AgentId[]).map((agentId) => {
          const config = AGENT_CONFIG[agentId];
          const isSelected = selectedAgents.includes(agentId);
          const isMastermind = agentId === "mastermind";

          return (
            <motion.button
              key={agentId}
              whileHover={!isLocked ? { scale: 1.02 } : {}}
              whileTap={!isLocked ? { scale: 0.98 } : {}}
              onClick={() => !isLocked && toggleAgent(agentId)}
              disabled={isLocked && !isMastermind}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left",
                isSelected
                  ? "border-border/60 bg-muted/40 shadow-sm"
                  : "border-border/30 bg-card/50 opacity-60 hover:opacity-80",
                isLocked && !isMastermind && "cursor-not-allowed",
                isLocked && isMastermind && "cursor-default"
              )}
              style={
                isSelected
                  ? { borderLeftColor: config.color, borderLeftWidth: "3px" }
                  : {}
              }
            >
              <div className="relative w-9 h-9 shrink-0">
                <div
                  className="w-full h-full rounded-full overflow-hidden border-2"
                  style={{ borderColor: isSelected ? config.color : "transparent" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={config.avatar}
                    alt={config.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                {isSelected && (
                  <motion.div
                    className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-background"
                    style={{ backgroundColor: config.color }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500 }}
                  >
                    <Check className="h-2.5 w-2.5 text-white" />
                  </motion.div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: isSelected ? config.color : undefined }}
                >
                  {config.name}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  {config.description}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
