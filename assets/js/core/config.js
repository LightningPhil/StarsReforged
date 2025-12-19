export const DEFAULT_RULES = {
    maxTurns: 60,
    victoryConditions: {
        totalDomination: true,
        elimination: true,
        turnLimit: true
    },
    scoring: {
        starValue: 1200,
        resourceValue: 1,
        unitValue: 60,
        turnEfficiency: {
            enabled: false,
            value: 5
        },
        aggression: {
            enabled: false,
            value: 150
        }
    },
    startingResources: {
        human: {
            credits: 1000,
            mineralStock: { i: 2000, b: 1500, g: 1500 }
        },
        ai: {
            credits: 800,
            mineralStock: { i: 1500, b: 1000, g: 1000 }
        }
    }
};

export const DEFAULT_AI_CONFIG = {
    aiPlayers: [2],
    defaultDifficulty: "normal",
    maxTurnTimeMs: 100,
    difficulty: {
        easy: {
            aggression: 0.3,
            riskTolerance: 0.2,
            lookaheadDepth: 1
        },
        normal: {
            aggression: 0.6,
            riskTolerance: 0.5,
            lookaheadDepth: 2
        },
        hard: {
            aggression: 0.85,
            riskTolerance: 0.8,
            lookaheadDepth: 3
        }
    }
};

const safeFetchJson = async (path, fallback) => {
    if (typeof fetch !== "function") {
        return fallback;
    }
    try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) {
            return fallback;
        }
        return await response.json();
    } catch (error) {
        return fallback;
    }
};

export const loadConfig = async () => {
    const [rules, ai] = await Promise.all([
        safeFetchJson("./config/gameRules.json", DEFAULT_RULES),
        safeFetchJson("./config/ai.json", DEFAULT_AI_CONFIG)
    ]);

    return {
        rules: { ...DEFAULT_RULES, ...rules, scoring: { ...DEFAULT_RULES.scoring, ...(rules?.scoring || {}) } },
        ai: { ...DEFAULT_AI_CONFIG, ...ai, difficulty: { ...DEFAULT_AI_CONFIG.difficulty, ...(ai?.difficulty || {}) } }
    };
};
