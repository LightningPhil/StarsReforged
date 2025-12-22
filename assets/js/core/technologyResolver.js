import { TechnologyField } from "../models/technology.js";

const DEFAULT_ALLOCATION = {
    WEAP: 0.25,
    PROP: 0.15,
    CONST: 0.2,
    ELEC: 0.1,
    ENER: 0.15,
    BIOT: 0.1,
    TERR: 0.05
};

const TECH_EFFECTS = {
    WEAP: { shipDamage: 0.05 },
    PROP: { shipSpeed: 0.02, shipRange: 0.02 },
    CONST: { shipCost: -0.03 },
    ELEC: { combatInitiative: 0.02 },
    ENER: { shieldStrength: 0.04 },
    BIOT: { populationGrowth: 0.03 },
    TERR: { habitabilityTolerance: 0.05 }
};

const MAX_TECH_LEVEL = 26;
const RESEARCH_COST_MODES = {
    bleedingEdge: 0.75,
    extra: 1.75,
    less: 0.5
};

const buildFieldMap = (fields = []) => Object.fromEntries(fields.map(field => ([
    field.id,
    new TechnologyField(field.id)
])));

const getFibonacciValue = (index) => {
    let a = 0;
    let b = 1;
    for (let i = 0; i < index; i += 1) {
        const next = a + b;
        a = b;
        b = next;
    }
    return a;
};

const getResearchCostModeMultiplier = (rules, raceModifiers) => {
    const mode = raceModifiers?.researchCostMode ?? rules?.research?.costMode ?? null;
    if (Number.isFinite(mode)) {
        return mode;
    }
    if (typeof mode === "string" && RESEARCH_COST_MODES[mode]) {
        return RESEARCH_COST_MODES[mode];
    }
    return 1;
};

const getOtherFieldLevelSum = (techState, fieldId) => {
    if (!techState?.fields) {
        return 0;
    }
    return Object.values(techState.fields).reduce((sum, field) => (
        sum + (field.id === fieldId ? 0 : (field.level || 0))
    ), 0);
};

const sanitizeAllocation = (allocation, fields) => {
    const sanitized = {};
    let total = 0;
    fields.forEach(field => {
        const value = Number(allocation?.[field.id] ?? 0);
        const clamped = Number.isFinite(value) ? Math.max(0, value) : 0;
        sanitized[field.id] = clamped;
        total += clamped;
    });
    if (total <= 0) {
        return normalizeAllocation(DEFAULT_ALLOCATION, fields);
    }
    return { sanitized, total };
};

export const normalizeAllocation = (allocation, fields, allocationRules = null) => {
    if (!fields?.length) {
        return {};
    }
    const result = sanitizeAllocation(allocation, fields);
    if (!result.sanitized) {
        return result;
    }
    const { sanitized, total } = result;
    if (Math.abs(total - 1) < 0.0001) {
        return sanitized;
    }
    const normalized = {};
    fields.forEach(field => {
        normalized[field.id] = sanitized[field.id] / total;
    });
    if (allocationRules) {
        return allocationRules(normalized, fields);
    }
    return normalized;
};

export const adjustAllocationForField = (allocation, fields, fieldId, share, allocationRules = null) => {
    if (!fields?.length) {
        return {};
    }
    const normalized = normalizeAllocation(allocation, fields, allocationRules);
    const clampedShare = Math.max(0, Math.min(1, share));
    const remaining = 1 - clampedShare;
    const others = fields.filter(field => field.id !== fieldId);
    const otherTotal = others.reduce((sum, field) => sum + (normalized[field.id] || 0), 0);
    const updated = {};
    others.forEach(field => {
        updated[field.id] = otherTotal > 0 ? ((normalized[field.id] || 0) / otherTotal) * remaining : remaining / others.length;
    });
    updated[fieldId] = clampedShare;
    if (allocationRules) {
        return allocationRules(updated, fields);
    }
    return updated;
};

export const createTechnologyState = (fields, allocation = DEFAULT_ALLOCATION, raceModifiers = null) => {
    const techState = {
        fields: buildFieldMap(fields),
        allocation: normalizeAllocation(allocation, fields)
    };
    if (raceModifiers?.startingTechLevels) {
        const globalBonus = raceModifiers.startingTechLevels.ALL || 0;
        Object.values(techState.fields).forEach(field => {
            const bonus = raceModifiers.startingTechLevels[field.id] || 0;
            field.level = Math.min(MAX_TECH_LEVEL, Math.max(1, field.level + globalBonus + bonus));
        });
    }
    return techState;
};

export const getRpToNextLevel = (level, rules, raceModifiers = {}, fieldId = null, techState = null) => {
    if (level >= MAX_TECH_LEVEL) {
        return Number.POSITIVE_INFINITY;
    }
    const baseCost = rules?.research?.baseCost ?? 100;
    const raceMultiplier = Number.isFinite(raceModifiers?.researchCostMultiplier) ? raceModifiers.researchCostMultiplier : 1;
    const fieldMultiplier = fieldId && Number.isFinite(raceModifiers?.researchFieldCostMultiplier?.[fieldId])
        ? raceModifiers.researchFieldCostMultiplier[fieldId]
        : 1;
    const modeMultiplier = getResearchCostModeMultiplier(rules, raceModifiers);
    const fibonacciCost = baseCost * getFibonacciValue(level + 1);
    const crossFieldCost = getOtherFieldLevelSum(techState, fieldId) * 10;
    return Math.floor((fibonacciCost + crossFieldCost) * raceMultiplier * fieldMultiplier * modeMultiplier);
};

export const calculateEmpireResearchPoints = (state, empireId, raceModifiers = {}) => {
    const modifier = state.rules?.research?.populationModifier ?? 0.1;
    const totalPop = state.stars
        .filter(star => star.owner === empireId)
        .reduce((sum, star) => sum + star.pop, 0);
    const raceBonus = Number.isFinite(raceModifiers?.researchPointMultiplier) ? raceModifiers.researchPointMultiplier : 1;
    return totalPop * modifier * raceBonus;
};

export const resolveResearchForEmpire = (techState, totalRP, rules, raceModifiers = {}) => {
    if (!techState || !techState.fields) {
        return;
    }
    const allocations = techState.allocation || {};
    Object.values(techState.fields).forEach(field => {
        if (field.level >= MAX_TECH_LEVEL) {
            field.level = MAX_TECH_LEVEL;
            field.storedRP = 0;
            return;
        }
        const share = allocations[field.id] ?? 0;
        const fieldBonus = raceModifiers?.researchFieldBonus?.[field.id] || 0;
        field.storedRP += totalRP * share * (1 + fieldBonus);
        let threshold = getRpToNextLevel(field.level, rules, raceModifiers, field.id, techState);
        while (field.storedRP >= threshold && threshold > 0 && field.level < MAX_TECH_LEVEL) {
            field.storedRP -= threshold;
            field.level += 1;
            threshold = getRpToNextLevel(field.level, rules, raceModifiers, field.id, techState);
        }
        if (field.level >= MAX_TECH_LEVEL) {
            field.level = MAX_TECH_LEVEL;
            field.storedRP = 0;
        }
    });
};

export const getTechnologyStateForEmpire = (state, empireId) => state.players
    .find(player => player.id === empireId)?.technology ?? null;

export const getTotalTechLevels = (techState) => {
    if (!techState?.fields) {
        return 0;
    }
    return Object.values(techState.fields).reduce((sum, field) => sum + (field.level || 0), 0);
};

export const getTechnologyModifiers = (techState) => {
    const modifiers = {
        shipDamage: 1,
        shipSpeed: 1,
        shipRange: 1,
        shipCost: 1,
        combatInitiative: 1,
        shieldStrength: 1,
        populationGrowth: 1,
        habitabilityTolerance: 0
    };

    if (!techState?.fields) {
        return modifiers;
    }

    Object.values(techState.fields).forEach(field => {
        const effects = TECH_EFFECTS[field.id];
        if (!effects) {
            return;
        }
        Object.entries(effects).forEach(([key, value]) => {
            if (key === "shipCost") {
                modifiers.shipCost *= Math.max(0.1, 1 + (value * field.level));
            } else if (key === "habitabilityTolerance") {
                modifiers.habitabilityTolerance += value * field.level;
            } else {
                modifiers[key] *= 1 + (value * field.level);
            }
        });
    });

    return modifiers;
};
