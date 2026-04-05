export const AGENT_CONFIG = {
  mastermind: {
    id: "mastermind",
    name: "Mastermind",
    avatar: "/avatars/mastermind.png",
    color: "#8B5CF6",
    description: "Strategic planner who breaks goals into tasks",
    role: "planner",
  },
  worker: {
    id: "worker",
    name: "Worker",
    avatar: "/avatars/worker.png",
    color: "#F97316",
    description: "Diligent executor who completes assigned tasks",
    role: "executor",
  },
  reviewer: {
    id: "reviewer",
    name: "Reviewer",
    avatar: "/avatars/reviewer.png",
    color: "#10B981",
    description: "Quality checker who reviews and improves output",
    role: "reviewer",
  },
  creative: {
    id: "creative",
    name: "Creative",
    avatar: "/avatars/creative.png",
    color: "#EC4899",
    description: "Creative thinker who adds flair and polish",
    role: "creative",
  },
} as const;

export type AgentId = keyof typeof AGENT_CONFIG;

export interface AgentMessage {
  agentId: string;
  agentName: string;
  role: string;
  content: string;
  timestamp: string;
}

export interface Task {
  taskId: string;
  status: "pending" | "in_progress" | "done" | "failed";
  description: string;
}

export type SessionStatus =
  | "idle"
  | "running"
  | "paused"
  | "complete"
  | "error";
