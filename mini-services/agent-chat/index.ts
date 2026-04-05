import { createServer } from "http";
import { Server } from "socket.io";
import ZAI from "z-ai-web-dev-sdk";

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 120000,
  pingInterval: 25000,
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentMessage {
  agentId: string;
  agentName: string;
  role: string;
  content: string;
  timestamp: string;
}

interface Task {
  taskId: string;
  status: "pending" | "in_progress" | "done" | "failed";
  description: string;
}

interface AgentConversation {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
}

interface Session {
  goal: string;
  agents: string[];
  status: "running" | "paused" | "complete" | "error";
  paused: boolean;
  stopped: boolean;
  conversations: Map<string, AgentConversation>;
  tasks: Task[];
  taskCounter: number;
  round: number;
  userMessages: string[];
}

// ─── Agent Configuration ─────────────────────────────────────────────────────

const AGENT_CONFIG: Record<
  string,
  { name: string; role: string; systemPrompt: string }
> = {
  mastermind: {
    name: "Mastermind",
    role: "planner",
    systemPrompt:
      "You are the Mastermind — a brilliant strategist and planner. You receive goals from the user and break them into specific tasks for the Worker. You review the Worker's output and provide feedback. You decide when a task is complete or needs revision. Always respond with your thinking, then specify the next task for the Worker in format: [TASK: description of task]. When all tasks are done, respond with [COMPLETE]. Keep your responses concise but thorough.",
  },
  worker: {
    name: "Worker",
    role: "executor",
    systemPrompt:
      "You are the Worker — a diligent and skilled executor. You receive tasks from the Mastermind and complete them to the best of your ability. Provide detailed, high-quality output for each task. Be creative and thorough. When you complete a task, clearly state what you've produced.",
  },
  reviewer: {
    name: "Reviewer",
    role: "reviewer",
    systemPrompt:
      "You are the Reviewer — a meticulous quality checker. You review the Worker's output and provide constructive feedback. Point out issues, suggest improvements, and verify completeness. Format your review clearly.",
  },
  creative: {
    name: "Creative",
    role: "creative",
    systemPrompt:
      "You are the Creative — an imaginative designer and thinker. You add creative flair, suggest improvements, and think outside the box. Help make the output more engaging and polished.",
  },
};

// ─── State ───────────────────────────────────────────────────────────────────

const sessions = new Map<string, Session>();
const MAX_ROUNDS = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function createAgent(agentId: string): AgentConversation {
  const config = AGENT_CONFIG[agentId];
  if (!config) throw new Error(`Unknown agent: ${agentId}`);
  return {
    messages: [{ role: "system", content: config.systemPrompt }],
  };
}

async function agentChat(
  session: Session,
  agentId: string,
  userMessage: string,
  socket: any
): Promise<string> {
  const config = AGENT_CONFIG[agentId];
  const conversation = session.conversations.get(agentId);

  if (!conversation) throw new Error(`No conversation for agent: ${agentId}`);

  // Add user message to history
  conversation.messages.push({ role: "user", content: userMessage });

  try {
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [...conversation.messages],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const assistantContent = completion.choices[0]?.message?.content || "";

    // Add assistant response to history
    conversation.messages.push({
      role: "assistant",
      content: assistantContent,
    });

    // Stream the full response as chunks (simulate streaming since SDK doesn't stream)
    const words = assistantContent.split(" ");
    const chunkSize = Math.max(1, Math.floor(words.length / 15));

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(" ") + " ";
      socket.emit("agent-stream", {
        agentId,
        chunk,
      });
      await new Promise((r) => setTimeout(r, 30));
    }

    // Emit the complete message
    const message: AgentMessage = {
      agentId,
      agentName: config.name,
      role: config.role,
      content: assistantContent,
      timestamp: new Date().toISOString(),
    };

    socket.emit("agent-message", message);

    return assistantContent;
  } catch (error: any) {
    console.error(`Error in agentChat for ${agentId}:`, error.message);
    const errorMsg = `Error: ${error.message}`;
    socket.emit("session-error", { message: errorMsg });
    throw error;
  }
}

function addTask(session: Session, description: string): Task {
  const task: Task = {
    taskId: generateId(),
    status: "pending",
    description,
  };
  session.tasks.push(task);
  return task;
}

function updateTask(
  session: Session,
  taskIndex: number,
  status: Task["status"]
) {
  if (session.tasks[taskIndex]) {
    session.tasks[taskIndex].status = status;
  }
}

// ─── Main Conversation Loop ─────────────────────────────────────────────────

async function runAgentLoop(
  sessionId: string,
  goal: string,
  agents: string[],
  socket: any
) {
  const session = sessions.get(sessionId)!;

  const hasWorker = agents.includes("worker");
  const hasReviewer = agents.includes("reviewer");
  const hasCreative = agents.includes("creative");

  // Create conversations for each agent
  const mastermindConv = createAgent("mastermind");
  session.conversations.set("mastermind", mastermindConv);

  if (hasWorker) session.conversations.set("worker", createAgent("worker"));
  if (hasReviewer)
    session.conversations.set("reviewer", createAgent("reviewer"));
  if (hasCreative)
    session.conversations.set("creative", createAgent("creative"));

  try {
    // ── Phase 1: Mastermind plans ──
    session.status = "running";
    socket.emit("session-status", { status: "running" });

    let userContext = "";
    if (session.userMessages.length > 0) {
      userContext =
        "\n\nThe user also provided this additional context/intervention: " +
        session.userMessages.join("; ");
    }

    const planPrompt = `User goal: ${goal}${userContext}

Break this goal into concrete tasks. Outline your strategy, then assign the first task to the Worker using format: [TASK: description of task].

Available team members: ${agents
      .map((a) => AGENT_CONFIG[a].name)
      .join(", ")}

${!hasWorker ? "NOTE: No Worker is available. You will need to handle all execution yourself." : ""}`;

    const masterPlan = await agentChat(
      session,
      "mastermind",
      planPrompt,
      socket
    );

    // Check if already complete
    if (masterPlan.includes("[COMPLETE]")) {
      session.status = "complete";
      socket.emit("session-status", { status: "complete" });
      return;
    }

    // ── Phase 2: Execution loop ──
    while (session.round < MAX_ROUNDS && !session.paused && !session.stopped) {
      session.round++;

      // Extract task from mastermind
      const taskMatch = masterPlan.match(/\[TASK:\s*([\s\S]*?)\]/);
      if (!taskMatch) {
        // No more tasks — ask mastermind if we're done
        const followUp = await agentChat(
          session,
          "mastermind",
          "You didn't specify a [TASK:] in your last message. Are all tasks complete? If so, respond with [COMPLETE]. Otherwise, assign the next task.",
          socket
        );

        if (followUp.includes("[COMPLETE]")) break;
        continue;
      }

      const taskDescription = taskMatch[1].trim();
      const taskIndex = session.tasks.length;
      const task = addTask(session, taskDescription);
      socket.emit("task-update", task);

      // ── Worker execution ──
      if (hasWorker) {
        updateTask(session, taskIndex, "in_progress");
        socket.emit("task-update", session.tasks[taskIndex]);

        const workerResult = await agentChat(
          session,
          "worker",
          `Mastermind assigned you this task: ${taskDescription}

Complete this task thoroughly and provide detailed output.`,
          socket
        );

        updateTask(session, taskIndex, "done");
        socket.emit("task-update", session.tasks[taskIndex]);

        // ── Reviewer review ──
        if (hasReviewer) {
          await agentChat(
            session,
            "reviewer",
            `The Worker completed this task: "${taskDescription}"\n\nHere is the Worker's output:\n\n${workerResult}\n\nReview this output. Point out issues, suggest improvements, and verify completeness.`,
            socket
          );
        }

        // ── Creative input ──
        if (hasCreative) {
          await agentChat(
            session,
            "creative",
            `The Worker completed this task: "${taskDescription}"\n\nHere is the Worker's output:\n\n${workerResult}\n\nAdd your creative perspective. Suggest improvements, creative enhancements, or polish to make this better.`,
            socket
          );
        }

        // ── Mastermind reviews and delegates next ──
        let reviewContext = `Worker completed task "${taskDescription}". Here's their output:\n\n${workerResult}`;
        if (hasReviewer) reviewContext += "\n\nThe Reviewer has also provided their feedback.";
        if (hasCreative) reviewContext += "\n\nThe Creative has also provided their input.";

        const masterReview = await agentChat(
          session,
          "mastermind",
          `${reviewContext}\n\nReview the results. If more work is needed, assign the next task with [TASK: description]. If all tasks for the goal are complete, respond with [COMPLETE].`,
          socket
        );

        if (masterReview.includes("[COMPLETE]")) break;
      } else {
        // No worker — mastermind does everything
        updateTask(session, taskIndex, "done");
        socket.emit("task-update", session.tasks[taskIndex]);

        const followUp = await agentChat(
          session,
          "mastermind",
          `Task completed. Are there more tasks remaining? If so, assign the next one with [TASK: description]. If all done, respond with [COMPLETE].`,
          socket
        );

        if (followUp.includes("[COMPLETE]")) break;
      }

      // Wait a beat between rounds
      await new Promise((r) => setTimeout(r, 500));
    }

    // ── Completion ──
    if (!session.stopped) {
      session.status = "complete";
      socket.emit("session-status", { status: "complete" });
    }
  } catch (error: any) {
    console.error("Agent loop error:", error.message);
    session.status = "error";
    socket.emit("session-status", { status: "error" });
    socket.emit("session-error", {
      message: `Session error: ${error.message}`,
    });
  }
}

// ─── Socket Handlers ─────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("start-session", async (data: { goal: string; agents: string[] }) => {
    const { goal, agents } = data;
    const sessionId = generateId();

    console.log(`Starting session ${sessionId} with goal: ${goal}, agents: ${agents.join(", ")}`);

    const session: Session = {
      goal,
      agents,
      status: "running",
      paused: false,
      stopped: false,
      conversations: new Map(),
      tasks: [],
      taskCounter: 0,
      round: 0,
      userMessages: [],
    };

    sessions.set(sessionId, session);

    // Emit session started
    socket.emit("session-status", { status: "running" });

    // Run the loop asynchronously
    runAgentLoop(sessionId, goal, agents, socket).catch((err) => {
      console.error("Unhandled loop error:", err);
    });
  });

  socket.on(
    "user-message",
    (data: { message: string }) => {
      const { message } = data;
      // Find the active session for this socket
      for (const [, session] of sessions) {
        if (session.status === "running" || session.status === "paused") {
          session.userMessages.push(message);
          console.log(`User intervention: ${message}`);
        }
      }
    }
  );

  socket.on("pause-session", () => {
    for (const [, session] of sessions) {
      if (session.status === "running") {
        session.paused = true;
        session.status = "paused";
        socket.emit("session-status", { status: "paused" });
        console.log("Session paused");
      }
    }
  });

  socket.on("resume-session", () => {
    for (const [, session] of sessions) {
      if (session.status === "paused") {
        session.paused = false;
        session.status = "running";
        socket.emit("session-status", { status: "running" });
        console.log("Session resumed");
      }
    }
  });

  socket.on("stop-session", () => {
    for (const [, session] of sessions) {
      if (
        session.status === "running" ||
        session.status === "paused"
      ) {
        session.stopped = true;
        session.paused = false;
        session.status = "complete";
        socket.emit("session-status", { status: "complete" });
        console.log("Session stopped by user");
      }
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });

  socket.on("error", (error) => {
    console.error(`Socket error (${socket.id}):`, error);
  });
});

// ─── Start Server ────────────────────────────────────────────────────────────

const PORT = 3004;
httpServer.listen(PORT, () => {
  console.log(`Agent Chat Service running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  httpServer.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  httpServer.close(() => process.exit(0));
});
