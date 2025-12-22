const RACE_POINT_LIMITS = {
    min: 0,
    max: 10
};

const TRAIT_CATALOG = {
    HE: {
        id: "HE",
        name: "Hyper-Expansion",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            populationGrowth: 1.2,
            maxPopulationMultiplier: 1.15,
            startingTechLevels: { BIOT: 1 }
        }
    },
    SS: {
        id: "SS",
        name: "Super Stealth",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            shipCloakBonus: 15,
            shipScannerMultiplier: 1.1,
            startingTechLevels: { ELEC: 1 }
        }
    },
    WM: {
        id: "WM",
        name: "War Monger",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            shipCostMultiplier: 0.92,
            researchCostMultiplier: 1.05,
            startingTechLevels: { WEAP: 1 }
        }
    },
    CA: {
        id: "CA",
        name: "Claim Adjuster",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            habitabilityWidthBonus: 0.1,
            terraformingRateMultiplier: 1.5,
            startingTechLevels: { TERR: 1 }
        }
    },
    IS: {
        id: "IS",
        name: "Inner Strength",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            populationGrowth: 1.05,
            maxPopulationMultiplier: 1.2,
            researchPointMultiplier: 1.05
        }
    },
    SD: {
        id: "SD",
        name: "Space Demolition",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            minefieldStrengthMultiplier: 1.3,
            minefieldDamageMultiplier: 1.2,
            minefieldDecayMultiplier: 0.85,
            minefieldSweepResistanceMultiplier: 1.2,
            startingTechLevels: { WEAP: 1 }
        }
    },
    PP: {
        id: "PP",
        name: "Packet Physics",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            shipRangeMultiplier: 1.05,
            startingTechLevels: { PROP: 1 }
        }
    },
    IT: {
        id: "IT",
        name: "Interstellar Traveler",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            shipRangeMultiplier: 1.1,
            stargateRangeMultiplier: 1.5,
            stargateMassMultiplier: 1.5,
            stargateMisjumpMultiplier: 0.6,
            startingTechLevels: { PROP: 1 }
        }
    },
    JOAT: {
        id: "JOAT",
        name: "Jack of All Trades",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            startingTechLevels: { ALL: 1 },
            researchCostMultiplier: 1.05,
            researchPointMultiplier: 1.05
        }
    },
    AR: {
        id: "AR",
        name: "Alternate Reality",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            alternateReality: true,
            populationGrowth: 0.2,
            maxPopulationMultiplier: 0.7,
            researchCostMultiplier: 1.05
        }
    },
    IFE: {
        id: "IFE",
        name: "Improved Fuel Efficiency",
        type: "lesser",
        cost: 2,
        exclusiveGroup: "engine",
        modifiers: {
            shipRangeMultiplier: 1.2
        }
    },
    NRSE: {
        id: "NRSE",
        name: "No Ram Scoop Engines",
        type: "lesser",
        cost: 2,
        exclusiveGroup: "engine",
        modifiers: {
            shipRangeMultiplier: 0.9
        }
    },
    CE: {
        id: "CE",
        name: "Cheap Engines",
        type: "lesser",
        cost: 2,
        modifiers: {
            shipCostMultiplier: 0.95
        }
    },
    MA: {
        id: "MA",
        name: "Mineral Alchemy",
        type: "lesser",
        cost: 2,
        modifiers: {
            mineralAlchemyRate: 25
        }
    },
    NAS: {
        id: "NAS",
        name: "No Advanced Scanners",
        type: "lesser",
        cost: 2,
        modifiers: {
            restrictedComponents: ["scanner_array"]
        }
    },
    RS: {
        id: "RS",
        name: "Regenerating Shields",
        type: "lesser",
        cost: 2,
        modifiers: {
            shipCostMultiplier: 1.02
        }
    },
    GR: {
        id: "GR",
        name: "Generalized Research",
        type: "lesser",
        cost: 2,
        modifiers: {
            researchFieldCostMultiplier: {
                WEAP: 1,
                PROP: 1,
                CONST: 1,
                ELEC: 1,
                ENER: 1,
                BIOT: 1,
                TERR: 1
            }
        }
    },
    UR: {
        id: "UR",
        name: "Ultimate Recycling",
        type: "lesser",
        cost: 2,
        modifiers: {
            miningRateMultiplier: 1.1
        }
    },
    BET: {
        id: "BET",
        name: "Bleeding Edge Technology",
        type: "lesser",
        cost: 2,
        modifiers: {
            bleedingEdgeTech: true,
            researchCostMultiplier: 0.95,
            researchPointMultiplier: 0.95
        }
    },
    LSP: {
        id: "LSP",
        name: "Low Starting Population",
        type: "lesser",
        cost: 2,
        modifiers: {
            maxPopulationMultiplier: 0.85
        }
    },
    ISB: {
        id: "ISB",
        name: "Improved Starbases",
        type: "lesser",
        cost: 2,
        modifiers: {
            shipCostMultiplier: 0.98
        }
    },
    TT: {
        id: "TT",
        name: "Total Terraforming",
        type: "lesser",
        cost: 2,
        modifiers: {
            habitabilityWidthBonus: 0.15,
            terraformingRateMultiplier: 1.5
        }
    }
};

const buildBaseModifiers = () => ({
    populationGrowth: 1,
    maxPopulationMultiplier: 1,
    shipCostMultiplier: 1,
    shipRangeMultiplier: 1,
    shipCloakBonus: 0,
    shipScannerMultiplier: 1,
    researchCostMultiplier: 1,
    researchPointMultiplier: 1,
    habitabilityWidthBonus: 0,
    habitabilityImmunity: { grav: false, temp: false, rad: false },
    restrictedHulls: [],
    restrictedComponents: [],
    allocationMin: {},
    allocationMax: {},
    researchFieldBonus: {},
    researchFieldCostMultiplier: {},
    startingTechLevels: {},
    miningRateMultiplier: 1,
    mineralAlchemyRate: 100,
    terraformingRateMultiplier: 1,
    minefieldStrengthMultiplier: 1,
    minefieldDamageMultiplier: 1,
    minefieldDecayMultiplier: 1,
    minefieldSweepMultiplier: 1,
    minefieldSweepResistanceMultiplier: 1,
    stargateRangeMultiplier: 1,
    stargateMassMultiplier: 1,
    stargateMisjumpMultiplier: 1,
    alternateReality: false
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

const mergeFieldMultipliers = (target, updates) => {
    Object.entries(updates || {}).forEach(([field, multiplier]) => {
        if (!Number.isFinite(multiplier)) {
            return;
        }
        target[field] = (target[field] || 1) * multiplier;
    });
};

const mergeStartingTechLevels = (target, updates) => {
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
    if (Number.isFinite(effects.maxPopulationMultiplier)) {
        modifiers.maxPopulationMultiplier *= effects.maxPopulationMultiplier;
    }
    if (Number.isFinite(effects.shipCostMultiplier)) {
        modifiers.shipCostMultiplier *= effects.shipCostMultiplier;
    }
    if (Number.isFinite(effects.shipRangeMultiplier)) {
        modifiers.shipRangeMultiplier *= effects.shipRangeMultiplier;
    }
    if (Number.isFinite(effects.shipCloakBonus)) {
        modifiers.shipCloakBonus += effects.shipCloakBonus;
    }
    if (Number.isFinite(effects.shipScannerMultiplier)) {
        modifiers.shipScannerMultiplier *= effects.shipScannerMultiplier;
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
    mergeFieldMultipliers(modifiers.researchFieldCostMultiplier, effects.researchFieldCostMultiplier);
    mergeStartingTechLevels(modifiers.startingTechLevels, effects.startingTechLevels);
    if (Number.isFinite(effects.miningRateMultiplier)) {
        modifiers.miningRateMultiplier *= effects.miningRateMultiplier;
    }
    if (Number.isFinite(effects.mineralAlchemyRate)) {
        modifiers.mineralAlchemyRate = Math.min(modifiers.mineralAlchemyRate, effects.mineralAlchemyRate);
    }
    if (Number.isFinite(effects.terraformingRateMultiplier)) {
        modifiers.terraformingRateMultiplier *= effects.terraformingRateMultiplier;
    }
    if (Number.isFinite(effects.minefieldStrengthMultiplier)) {
        modifiers.minefieldStrengthMultiplier *= effects.minefieldStrengthMultiplier;
    }
    if (Number.isFinite(effects.minefieldDamageMultiplier)) {
        modifiers.minefieldDamageMultiplier *= effects.minefieldDamageMultiplier;
    }
    if (Number.isFinite(effects.minefieldDecayMultiplier)) {
        modifiers.minefieldDecayMultiplier *= effects.minefieldDecayMultiplier;
    }
    if (Number.isFinite(effects.minefieldSweepMultiplier)) {
        modifiers.minefieldSweepMultiplier *= effects.minefieldSweepMultiplier;
    }
    if (Number.isFinite(effects.minefieldSweepResistanceMultiplier)) {
        modifiers.minefieldSweepResistanceMultiplier *= effects.minefieldSweepResistanceMultiplier;
    }
    if (Number.isFinite(effects.stargateRangeMultiplier)) {
        modifiers.stargateRangeMultiplier *= effects.stargateRangeMultiplier;
    }
    if (Number.isFinite(effects.stargateMassMultiplier)) {
        modifiers.stargateMassMultiplier *= effects.stargateMassMultiplier;
    }
    if (Number.isFinite(effects.stargateMisjumpMultiplier)) {
        modifiers.stargateMisjumpMultiplier *= effects.stargateMisjumpMultiplier;
    }
    if (typeof effects.alternateReality === "boolean") {
        modifiers.alternateReality = modifiers.alternateReality || effects.alternateReality;
    }
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
