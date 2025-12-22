import { ShipDesign } from "../models/entities.js";
import { getComponentById } from "../models/technology.js";
import { resolveRaceModifiers } from "./raceTraits.js";

const createDesignId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `design-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

const sumStat = (components, key) => components.reduce((sum, component) => (
    sum + (component.stats?.[key] || 0)
), 0);
const maxStat = (components, key) => components.reduce((max, component) => (
    Math.max(max, component.stats?.[key] || 0)
), 0);
const sumPowerStat = (sources, power = 4) => sources.reduce((sum, value) => (
    sum + Math.pow(Math.max(0, value), power)
), 0);
const collectScannerSources = (hull, components) => {
    const sources = [];
    if (Number.isFinite(hull.scanner)) {
        sources.push(hull.scanner);
    }
    components.forEach(component => {
        const scanner = component.stats?.scanner;
        if (Number.isFinite(scanner) && scanner > 0) {
            sources.push(scanner);
        }
    });
    return sources;
};
const collectFuelUsageProfiles = (components) => components
    .filter(component => component.slotType === "engine")
    .map(component => component.stats?.fuelUsage)
    .filter(profile => Array.isArray(profile) && profile.length >= 10);

const mergeFuelUsageProfiles = (profiles) => {
    if (!profiles.length) {
        return null;
    }
    const merged = [];
    for (let i = 0; i < 10; i += 1) {
        const values = profiles.map(profile => profile[i]).filter(value => Number.isFinite(value));
        merged[i] = values.length ? Math.min(...values) : null;
    }
    return merged;
};
const resolveScannerStrength = (hull, components) => {
    const sources = collectScannerSources(hull, components);
    if (!sources.length) {
        return 0;
    }
    const sum = sumPowerStat(sources, 4);
    return sum > 0 ? Math.floor(Math.pow(sum, 0.25)) : 0;
};

const getTechLevel = (techState, fieldId) => techState?.fields?.[fieldId]?.level ?? 0;

const getRequirementDelta = (requirements, techState) => {
    const entries = Object.entries(requirements || {});
    if (!entries.length || !techState) {
        return 0;
    }
    return Math.min(...entries.map(([fieldId, level]) => getTechLevel(techState, fieldId) - level));
};

const getMiniaturizationDiscount = (requirements, techState, raceModifiers) => {
    const delta = getRequirementDelta(requirements, techState);
    if (delta <= 0) {
        return 0;
    }
    const cap = raceModifiers?.bleedingEdgeTech ? 0.8 : 0.75;
    return Math.min(cap, delta * 0.05);
};

const applyMiniaturization = (value, requirements, techState, raceModifiers) => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const discount = getMiniaturizationDiscount(requirements, techState, raceModifiers);
    return Math.max(0, Math.round(value * (1 - discount)));
};

const getAdjustedComponent = (component, techState, raceModifiers) => ({
    ...component,
    adjustedMass: applyMiniaturization(component.mass ?? 0, component.tech, techState, raceModifiers),
    adjustedCost: applyMiniaturization(component.cost ?? 0, component.tech, techState, raceModifiers)
});

const collectFlags = (components) => {
    const flags = new Set();
    components.forEach(component => {
        (component.flags || []).forEach(flag => flags.add(flag));
        (component.stats?.flags || []).forEach(flag => flags.add(flag));
    });
    return Array.from(flags);
};

export const calculateDesignStats = (hull, components, techState = null, raceModifiers = null) => {
    const adjustedComponents = components.map(component => getAdjustedComponent(component, techState, raceModifiers));
    const mass = hull.baseMass + adjustedComponents.reduce((sum, component) => sum + component.adjustedMass, 0);
    const armorBase = hull.armor + sumStat(components, "armor");
    const structure = hull.structure + sumStat(components, "structure");
    const powerOutput = components.reduce((sum, component) => sum + (component.powerOutput || 0), 0);
    const powerUsage = components.reduce((sum, component) => sum + (component.powerUsage || 0), 0);

    const fuel = Math.max(0, Math.floor((hull.baseFuel || 0) + sumStat(components, "fuel")));
    const cargo = Math.max(0, Math.floor((hull.baseCargo || 0) + sumStat(components, "cargo")));

    const speedBase = (hull.baseSpeed || 0) + sumStat(components, "speed");
    const speed = Math.max(1, Math.floor(speedBase - mass / (hull.speedMassFactor || 140)));
    const rangeBase = (hull.baseRange || 0) + sumStat(components, "range");
    const range = Math.max(1, Math.floor(rangeBase + fuel / (hull.fuelRangeFactor || 12)));

    const initiativeBase = (hull.baseInitiative || 0) + sumStat(components, "initiative");
    const initiative = Math.max(0, Math.floor(initiativeBase + Math.floor(speed / 2)));

    const beamDamage = Math.max(0, Math.floor(sumStat(components, "beamDamage") + sumStat(components, "attack")));
    const torpedoDamage = Math.max(0, Math.floor(sumStat(components, "torpedoDamage")));
    const attack = Math.max(0, Math.floor((hull.baseAttack || 0)
        + beamDamage
        + torpedoDamage
        + sumStat(components, "targeting")));
    const defense = Math.max(0, Math.floor((hull.baseDefense || 0)
        + sumStat(components, "defense")
        + sumStat(components, "evasion")));
    const shieldsBase = Math.max(0, Math.floor((hull.baseShields || 0) + sumStat(components, "shields") + defense * 0.5));
    const armor = Math.max(0, Math.floor(armorBase * (raceModifiers?.armorStrengthMultiplier || 1)));
    const shields = Math.max(0, Math.floor(shieldsBase * (raceModifiers?.shieldStrengthMultiplier || 1)));

    const mineCapacity = sumStat(components, "mineCapacity");
    const mineLayingCapacity = sumStat(components, "mineLayingCapacity") || mineCapacity;
    const mineSweepingStrength = sumStat(components, "mineSweepingStrength");
    const signature = (hull.signature || Math.ceil(hull.baseMass / 20)) + Math.ceil(mass / 120);
    const scanner = resolveScannerStrength(hull, components) * (raceModifiers?.shipScannerMultiplier || 1);
    const camo = Math.max(0, Math.floor((hull.camo || 0) + sumStat(components, "camo")));
    const cloakPoints = Math.max(0, Math.floor((camo + (raceModifiers?.shipCloakBonus || 0))
        * (raceModifiers?.shipCloakMultiplier || 1)));
    const beamRange = Math.max(0, maxStat(components, "beamRange"));
    const torpedoRange = Math.max(0, maxStat(components, "torpedoRange"));
    const bombing = Math.max(0, Math.floor(sumStat(components, "bombing") + torpedoDamage * 0.2));
    const gattling = Math.max(0, Math.floor(sumStat(components, "gattling")));
    const sapper = Math.max(0, Math.min(0.8, sumStat(components, "sapper")));
    const engineFuelUsage = mergeFuelUsageProfiles(collectFuelUsageProfiles(components));
    const ramscoopFreeSpeed = Math.max(0, sumStat(components, "freeSpeed"));

    const baseCost = hull.cost + adjustedComponents.reduce((sum, component) => sum + component.adjustedCost, 0);
    const discountedCost = hull.type === "starbase" ? Math.round(baseCost * 0.5) : baseCost;

    return {
        mass,
        armor,
        structure,
        speed,
        attack,
        defense,
        range: Math.max(1, Math.floor(range * (raceModifiers?.shipRangeMultiplier || 1))),
        fuel,
        cargo,
        shields,
        powerOutput,
        powerUsage,
        signature,
        scanner,
        camo,
        cloakPoints,
        mineCapacity,
        mineLayingCapacity,
        mineSweepingStrength,
        mineHitpoints: armor + structure,
        initiative,
        beamDamage,
        torpedoDamage,
        beamRange: beamRange || (beamDamage > 0 ? 1 : 0),
        torpedoRange: torpedoRange || (torpedoDamage > 0 ? 2 : 0),
        bombing,
        gattling,
        sapper,
        flags: collectFlags(components),
        baseCost: discountedCost,
        engineFuelUsage,
        ramscoopFreeSpeed
    };
};

const validateSlotLayout = (hull, components) => {
    const errors = [];
    const slotLayout = hull.slotLayout || {};
    const counts = Object.fromEntries(Object.keys(slotLayout).map(key => [key, 0]));
    components.forEach(component => {
        if (!component) {
            errors.push("All slots must be filled.");
            return;
        }
        if (!slotLayout[component.slotType]) {
            errors.push(`Component ${component.name} does not fit a ${component.slotType} slot.`);
            return;
        }
        counts[component.slotType] += 1;
        if (counts[component.slotType] > slotLayout[component.slotType]) {
            errors.push(`Too many ${component.slotType} components selected.`);
        }
    });

    Object.entries(slotLayout).forEach(([slotType, count]) => {
        if ((counts[slotType] || 0) !== count) {
            errors.push(`Requires ${count} ${slotType} slot${count > 1 ? "s" : ""}.`);
        }
    });

    const totalSlots = Object.values(slotLayout).reduce((sum, count) => sum + count, 0);
    if (components.length !== totalSlots) {
        errors.push("All required slots must be filled.");
    }

    return errors;
};

const getMissingTech = (requirements, techState) => {
    if (!techState) {
        return [];
    }
    return Object.entries(requirements || {}).reduce((missing, [fieldId, level]) => {
        const current = getTechLevel(techState, fieldId);
        if (current < level) {
            missing.push({ fieldId, level, current });
        }
        return missing;
    }, []);
};

const validateTechAvailability = (hull, components, techState) => {
    const errors = [];
    if (!techState) {
        return errors;
    }
    const hullMissing = getMissingTech(hull.tech, techState);
    hullMissing.forEach(({ fieldId, level, current }) => {
        errors.push(`Hull requires ${fieldId} ${level} (current ${current}).`);
    });

    components.forEach(component => {
        const missing = getMissingTech(component.tech, techState);
        missing.forEach(({ fieldId, level, current }) => {
            errors.push(`${component.name} requires ${fieldId} ${level} (current ${current}).`);
        });
    });

    return errors;
};

const getRaceTraits = (race) => new Set([
    race?.primaryTrait,
    ...(race?.lesserTraits || [])
].filter(Boolean));

const validateRaceAvailability = (hull, components, raceModifiers, race) => {
    const errors = [];
    if (!raceModifiers) {
        return errors;
    }
    if (raceModifiers.restrictedHulls?.includes(hull?.id)) {
        errors.push(`Hull ${hull.name} is unavailable for this race.`);
    }
    const componentIds = components.map(component => component.id);
    const restrictedComponents = raceModifiers.restrictedComponents || [];
    restrictedComponents.forEach(restrictedId => {
        if (componentIds.includes(restrictedId)) {
            errors.push(`Component ${restrictedId} is unavailable for this race.`);
        }
    });

    const traitSet = getRaceTraits(race);
    if (hull.requiresTraits?.length && !hull.requiresTraits.every(trait => traitSet.has(trait))) {
        errors.push(`Hull ${hull.name} requires trait ${hull.requiresTraits.join(", ")}.`);
    }
    components.forEach(component => {
        if (raceModifiers.noMineLayers && component.flags?.includes("minelayer")) {
            errors.push(`${component.name} is unavailable for this race.`);
        }
        if (raceModifiers.noRamscoop && Number.isFinite(component.stats?.freeSpeed) && component.stats.freeSpeed > 0) {
            errors.push(`${component.name} is unavailable for this race.`);
        }
        if (component.requiresTraits?.length && !component.requiresTraits.every(trait => traitSet.has(trait))) {
            errors.push(`${component.name} requires trait ${component.requiresTraits.join(", ")}.`);
        }
    });

    return errors;
};

export const validateDesign = (hull, components, techState = null, race = null) => {
    const errors = [];
    if (!hull) {
        errors.push("Select a hull to continue.");
        return { valid: false, errors, stats: null };
    }

    errors.push(...validateSlotLayout(hull, components));
    errors.push(...validateTechAvailability(hull, components, techState));

    const { modifiers, errors: raceErrors } = resolveRaceModifiers(race);
    errors.push(...raceErrors);

    const stats = calculateDesignStats(hull, components, techState, modifiers);
    if (stats.mass > hull.maxMass) {
        errors.push(`Mass ${stats.mass} exceeds hull limit ${hull.maxMass}.`);
    }
    if (stats.powerOutput < stats.powerUsage) {
        errors.push("Insufficient power output.");
    }

    errors.push(...validateRaceAvailability(hull, components, modifiers, race));

    return { valid: errors.length === 0, errors, stats };
};

export const buildShipDesign = ({ name, hull, componentIds = [], designId, race = null, techState = null }) => {
    const components = componentIds.map(id => getComponentById(id)).filter(Boolean);
    const validation = validateDesign(hull, components, techState, race);
    if (!validation.valid) {
        return { design: null, errors: validation.errors, stats: validation.stats };
    }

    const { modifiers } = resolveRaceModifiers(race);
    const baseCost = validation.stats?.baseCost ?? hull.cost + components.reduce((sum, component) => sum + component.cost, 0);
    const cost = Math.ceil(baseCost * (modifiers.shipCostMultiplier || 1));
    const finalStats = validation.stats;
    const design = new ShipDesign({
        designId: designId || createDesignId(),
        name,
        hullId: hull.id,
        components: componentIds,
        finalStats,
        cost
    });
    return { design, errors: [], stats: finalStats };
};
