import { AIController } from "./AIController.js";
import { PCG32 } from "../core/rng.js";

const runTurns = ({ seed, tasks }) => {
    const rng = new PCG32(BigInt(seed), 54n);
    const rollCalls = [];
    const roll = (max) => {
        rollCalls.push(max);
        return rng.nextInt(max);
    };

    const results = tasks.map(task => {
        const result = AIController.runTurn(task.state, task.playerId, task.difficulty, {
            roll,
            maxTimeMs: task.maxTimeMs
        });
        return {
            playerId: task.playerId,
            intent: result.intent,
            orders: result.orders
        };
    });

    return { results, rollCalls };
};

self.addEventListener("message", (event) => {
    const { type, payload } = event.data || {};
    if (type !== "RUN_AI_TURNS") {
        return;
    }
    try {
        const { requestId, seed, tasks } = payload || {};
        const output = runTurns({ seed, tasks });
        self.postMessage({
            type: "AI_TURN_RESULTS",
            payload: { requestId, ...output }
        });
    } catch (error) {
        self.postMessage({
            type: "AI_TURN_RESULTS",
            payload: { requestId: payload?.requestId, error: error?.message || "AI worker error." }
        });
    }
});
