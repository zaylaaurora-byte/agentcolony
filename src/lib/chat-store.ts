import { create } from "zustand";
import type { AgentMessage, Task, SessionStatus } from "./agent-config";

interface ChatStore {
  messages: AgentMessage[];
  streamingContent: Record<string, string>;
  tasks: Task[];
  sessionStatus: SessionStatus;
  selectedAgents: string[];
  connected: boolean;
  goal: string;

  addMessage: (msg: AgentMessage) => void;
  appendStream: (agentId: string, chunk: string) => void;
  clearStream: (agentId: string) => void;
  updateTask: (task: Task) => void;
  setSessionStatus: (status: SessionStatus) => void;
  toggleAgent: (agentId: string) => void;
  setConnected: (connected: boolean) => void;
  setGoal: (goal: string) => void;
  clearSession: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  streamingContent: {},
  tasks: [],
  sessionStatus: "idle",
  selectedAgents: ["mastermind", "worker"],
  connected: false,
  goal: "",

  addMessage: (msg) =>
    set((state) => {
      const newStreaming = { ...state.streamingContent };
      delete newStreaming[msg.agentId];
      return { messages: [...state.messages, msg], streamingContent: newStreaming };
    }),

  appendStream: (agentId, chunk) =>
    set((state) => ({
      streamingContent: {
        ...state.streamingContent,
        [agentId]: (state.streamingContent[agentId] || "") + chunk,
      },
    })),

  clearStream: (agentId) =>
    set((state) => {
      const newStreaming = { ...state.streamingContent };
      delete newStreaming[agentId];
      return { streamingContent: newStreaming };
    }),

  updateTask: (task) =>
    set((state) => {
      const existing = state.tasks.findIndex((t) => t.taskId === task.taskId);
      if (existing >= 0) {
        const newTasks = [...state.tasks];
        newTasks[existing] = task;
        return { tasks: newTasks };
      }
      return { tasks: [...state.tasks, task] };
    }),

  setSessionStatus: (status) => set({ sessionStatus: status }),

  toggleAgent: (agentId) =>
    set((state) => {
      const isSelected = state.selectedAgents.includes(agentId);
      // Mastermind must always be selected
      if (agentId === "mastermind" && isSelected) return state;
      // Mastermind must be selected if nothing else is
      if (!isSelected && !state.selectedAgents.includes("mastermind")) {
        return { selectedAgents: ["mastermind", agentId] };
      }
      return {
        selectedAgents: isSelected
          ? state.selectedAgents.filter((id) => id !== agentId)
          : [...state.selectedAgents, agentId],
      };
    }),

  setConnected: (connected) => set({ connected }),

  setGoal: (goal) => set({ goal }),

  clearSession: () =>
    set({
      messages: [],
      streamingContent: {},
      tasks: [],
      sessionStatus: "idle",
      goal: "",
    }),
}));
