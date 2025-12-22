export const DEFAULT_RULES = {
    maxTurns: 250,
    research: {
        baseCost: 100,
        costExponent: 1.5,
        populationModifier: 0.1
    },
    victory: {
        economicSupremacyThreshold: 0.6,
        planetShareThreshold: 0.6,
        productionCapacityShareThreshold: 0.6,
        techMilestoneTotal: 30,
        scoreThreshold: 2000,
        capitalShipCountThreshold: 5,
        capitalShipHullIds: ["battleship"],
        maxYear: 2600,
        maxTurns: 250,
        enabled: {
            totalAnnihilation: true,
            economicSupremacy: true,
            planetShare: true,
            techMilestones: true,
            scoreThreshold: true,
            productionCapacity: true,
            capitalShips: true,
            yearLimit: true,
            turnLimit: true
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
    },
    minefields: {
        types: {
            standard: { sweepResistance: 1.0, damageMultiplier: 1.0, decayRate: 0.05 },
            heavy: { sweepResistance: 1.5, damageMultiplier: 1.25, decayRate: 0.03 },
            smart: { sweepResistance: 2.0, damageMultiplier: 1.5, decayRate: 0.02 }
        }
    },
    hulls: []
};

export const DEFAULT_TECH_FIELDS = {
    fields: [
        { id: "WEAP", name: "Weapons", description: "Increases combat damage." },
        { id: "PROP", name: "Propulsion", description: "Increases ship speed and range." },
        { id: "CONST", name: "Construction", description: "Reduces ship build cost." },
        { id: "ELEC", name: "Electronics", description: "Improves targeting and initiative." },
        { id: "ENER", name: "Energy", description: "Improves shields and power." },
        { id: "BIOT", name: "Biotechnology", description: "Improves population growth." },
        { id: "TERR", name: "Terraforming", description: "Improves planet habitability." }
    ]
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
    const [rules, ai, technologyFields] = await Promise.all([
        safeFetchJson("./config/gameRules.json", DEFAULT_RULES),
        safeFetchJson("./config/ai.json", DEFAULT_AI_CONFIG),
        safeFetchJson("./config/technologyFields.json", DEFAULT_TECH_FIELDS)
    ]);

    return {
        rules: {
            ...DEFAULT_RULES,
            ...rules,
            research: { ...DEFAULT_RULES.research, ...(rules?.research || {}) },
            victory: {
                ...DEFAULT_RULES.victory,
                ...(rules?.victory || {}),
                enabled: { ...DEFAULT_RULES.victory.enabled, ...(rules?.victory?.enabled || {}) }
            },
            minefields: { ...DEFAULT_RULES.minefields, ...(rules?.minefields || {}) },
            hulls: rules?.hulls?.length ? rules.hulls : DEFAULT_RULES.hulls,
            technologyFields: technologyFields?.fields?.length ? technologyFields.fields : DEFAULT_TECH_FIELDS.fields
        },
        ai: { ...DEFAULT_AI_CONFIG, ...ai, difficulty: { ...DEFAULT_AI_CONFIG.difficulty, ...(ai?.difficulty || {}) } }
    };
};
