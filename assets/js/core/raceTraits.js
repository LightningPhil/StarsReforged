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
            populationGrowth: 2,
            maxPopulationMultiplier: 0.5,
            startingTechLevels: { BIOT: 1 },
            noStargates: true
        }
    },
    SS: {
        id: "SS",
        name: "Super Stealth",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            shipCloakBonus: 75,
            shipScannerMultiplier: 1.1,
            startingTechLevels: { ELEC: 5 }
        }
    },
    WM: {
        id: "WM",
        name: "War Monger",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            shipCostMultiplier: 0.75,
            startingTechLevels: { WEAP: 5, PROP: 1, ENER: 1 },
            noMineLayers: true,
            restrictedStructures: ["defense_only"],
            groundCombatBonus: 0.25
        }
    },
    CA: {
        id: "CA",
        name: "Claim Adjuster",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            habitabilityWidthBonus: 0.3,
            terraformingRateMultiplier: 2.5,
            startingTechLevels: { ENER: 1, WEAP: 1, PROP: 1, BIOT: 6 },
            orbitalTerraforming: true
        }
    },
    IS: {
        id: "IS",
        name: "Inner Strength",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            populationGrowth: 1.1,
            maxPopulationMultiplier: 1.1,
            researchPointMultiplier: 1.05,
            defenseCostMultiplier: 0.6,
            inTransitGrowth: 0.5
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
            minefieldDecayMultiplier: 0.25,
            minefieldSweepResistanceMultiplier: 1.2,
            startingTechLevels: { PROP: 2, BIOT: 2 },
            minefieldScan: true,
            minefieldDetonation: true
        }
    },
    PP: {
        id: "PP",
        name: "Packet Physics",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            packetPhysics: true,
            shipRangeMultiplier: 1.05,
            startingTechLevels: { ENER: 4 }
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
            startingTechLevels: { PROP: 5, CONST: 5 },
            stargateCargo: true,
            inTransitDeathRate: 0.03,
            massDriverEfficiency: 0.5
        }
    },
    JOAT: {
        id: "JOAT",
        name: "Jack of All Trades",
        type: "primary",
        cost: 4,
        exclusiveGroup: "primary",
        modifiers: {
            startingTechLevels: { ALL: 3 },
            researchCostMultiplier: 1,
            researchPointMultiplier: 1.05,
            maxPopulationMultiplier: 1.2
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
            researchCostMultiplier: 1.05,
            noFactories: true,
            noPlanetaryDefenses: true,
            noMines: true,
            inTransitDeathRate: 0.03
        }
    },
    IFE: {
        id: "IFE",
        name: "Improved Fuel Efficiency",
        type: "lesser",
        cost: 2,
        exclusiveGroup: "engine",
        modifiers: {
            shipRangeMultiplier: 1.15,
            startingTechLevels: { PROP: 1 }
        }
    },
    NRSE: {
        id: "NRSE",
        name: "No Ram Scoop Engines",
        type: "lesser",
        cost: 2,
        exclusiveGroup: "engine",
        modifiers: {
            shipRangeMultiplier: 0.9,
            noRamscoop: true
        }
    },
    CE: {
        id: "CE",
        name: "Cheap Engines",
        type: "lesser",
        cost: 2,
        modifiers: {
            shipCostMultiplier: 0.5,
            engineReliabilityPenalty: 0.1
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
            restrictedComponents: ["scanner_array"],
            noAdvancedScanners: true
        }
    },
    RS: {
        id: "RS",
        name: "Regenerating Shields",
        type: "lesser",
        cost: 2,
        modifiers: {
            shipCostMultiplier: 1.02,
            regeneratingShields: true,
            armorStrengthMultiplier: 0.5,
            shieldStrengthMultiplier: 1.4
        }
    },
    GR: {
        id: "GR",
        name: "Generalized Research",
        type: "lesser",
        cost: 2,
        modifiers: {
            allocationMin: {
                WEAP: 0.15,
                PROP: 0.15,
                CONST: 0.15,
                ELEC: 0.15,
                ENER: 0.15,
                BIOT: 0.15,
                TERR: 0.15
            },
            allocationMax: {
                WEAP: 0.5,
                PROP: 0.5,
                CONST: 0.5,
                ELEC: 0.5,
                ENER: 0.5,
                BIOT: 0.5,
                TERR: 0.5
            },
            researchPointMultiplier: 1.15
        }
    },
    UR: {
        id: "UR",
        name: "Ultimate Recycling",
        type: "lesser",
        cost: 2,
        modifiers: {
            scrapRecoveryStarbase: 0.9,
            scrapRecoveryPlanet: 0.45
        }
    },
    BET: {
        id: "BET",
        name: "Bleeding Edge Technology",
        type: "lesser",
        cost: 2,
        modifiers: {
            bleedingEdgeTech: true,
            researchCostMultiplier: 2,
            researchPointMultiplier: 1
        }
    },
    LSP: {
        id: "LSP",
        name: "Low Starting Population",
        type: "lesser",
        cost: 2,
        modifiers: {
            startingPopulationMultiplier: 0.7
        }
    },
    ISB: {
        id: "ISB",
        name: "Improved Starbases",
        type: "lesser",
        cost: 2,
        modifiers: {
            shipCostMultiplier: 0.8,
            starbaseCloakBonus: 0.2
        }
    },
    TT: {
        id: "TT",
        name: "Total Terraforming",
        type: "lesser",
        cost: 2,
        modifiers: {
            habitabilityWidthBonus: 0.3,
            terraformingRateMultiplier: 1.7
        }
    },
    ARM: {
        id: "ARM",
        name: "Advanced Remote Mining",
        type: "lesser",
        cost: 2,
        modifiers: {
            miningRateMultiplier: 1.15
        }
    },
    OBM: {
        id: "OBM",
        name: "Only Basic Remote Mining",
        type: "lesser",
        cost: 2,
        modifiers: {
            miningRateMultiplier: 0.9,
            maxPopulationMultiplier: 1.1
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
    shipCloakMultiplier: 1,
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
    stargateCargo: false,
    engineReliabilityPenalty: 0,
    noStargates: false,
    noMineLayers: false,
    noAdvancedScanners: false,
    noRamscoop: false,
    regeneratingShields: false,
    armorStrengthMultiplier: 1,
    shieldStrengthMultiplier: 1,
    defenseCostMultiplier: 1,
    groundCombatBonus: 0,
    inTransitDeathRate: 0,
    inTransitGrowth: 0,
    massDriverEfficiency: 1,
    scrapRecoveryStarbase: 0.9,
    scrapRecoveryPlanet: 0.45,
    startingPopulationMultiplier: 1,
    restrictedStructures: [],
    orbitalTerraforming: false,
    alternateReality: false,
    noFactories: false,
    noPlanetaryDefenses: false,
    noMines: false,
    packetPhysics: false
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
    if (Number.isFinite(effects.shipCloakMultiplier)) {
        modifiers.shipCloakMultiplier *= effects.shipCloakMultiplier;
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
    if (Number.isFinite(effects.engineReliabilityPenalty)) {
        modifiers.engineReliabilityPenalty = Math.max(modifiers.engineReliabilityPenalty, effects.engineReliabilityPenalty);
    }
    if (typeof effects.stargateCargo === "boolean") {
        modifiers.stargateCargo = modifiers.stargateCargo || effects.stargateCargo;
    }
    if (typeof effects.noStargates === "boolean") {
        modifiers.noStargates = modifiers.noStargates || effects.noStargates;
    }
    if (typeof effects.noMineLayers === "boolean") {
        modifiers.noMineLayers = modifiers.noMineLayers || effects.noMineLayers;
    }
    if (typeof effects.noFactories === "boolean") {
        modifiers.noFactories = modifiers.noFactories || effects.noFactories;
    }
    if (typeof effects.noPlanetaryDefenses === "boolean") {
        modifiers.noPlanetaryDefenses = modifiers.noPlanetaryDefenses || effects.noPlanetaryDefenses;
    }
    if (typeof effects.noMines === "boolean") {
        modifiers.noMines = modifiers.noMines || effects.noMines;
    }
    if (typeof effects.noAdvancedScanners === "boolean") {
        modifiers.noAdvancedScanners = modifiers.noAdvancedScanners || effects.noAdvancedScanners;
    }
    if (typeof effects.noRamscoop === "boolean") {
        modifiers.noRamscoop = modifiers.noRamscoop || effects.noRamscoop;
    }
    if (typeof effects.regeneratingShields === "boolean") {
        modifiers.regeneratingShields = modifiers.regeneratingShields || effects.regeneratingShields;
    }
    if (Number.isFinite(effects.armorStrengthMultiplier)) {
        modifiers.armorStrengthMultiplier *= effects.armorStrengthMultiplier;
    }
    if (Number.isFinite(effects.shieldStrengthMultiplier)) {
        modifiers.shieldStrengthMultiplier *= effects.shieldStrengthMultiplier;
    }
    if (Number.isFinite(effects.defenseCostMultiplier)) {
        modifiers.defenseCostMultiplier *= effects.defenseCostMultiplier;
    }
    if (Number.isFinite(effects.groundCombatBonus)) {
        modifiers.groundCombatBonus = Math.max(modifiers.groundCombatBonus, effects.groundCombatBonus);
    }
    if (Number.isFinite(effects.inTransitDeathRate)) {
        modifiers.inTransitDeathRate = Math.max(modifiers.inTransitDeathRate, effects.inTransitDeathRate);
    }
    if (Number.isFinite(effects.inTransitGrowth)) {
        modifiers.inTransitGrowth = Math.max(modifiers.inTransitGrowth, effects.inTransitGrowth);
    }
    if (Number.isFinite(effects.massDriverEfficiency)) {
        modifiers.massDriverEfficiency *= effects.massDriverEfficiency;
    }
    if (Number.isFinite(effects.scrapRecoveryStarbase)) {
        modifiers.scrapRecoveryStarbase = effects.scrapRecoveryStarbase;
    }
    if (Number.isFinite(effects.scrapRecoveryPlanet)) {
        modifiers.scrapRecoveryPlanet = effects.scrapRecoveryPlanet;
    }
    if (Number.isFinite(effects.startingPopulationMultiplier)) {
        modifiers.startingPopulationMultiplier *= effects.startingPopulationMultiplier;
    }
    if (Array.isArray(effects.restrictedStructures)) {
        mergeModifierLists(modifiers.restrictedStructures, effects.restrictedStructures);
    }
    if (typeof effects.orbitalTerraforming === "boolean") {
        modifiers.orbitalTerraforming = modifiers.orbitalTerraforming || effects.orbitalTerraforming;
    }
    if (typeof effects.alternateReality === "boolean") {
        modifiers.alternateReality = modifiers.alternateReality || effects.alternateReality;
    }
    if (typeof effects.packetPhysics === "boolean") {
        modifiers.packetPhysics = modifiers.packetPhysics || effects.packetPhysics;
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
