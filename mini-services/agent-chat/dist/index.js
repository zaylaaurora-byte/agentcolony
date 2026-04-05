import { createServer } from "http";
import { Server } from "socket.io";
import ZAI from "z-ai-web-dev-sdk";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
const httpServer = createServer();
const io = new Server(httpServer, {
    path: "/",
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 120000,
    pingInterval: 25000,
});
let configFile = null;
function loadConfig() {
    const configPath = join(process.cwd(), "agent-config.json");
    const altPath = join(process.cwd(), "..", "agent-config.json");
    const projectRoot = "/home/z/my-project/agent-config.json";
    const path = existsSync(configPath) ? configPath : existsSync(altPath) ? altPath : existsSync(projectRoot) ? projectRoot : null;
    if (path) {
        try {
            const raw = readFileSync(path, "utf-8");
            configFile = JSON.parse(raw);
            console.log(`✅ Loaded config from ${path}`);
        }
        catch (e) {
            console.error(`⚠️ Failed to parse config: ${e.message}`);
        }
    }
    else {
        console.log("⚠️ No agent-config.json found, using defaults");
    }
    return (configFile ?? {
        context: {},
        agents: {},
        loop: {
            max_iterations: 20,
            auto_improve: true,
            quality_threshold: 8,
            improvement_prompt: "Review the previous output and make it BETTER. Improve quality, fix issues, add polish.",
        },
        tokens: {},
    });
}
function reloadConfig() {
    configFile = loadConfig();
}
// ─── Agent Definitions ──────────────────────────────────────────────────────
const DEFAULT_AGENTS = {
    mastermind: {
        name: "Mastermind",
        role: "planner",
        station: "planning-desk",
        systemPrompt: "You are the Mastermind — a brilliant strategist and planner. You receive goals and break them into tasks. You review results critically. Use [TASK: description] to assign work. Use [COMPLETE] when satisfied. You can SUMMON new agents mid-session: use [SUMMON: worker], [SUMMON: reviewer], or [SUMMON: creative] to bring in help. Keep responses concise.",
    },
    worker: {
        name: "Worker",
        role: "executor",
        station: "workbench",
        systemPrompt: "You are the Worker — a diligent executor who delivers thorough results. Complete tasks thoroughly. Summarize what you produced.",
    },
    reviewer: {
        name: "Reviewer",
        role: "reviewer",
        station: "review-desk",
        systemPrompt: "You are the Reviewer — a quality inspector. Rate quality 1-10. List specific issues and improvements. Be constructive.",
    },
    creative: {
        name: "Creative",
        role: "creative",
        station: "creative-studio",
        systemPrompt: "You are the Creative — an innovator who adds flair. Suggest improvements in UX, design, or approach. Be enthusiastic but practical.",
    },
};
// ─── State ───────────────────────────────────────────────────────────────────
const sessions = new Map();
// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateId() {
    return Math.random().toString(36).substring(2, 11);
}
function buildSystemPrompt(agentId, cfg) {
    const defaults = DEFAULT_AGENTS[agentId];
    const custom = cfg.agents[agentId];
    let prompt = custom?.personality || defaults?.systemPrompt || `You are ${agentId}.`;
    // Add extra context from config
    if (custom?.extra_context) {
        prompt += `\n\n${custom.extra_context}`;
    }
    // Add user context (auto-fed)
    const ctx = cfg.context;
    if (ctx) {
        const parts = [];
        if (ctx.about_user)
            parts.push(`About the user: ${ctx.about_user}`);
        if (ctx.project_info)
            parts.push(`Project info: ${ctx.project_info}`);
        if (ctx.preferences)
            parts.push(`User preferences: ${ctx.preferences}`);
        if (parts.length > 0) {
            prompt += `\n\n--- USER CONTEXT (auto-loaded, do not ask about this) ---\n${parts.join("\n")}\n--- END CONTEXT ---`;
        }
    }
    // Add tokens info (available resources)
    if (cfg.tokens && Object.keys(cfg.tokens).length > 0) {
        const tokenNames = Object.keys(cfg.tokens).map((k) => k.replace(/_.*$/, ""));
        prompt += `\n\nAvailable API resources: ${tokenNames.join(", ")}. The user has pre-configured these access tokens — they are available for use.`;
    }
    return prompt;
}
async function agentChat(session, agentId, userMessage, socket, iteration) {
    const config = loadConfig();
    const defaults = DEFAULT_AGENTS[agentId];
    const conversation = session.conversations.get(agentId);
    if (!conversation)
        throw new Error(`No conversation for agent: ${agentId}`);
    // Add user message to history
    conversation.messages.push({ role: "user", content: userMessage });
    try {
        // Move character to active station
        moveAgent(session, agentId, defaults?.station || "center");
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
            messages: [...conversation.messages],
            temperature: 0.7,
            max_tokens: 2000,
        });
        const assistantContent = completion.choices[0]?.message?.content || "";
        conversation.messages.push({ role: "assistant", content: assistantContent });
        // Emit streaming chunks
        const words = assistantContent.split(" ");
        const chunkSize = Math.max(1, Math.floor(words.length / 20));
        for (let i = 0; i < words.length; i += chunkSize) {
            const chunk = words.slice(i, i + chunkSize).join(" ") + " ";
            socket.emit("agent-stream", { agentId, chunk });
            await new Promise((r) => setTimeout(r, 25));
        }
        // Emit complete message
        const message = {
            agentId,
            agentName: defaults?.name || agentId,
            role: defaults?.role || agentId,
            content: assistantContent,
            timestamp: new Date().toISOString(),
            iteration,
        };
        socket.emit("agent-message", message);
        return assistantContent;
    }
    catch (error) {
        console.error(`Error in agentChat for ${agentId}:`, error.message);
        socket.emit("session-error", { message: `Agent ${agentId} error: ${error.message}` });
        throw error;
    }
}
function moveAgent(session, agentId, station) {
    const pos = session.agentPositions[agentId];
    if (pos) {
        pos.station = station;
        const stationPositions = {
            "planning-desk": { x: 20, y: 25 },
            workbench: { x: 50, y: 60 },
            "review-desk": { x: 80, y: 25 },
            "creative-studio": { x: 50, y: 30 },
            center: { x: 50, y: 45 },
            idle: { x: 15, y: 70 },
        };
        const target = stationPositions[station] || stationPositions.center;
        pos.targetX = target.x;
        pos.targetY = target.y;
        session.socket.emit("agent-move", {
            agentId,
            targetX: pos.targetX,
            targetY: pos.targetY,
            station,
        });
    }
}
function parseQualityScore(text) {
    // Try to find a quality rating like "8/10" or "quality: 7" etc.
    const patterns = [/(\d+)\s*\/\s*10/i, /quality[:\s]*(\d+)/i, /rating[:\s]*(\d+)/i, /score[:\s]*(\d+)/i];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const score = parseInt(match[1]);
            if (score >= 1 && score <= 10)
                return score;
        }
    }
    return 0; // No score found
}
// ─── Main Loop (RimWorld-style) ─────────────────────────────────────────────
async function runAgentLoop(sessionId, goal, agents, socket, session) {
    const config = loadConfig();
    const loopConfig = config.loop;
    let hasWorker = agents.includes("worker");
    let hasReviewer = agents.includes("reviewer");
    let hasCreative = agents.includes("creative");
    // Create conversations with auto-context
    for (const agentId of agents) {
        const systemPrompt = buildSystemPrompt(agentId, config);
        session.conversations.set(agentId, {
            messages: [{ role: "system", content: systemPrompt }],
        });
    }
    try {
        session.status = "running";
        socket.emit("session-status", {
            status: "running",
            maxIterations: loopConfig.max_iterations,
            qualityThreshold: loopConfig.quality_threshold,
        });
        let userContext = "";
        if (session.userMessages.length > 0) {
            userContext =
                "\n\nThe user provided this additional guidance: " + session.userMessages.join("; ");
        }
        // ── Phase 1: Mastermind plans ──
        const planPrompt = `User goal: ${goal}${userContext}

Break this into a clear task plan. Be specific about what needs to be done. Assign the first task using [TASK: description].

Team: ${agents.map((a) => DEFAULT_AGENTS[a]?.name || a).join(", ")}
${!hasWorker ? "NOTE: No Worker available — you must handle execution yourself." : ""}`;
        let masterResponse = await agentChat(session, "mastermind", planPrompt, socket, 0);
        if (masterResponse.includes("[COMPLETE]")) {
            session.status = "complete";
            session.bestOutput = masterResponse;
            socket.emit("session-status", { status: "complete" });
            socket.emit("final-output", { content: session.bestOutput });
            return;
        }
        // ── Phase 2: Iterative Loop ──
        let iteration = 0;
        let currentTask = "";
        let workerOutput = "";
        while (iteration < loopConfig.max_iterations &&
            !session.paused &&
            !session.stopped) {
            iteration++;
            session.currentIteration = iteration;
            socket.emit("iteration-update", {
                iteration,
                maxIterations: loopConfig.max_iterations,
                qualityScore: session.qualityScore,
            });
            // Extract task from mastermind
            const taskMatch = masterResponse.match(/\[TASK:\s*([\s\S]*?)\]/);
            // Check for SUMMON commands
            const summonMatches = [...masterResponse.matchAll(/\[SUMMON:\s*(\w+)\]/gi)];
            for (const summonMatch of summonMatches) {
                const agentToSummon = summonMatch[1].toLowerCase();
                if (DEFAULT_AGENTS[agentToSummon] && !session.agents.includes(agentToSummon)) {
                    session.agents.push(agentToSummon);
                    const config = loadConfig();
                    session.conversations.set(agentToSummon, {
                        messages: [{ role: "system", content: buildSystemPrompt(agentToSummon, config) }],
                    });
                    const idlePositions = [
                        { x: 25, y: 70 }, { x: 40, y: 72 }, { x: 60, y: 72 }, { x: 75, y: 70 },
                    ];
                    const posIdx = session.agents.length - 1;
                    session.agentPositions[agentToSummon] = {
                        x: idlePositions[posIdx]?.x || 50,
                        y: idlePositions[posIdx]?.y || 70,
                        targetX: idlePositions[posIdx]?.x || 50,
                        targetY: idlePositions[posIdx]?.y || 70,
                        station: "idle",
                    };
                    socket.emit("agent-summoned", {
                        agentId: agentToSummon,
                        name: DEFAULT_AGENTS[agentToSummon].name,
                        position: session.agentPositions[agentToSummon],
                    });
                    console.log(`Mastermind summoned: ${agentToSummon}`);
                    // Update has flags
                    if (agentToSummon === "worker")
                        hasWorker = true;
                    if (agentToSummon === "reviewer")
                        hasReviewer = true;
                    if (agentToSummon === "creative")
                        hasCreative = true;
                }
            }
            if (!taskMatch) {
                // No task found — ask if done
                const followUp = await agentChat(session, "mastermind", "No [TASK:] found in your response. If all tasks are done, respond [COMPLETE]. Otherwise assign the next task.", socket, iteration);
                if (followUp.includes("[COMPLETE]"))
                    break;
                masterResponse = followUp;
                continue;
            }
            currentTask = taskMatch[1].trim();
            // Add task to board
            const task = {
                taskId: generateId(),
                status: "in_progress",
                description: currentTask,
                iteration,
            };
            session.tasks.push(task);
            socket.emit("task-update", task);
            // ── Worker executes ──
            if (hasWorker) {
                const improveContext = loopConfig.auto_improve && iteration > 1
                    ? `\n\nThis is iteration ${iteration}. Previous output:\n${workerOutput}\n\n${loopConfig.improvement_prompt.replace("{iteration}", String(iteration))}`
                    : "";
                workerOutput = await agentChat(session, "worker", `Task: ${currentTask}${improveContext}\n\nComplete this thoroughly.`, socket, iteration);
                task.status = "done";
                socket.emit("task-update", task);
                // ── Reviewer rates quality ──
                if (hasReviewer) {
                    const reviewPrompt = `Task: "${currentTask}"\n\nWorker output:\n${workerOutput}\n\nRate quality 1-10. List issues and improvements.`;
                    const review = await agentChat(session, "reviewer", reviewPrompt, socket, iteration);
                    const score = parseQualityScore(review);
                    task.qualityScore = score || 5; // Default if no score parsed
                    session.qualityScore = score;
                    socket.emit("task-update", task);
                    // Check if quality threshold reached
                    if (loopConfig.auto_improve && score >= loopConfig.quality_threshold && score > 0) {
                        // Quality is good enough!
                        const qualityMsg = `Quality score ${score}/${loopConfig.quality_threshold} reached! Stopping improvement loop.`;
                        socket.emit("quality-reached", { score, threshold: loopConfig.quality_threshold });
                        // Let mastermind wrap up
                        const wrapUp = await agentChat(session, "mastermind", `Quality score ${score}/10 reached for task "${currentTask}". The Reviewer is satisfied. Summarize the final result and respond [COMPLETE].`, socket, iteration);
                        if (wrapUp.includes("[COMPLETE]"))
                            break;
                    }
                }
                // ── Creative adds flair ──
                if (hasCreative) {
                    await agentChat(session, "creative", `Task: "${currentTask}"\n\nCurrent output:\n${workerOutput}\n\nAdd your creative input. Suggest improvements.`, socket, iteration);
                }
                // ── Mastermind reviews and decides next step ──
                let reviewContext = `Worker completed: "${currentTask}"\n\nOutput:\n${workerOutput}`;
                if (hasReviewer)
                    reviewContext += `\n\nReviewer scored this ${session.qualityScore || "?"}/10.`;
                if (hasCreative)
                    reviewContext += `\n\nCreative has also given input.`;
                masterResponse = await agentChat(session, "mastermind", `${reviewContext}\n\nIteration ${iteration}/${loopConfig.max_iterations}. ${loopConfig.auto_improve && session.qualityScore < loopConfig.quality_threshold
                    ? `Quality is below ${loopConfig.quality_threshold}/10. Assign improvement task or refine approach.`
                    : "Assign next task or [COMPLETE] if done."}`, socket, iteration);
                if (masterResponse.includes("[COMPLETE]"))
                    break;
                // Move agents back to idle before next round
                for (const id of agents) {
                    if (id !== "mastermind")
                        moveAgent(session, id, "idle");
                }
            }
            else {
                // No worker — mastermind handles everything
                task.status = "done";
                socket.emit("task-update", task);
                const followUp = await agentChat(session, "mastermind", `Task done. Iteration ${iteration}/${loopConfig.max_iterations}. More tasks? [TASK: ...] or [COMPLETE].`, socket, iteration);
                if (followUp.includes("[COMPLETE]"))
                    break;
                masterResponse = followUp;
            }
            // Brief pause between iterations
            await new Promise((r) => setTimeout(r, 800));
        }
        // ── Completion ──
        if (!session.stopped) {
            session.status = "complete";
            session.bestOutput = workerOutput || "Session complete.";
            socket.emit("session-status", { status: "complete" });
            socket.emit("final-output", { content: session.bestOutput });
        }
    }
    catch (error) {
        console.error("Agent loop error:", error.message);
        session.status = "error";
        socket.emit("session-status", { status: "error" });
        socket.emit("session-error", { message: error.message });
    }
}
// ─── Socket Handlers ─────────────────────────────────────────────────────────
io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.on("start-session", async (data) => {
        const { goal, agents } = data;
        const sessionId = generateId();
        console.log(`Starting session ${sessionId}: "${goal}" with [${agents.join(", ")}]`);
        // Initial agent positions (RimWorld-style)
        const agentPositions = {};
        const positions = [
            { x: 15, y: 70 },
            { x: 30, y: 70 },
            { x: 70, y: 70 },
            { x: 85, y: 70 },
        ];
        agents.forEach((id, i) => {
            agentPositions[id] = {
                x: positions[i]?.x || 50,
                y: positions[i]?.y || 70,
                targetX: positions[i]?.x || 50,
                targetY: positions[i]?.y || 70,
                station: "idle",
            };
        });
        const session = {
            sessionId,
            goal,
            agents,
            status: "idle",
            paused: false,
            stopped: false,
            conversations: new Map(),
            tasks: [],
            currentIteration: 0,
            qualityScore: 0,
            bestOutput: "",
            userMessages: [],
            agentPositions,
            socket,
        };
        sessions.set(sessionId, session);
        socket.emit("session-init", {
            sessionId,
            agents,
            agentPositions,
            config: {
                maxIterations: loadConfig().loop.max_iterations,
                qualityThreshold: loadConfig().loop.quality_threshold,
            },
        });
        runAgentLoop(sessionId, goal, agents, socket, session).catch((err) => {
            console.error("Unhandled loop error:", err);
        });
    });
    socket.on("user-message", (data) => {
        for (const [, session] of sessions) {
            if (session.status === "running" || session.status === "paused") {
                session.userMessages.push(data.message);
                console.log(`User intervention: ${data.message}`);
                // Show user message in the world
                const msg = {
                    agentId: "user",
                    agentName: "You",
                    role: "user",
                    content: data.message,
                    timestamp: new Date().toISOString(),
                };
                session.socket.emit("agent-message", msg);
            }
        }
    });
    socket.on("pause-session", () => {
        for (const [, session] of sessions) {
            if (session.status === "running") {
                session.paused = true;
                session.status = "paused";
                session.socket.emit("session-status", { status: "paused" });
            }
        }
    });
    socket.on("resume-session", () => {
        for (const [, session] of sessions) {
            if (session.status === "paused") {
                session.paused = false;
                session.status = "running";
                session.socket.emit("session-status", { status: "running" });
            }
        }
    });
    socket.on("stop-session", () => {
        for (const [, session] of sessions) {
            if (session.status === "running" || session.status === "paused") {
                session.stopped = true;
                session.paused = false;
                session.status = "complete";
                session.socket.emit("session-status", { status: "complete" });
            }
        }
    });
    socket.on("reload-config", () => {
        reloadConfig();
        socket.emit("config-reloaded", { success: true });
    });
    socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});
// ─── Start Server ────────────────────────────────────────────────────────────
const PORT = 3004;
httpServer.listen(PORT, () => {
    console.log(`🎮 AgentChat Service running on port ${PORT}`);
    loadConfig();
});
process.on("SIGTERM", () => {
    httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
    httpServer.close(() => process.exit(0));
});
