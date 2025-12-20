const RACE_POINT_LIMITS = {
    min: 0,
    max: 10
};

const TRAIT_CATALOG = {
    adaptive_biology: {
        id: "adaptive_biology",
        name: "Adaptive Biology",
        type: "primary",
        cost: 4,
        exclusiveGroup: "physiology",
        modifiers: {
            populationGrowth: 1.08,
            habitabilityWidthBonus: 0.2
        }
    },
    cybernetic_industry: {
        id: "cybernetic_industry",
        name: "Cybernetic Industry",
        type: "primary",
        cost: 4,
        exclusiveGroup: "physiology",
        modifiers: {
            shipCostMultiplier: 0.92,
            researchCostMultiplier: 1.05,
            researchPointMultiplier: 1.05
        }
    },
    psionic_innovators: {
        id: "psionic_innovators",
        name: "Psionic Innovators",
        type: "primary",
        cost: 4,
        exclusiveGroup: "physiology",
        modifiers: {
            researchCostMultiplier: 0.9,
            researchFieldBonus: { ELEC: 0.08, ENER: 0.05 },
            allocationMin: { ELEC: 0.08 }
        }
    },
    rapid_breeding: {
        id: "rapid_breeding",
        name: "Rapid Breeding",
        type: "lesser",
        cost: 2,
        exclusiveGroup: "growth",
        modifiers: {
            populationGrowth: 1.05
        }
    },
    starwrights: {
        id: "starwrights",
        name: "Starwrights",
        type: "lesser",
        cost: 2,
        exclusiveGroup: "industry",
        modifiers: {
            shipCostMultiplier: 0.95
        }
    },
    data_sages: {
        id: "data_sages",
        name: "Data Sages",
        type: "lesser",
        cost: 2,
        exclusiveGroup: "research",
        modifiers: {
            researchCostMultiplier: 0.95,
            researchFieldBonus: { BIOT: 0.05 }
        }
    },
    rad_immune: {
        id: "rad_immune",
        name: "Rad-Immune",
        type: "lesser",
        cost: 3,
        exclusiveGroup: "environment",
        modifiers: {
            habitabilityImmunity: { rad: true }
        }
    },
    grav_resilience: {
        id: "grav_resilience",
        name: "Gravity Resilience",
        type: "lesser",
        cost: 2,
        exclusiveGroup: "environment",
        modifiers: {
            habitabilityWidthBonus: 0.1
        }
    },
    compact_shipyards: {
        id: "compact_shipyards",
        name: "Compact Shipyards",
        type: "lesser",
        cost: 2,
        exclusiveGroup: "industry",
        modifiers: {
            restrictedHulls: ["bb"],
            shipCostMultiplier: 0.9
        }
    }
};

const buildBaseModifiers = () => ({
    populationGrowth: 1,
    shipCostMultiplier: 1,
    researchCostMultiplier: 1,
    researchPointMultiplier: 1,
    habitabilityWidthBonus: 0,
    habitabilityImmunity: { grav: false, temp: false, rad: false },
    restrictedHulls: [],
    restrictedComponents: [],
    allocationMin: {},
    allocationMax: {},
    researchFieldBonus: {}
});

const mergeModifierLists = (target, additions) => {
    additions.forEach(item => {
        if (!target.includes(item)) {
            target.push(item);
        }
    });
};

const mergeAllocationBounds = (target, updates, pick) => {
    Object.entries(updates || {}).forEach(([field, value]) => {
        const next = Math.max(0, Math.min(1, value));
        if (typeof target[field] !== "number") {
            target[field] = next;
            return;
        }
        target[field] = pick(target[field], next);
    });
};

const mergeFieldBonuses = (target, updates) => {
    Object.entries(updates || {}).forEach(([field, bonus]) => {
        if (!Number.isFinite(bonus)) {
            return;
        }
        target[field] = (target[field] || 0) + bonus;
    });
};

const applyTraitModifiers = (modifiers, trait) => {
    const effects = trait.modifiers || {};
    if (Number.isFinite(effects.populationGrowth)) {
        modifiers.populationGrowth *= effects.populationGrowth;
    }
    if (Number.isFinite(effects.shipCostMultiplier)) {
        modifiers.shipCostMultiplier *= effects.shipCostMultiplier;
    }
    if (Number.isFinite(effects.researchCostMultiplier)) {
        modifiers.researchCostMultiplier *= effects.researchCostMultiplier;
    }
    if (Number.isFinite(effects.researchPointMultiplier)) {
        modifiers.researchPointMultiplier *= effects.researchPointMultiplier;
    }
    if (Number.isFinite(effects.habitabilityWidthBonus)) {
        modifiers.habitabilityWidthBonus += effects.habitabilityWidthBonus;
    }
    if (effects.habitabilityImmunity) {
        Object.entries(effects.habitabilityImmunity).forEach(([key, value]) => {
            if (value) {
                modifiers.habitabilityImmunity[key] = true;
            }
        });
    }
    if (Array.isArray(effects.restrictedHulls)) {
        mergeModifierLists(modifiers.restrictedHulls, effects.restrictedHulls);
    }
    if (Array.isArray(effects.restrictedComponents)) {
        mergeModifierLists(modifiers.restrictedComponents, effects.restrictedComponents);
    }
    mergeAllocationBounds(modifiers.allocationMin, effects.allocationMin, Math.max);
    mergeAllocationBounds(modifiers.allocationMax, effects.allocationMax, Math.min);
    mergeFieldBonuses(modifiers.researchFieldBonus, effects.researchFieldBonus);
};

const normalizeTraitList = (traits) => Array.from(new Set((Array.isArray(traits) ? traits : []).filter(Boolean)));

export const validateRaceTraits = (race) => {
    const errors = [];
    if (!race) {
        return { valid: true, errors: [], totalCost: 0, limits: { ...RACE_POINT_LIMITS } };
    }
    const primaryTrait = race.primaryTrait;
    if (primaryTrait) {
        const trait = TRAIT_CATALOG[primaryTrait];
        if (!trait) {
            errors.push(`Unknown primary trait: ${primaryTrait}.`);
        } else if (trait.type !== "primary") {
            errors.push(`Trait ${primaryTrait} is not a primary trait.`);
        }
    }
    const lesserTraits = normalizeTraitList(race.lesserTraits);
    lesserTraits.forEach(id => {
        const trait = TRAIT_CATALOG[id];
        if (!trait) {
            errors.push(`Unknown lesser trait: ${id}.`);
        } else if (trait.type !== "lesser") {
            errors.push(`Trait ${id} is not a lesser trait.`);
        }
    });

    const allTraits = [primaryTrait, ...lesserTraits].filter(Boolean).map(id => TRAIT_CATALOG[id]).filter(Boolean);
    const seenGroups = new Map();
    allTraits.forEach(trait => {
        if (!trait.exclusiveGroup) {
            return;
        }
        if (seenGroups.has(trait.exclusiveGroup)) {
            const existing = seenGroups.get(trait.exclusiveGroup);
            errors.push(`Traits ${existing} and ${trait.id} are mutually exclusive.`);
        } else {
            seenGroups.set(trait.exclusiveGroup, trait.id);
        }
    });

    const totalCost = allTraits.reduce((sum, trait) => sum + (trait.cost || 0), 0);
    if (totalCost < RACE_POINT_LIMITS.min) {
        errors.push(`Trait cost total ${totalCost} is below minimum ${RACE_POINT_LIMITS.min}.`);
    }
    if (totalCost > RACE_POINT_LIMITS.max) {
        errors.push(`Trait cost total ${totalCost} exceeds maximum ${RACE_POINT_LIMITS.max}.`);
    }

    return {
        valid: errors.length === 0,
        errors,
        totalCost,
        limits: { ...RACE_POINT_LIMITS }
    };
};

export const resolveRaceModifiers = (race) => {
    const modifiers = buildBaseModifiers();
    const validation = validateRaceTraits(race);
    if (!race) {
        return { modifiers, errors: [], validation };
    }
    if (!validation.valid) {
        return { modifiers, errors: validation.errors, validation };
    }
    const allTraits = normalizeTraitList([race.primaryTrait, ...(race.lesserTraits || [])])
        .map(id => TRAIT_CATALOG[id])
        .filter(Boolean);
    allTraits.forEach(trait => applyTraitModifiers(modifiers, trait));
    return { modifiers, errors: [], validation };
};

export const enforceAllocationRules = (allocation, fields, raceModifiers) => {
    if (!allocation || !fields?.length || !raceModifiers) {
        return allocation || {};
    }
    const adjusted = {};
    fields.forEach(field => {
        const base = allocation[field.id] ?? 0;
        const min = raceModifiers.allocationMin?.[field.id] ?? 0;
        const max = raceModifiers.allocationMax?.[field.id] ?? 1;
        adjusted[field.id] = Math.max(min, Math.min(max, base));
    });
    const total = fields.reduce((sum, field) => sum + (adjusted[field.id] || 0), 0);
    if (total <= 0) {
        return adjusted;
    }
    const normalized = {};
    fields.forEach(field => {
        normalized[field.id] = adjusted[field.id] / total;
    });
    return normalized;
};

export const getRaceTraitCatalog = () => ({ ...TRAIT_CATALOG });
