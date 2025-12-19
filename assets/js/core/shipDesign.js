import { ShipDesign } from "../models/entities.js";
import { getComponentById } from "../models/technology.js";

const createDesignId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `design-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

const sumEffect = (components, key) => components.reduce((sum, component) => (
    sum + (component.effects?.[key] || 0)
), 0);

export const calculateDesignStats = (hull, components) => {
    const mass = hull.baseMass + components.reduce((sum, component) => sum + component.mass, 0);
    const armor = hull.armor + sumEffect(components, "armor");
    const structure = hull.structure + sumEffect(components, "structure");
    const attack = sumEffect(components, "attack");
    const defense = sumEffect(components, "defense");
    const speedBase = sumEffect(components, "speed");
    const rangeBase = sumEffect(components, "range");
    const fuelBase = sumEffect(components, "fuel");
    const powerOutput = components.reduce((sum, component) => sum + (component.powerOutput || 0), 0);
    const powerUsage = components.reduce((sum, component) => sum + (component.powerUsage || 0), 0);
    const mineCapacity = sumEffect(components, "mineUnits");
    const mineLayingCapacity = sumEffect(components, "mineUnits");
    const mineSweepingStrength = sumEffect(components, "mineSweep");
    const signature = (hull.signature || Math.ceil(hull.baseMass / 20)) + Math.ceil(mass / 120);

    const speed = Math.max(1, Math.floor(speedBase - mass / 140));
    const range = Math.max(1, Math.floor(rangeBase));
    const fuel = Math.max(40, Math.floor(range * 1.2 + fuelBase));
    const shields = Math.max(0, Math.floor(defense * 1.5));

    const flags = new Set();
    components.forEach(component => {
        (component.effects?.flags || []).forEach(flag => flags.add(flag));
    });

    return {
        mass,
        armor,
        structure,
        speed,
        attack,
        defense,
        range,
        fuel,
        shields,
        powerOutput,
        powerUsage,
        signature,
        mineCapacity,
        mineLayingCapacity,
        mineSweepingStrength,
        mineHitpoints: armor + structure,
        initiative: speed + Math.floor(sumEffect(components, "initiative")),
        flags: Array.from(flags)
    };
};

export const validateDesign = (hull, components) => {
    const errors = [];
    if (!hull) {
        errors.push("Select a hull to continue.");
        return { valid: false, errors, stats: null };
    }
    const slotCounts = components.reduce((acc, component) => {
        if (!component) {
            acc.invalid = true;
            return acc;
        }
        acc[component.slotType] = (acc[component.slotType] || 0) + 1;
        return acc;
    }, { invalid: false });

    if (slotCounts.invalid) {
        errors.push("All slots must be filled.");
    }

    Object.entries(hull.slotLayout || {}).forEach(([slotType, count]) => {
        if ((slotCounts[slotType] || 0) !== count) {
            errors.push(`Requires ${count} ${slotType} slot${count > 1 ? "s" : ""}.`);
        }
    });
    const totalSlots = Object.values(hull.slotLayout || {}).reduce((sum, count) => sum + count, 0);
    if (components.length !== totalSlots) {
        errors.push("All required slots must be filled.");
    }

    const stats = calculateDesignStats(hull, components);
    if (stats.mass > hull.maxMass) {
        errors.push(`Mass ${stats.mass} exceeds hull limit ${hull.maxMass}.`);
    }
    if (stats.powerOutput < stats.powerUsage) {
        errors.push("Insufficient power output.");
    }

    return { valid: errors.length === 0, errors, stats };
};

export const buildShipDesign = ({ name, hull, componentIds = [], designId }) => {
    const components = componentIds.map(id => getComponentById(id)).filter(Boolean);
    const validation = validateDesign(hull, components);
    if (!validation.valid) {
        return { design: null, errors: validation.errors, stats: validation.stats };
    }
    const cost = hull.cost + components.reduce((sum, component) => sum + component.cost, 0);
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
