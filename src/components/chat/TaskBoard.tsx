'use client';

import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, AlertCircle, Loader2 } from "lucide-react";
import type { Task } from "@/lib/agent-config";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface TaskBoardProps {
  tasks: Task[];
}

const statusConfig = {
  pending: {
    icon: Circle,
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    label: "Pending",
  },
  in_progress: {
    icon: Loader2,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    label: "In Progress",
  },
  done: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    label: "Done",
  },
  failed: {
    icon: AlertCircle,
    color: "text-red-400",
    bg: "bg-red-400/10",
    label: "Failed",
  },
};

export function TaskBoard({ tasks }: TaskBoardProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Task Board
          <span className="ml-auto text-xs text-muted-foreground">
            {tasks.filter((t) => t.status === "done").length}/{tasks.length}
          </span>
        </h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No tasks yet. Start a session to see tasks here.
            </p>
          ) : (
            tasks.map((task, index) => {
              const config = statusConfig[task.status];
              const Icon = config.icon;
              return (
                <motion.div
                  key={task.taskId}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    "flex items-start gap-2 p-2.5 rounded-lg border text-xs",
                    config.bg,
                    "border-border/50"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 mt-0.5 shrink-0",
                      config.color,
                      task.status === "in_progress" && "animate-spin"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground/90 leading-relaxed break-words">
                      {task.description}
                    </p>
                    <span className={cn("text-[10px] font-medium", config.color)}>
                      {config.label}
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
