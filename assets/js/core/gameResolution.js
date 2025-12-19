import { Minefield } from "../models/minefield.js";
import { dist } from "./utils.js";
import { getTotalTechLevels } from "./technologyResolver.js";

const countEmpirePlanets = (state, empireId) => state.stars.filter(star => star.owner === empireId).length;
const countEmpireShips = (state, empireId) => state.fleets.filter(fleet => fleet.owner === empireId).length;
const countEmpirePopulation = (state, empireId) => state.stars
    .filter(star => star.owner === empireId)
    .reduce((sum, star) => sum + star.pop, 0);

export const calculateScores = (state) => state.players.map(player => {
    const totalPopulation = countEmpirePopulation(state, player.id);
    const totalPlanets = countEmpirePlanets(state, player.id);
    const totalShips = countEmpireShips(state, player.id);
    const totalTechLevels = getTotalTechLevels(player.technology);
    const score = (totalPopulation * 1.0)
        + (totalPlanets * 50)
        + (totalShips * 10)
        + (totalTechLevels * 25);
    return {
        playerId: player.id,
        score,
        totalPopulation,
        totalPlanets,
        totalShips,
        totalTechLevels,
        eliminatedAtTurn: player.eliminatedAtTurn ?? null
    };
});

export const resolveDefeats = (state) => {
    state.players.forEach(player => {
        if (player.status !== "active") {
            return;
        }
        const planets = countEmpirePlanets(state, player.id);
        const ships = countEmpireShips(state, player.id);
        if (planets === 0 && ships === 0) {
            player.status = "defeated";
            player.eliminatedAtTurn = state.turnCount;
        }
    });
};

const getMinefieldTypeRules = (state, type) => {
    const types = state.rules?.minefields?.types || {};
    return types[type] || types.standard || { sweepResistance: 1, damageMultiplier: 1, decayRate: 0.05 };
};

const getLineIntersectionLength = (start, end, center, radius) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fx = start.x - center.x;
    const fy = start.y - center.y;
    const a = dx * dx + dy * dy;
    if (a === 0) {
        return dist(start, center) <= radius ? 0 : 0;
    }
    const b = 2 * (fx * dx + fy * dy);
    const c = (fx * fx + fy * fy) - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        const inside = dist(start, center) <= radius && dist(end, center) <= radius;
        return inside ? Math.hypot(dx, dy) : 0;
    }
    const sqrtD = Math.sqrt(discriminant);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    const entry = Math.max(0, Math.min(t1, t2));
    const exit = Math.min(1, Math.max(t1, t2));
    if (exit <= 0 || entry >= 1 || exit <= entry) {
        const inside = dist(start, center) <= radius && dist(end, center) <= radius;
        return inside ? Math.hypot(dx, dy) : 0;
    }
    return Math.hypot(dx, dy) * (exit - entry);
};

const rememberMinefield = (state, empireId, minefield, knownOwner = false) => {
    if (!state.minefieldIntel) {
        state.minefieldIntel = {};
    }
    if (!state.minefieldIntel[empireId]) {
        state.minefieldIntel[empireId] = [];
    }
    const intel = state.minefieldIntel[empireId];
    const existing = intel.find(entry => entry.id === minefield.id);
    const payload = {
        id: minefield.id,
        center: { ...minefield.center },
        radius: minefield.radius,
        estimatedStrength: Math.ceil(minefield.strength),
        ownerEmpireId: knownOwner ? minefield.ownerEmpireId : null,
        lastSeenTurn: state.turnCount
    };
    if (existing) {
        Object.assign(existing, payload);
        return;
    }
    intel.push(payload);
};

const applyDamageToFleet = (fleet, damage) => {
    let remaining = damage;
    if (fleet.armor > 0) {
        const absorbed = Math.min(fleet.armor, remaining);
        fleet.armor -= absorbed;
        remaining -= absorbed;
    }
    if (remaining > 0) {
        fleet.structure = Math.max(0, fleet.structure - remaining);
    }
    fleet.mineHitpoints = Math.max(0, fleet.armor + fleet.structure);
    fleet.hp = Math.max(0, fleet.armor + fleet.structure + fleet.shields);
    return fleet.mineHitpoints <= 0 || fleet.structure <= 0;
};

export const resolveMinefieldLaying = (state) => {
    const orders = state.minefieldLayingOrders || [];
    if (!orders.length) {
        return;
    }
    orders.forEach(order => {
        const fleet = state.fleets.find(item => item.id === order.fleetId);
        if (!fleet) {
            return;
        }
        const mineUnitsToDeploy = Math.min(fleet.mineUnits, order.mineUnitsToDeploy);
        if (mineUnitsToDeploy <= 0) {
            return;
        }
        const typeRules = getMinefieldTypeRules(state, order.type);
        const radius = Math.sqrt(mineUnitsToDeploy / Math.PI);
        const minefieldId = state.minefields.reduce((max, field) => Math.max(max, field.id), 0) + 1;
        const newField = new Minefield({
            id: minefieldId,
            ownerEmpireId: fleet.owner,
            center: { x: fleet.x, y: fleet.y },
            radius,
            strength: mineUnitsToDeploy,
            type: order.type,
            turnCreated: state.turnCount,
            sweepResistance: typeRules.sweepResistance,
            decayRate: typeRules.decayRate,
            visibility: "owner"
        });
        const existing = state.minefields.find(field => field.ownerEmpireId === fleet.owner
            && field.center.x === fleet.x
            && field.center.y === fleet.y);
        if (existing) {
            existing.strength += newField.strength;
            existing.radius = Math.sqrt(existing.strength / Math.PI);
        } else {
            state.minefields.push(newField);
        }
        fleet.mineUnits -= mineUnitsToDeploy;
    });
};

export const resolveMinefieldSweeping = (state) => {
    const orders = state.minefieldSweepOrders || [];
    if (!orders.length) {
        return;
    }
    orders.forEach(order => {
        const fleet = state.fleets.find(item => item.id === order.fleetId);
        const minefield = state.minefields.find(field => field.id === order.minefieldId);
        if (!fleet || !minefield) {
            return;
        }
        if (dist(fleet, minefield.center) > minefield.radius) {
            return;
        }
        const swept = fleet.mineSweepingStrength / (minefield.sweepResistance || 1);
        minefield.strength = Math.max(0, minefield.strength - swept);
        minefield.radius = minefield.strength > 0 ? Math.sqrt(minefield.strength / Math.PI) : 0;
        rememberMinefield(state, fleet.owner, minefield, false);
    });
    state.minefields = state.minefields.filter(field => field.strength > 0);
};

export const resolveMinefieldTransitDamage = (state) => {
    const movementPaths = state.movementPaths || [];
    if (!movementPaths.length || !state.minefields.length) {
        return;
    }
    const destroyed = new Set();
    movementPaths.forEach(path => {
        const fleet = state.fleets.find(item => item.id === path.fleetId);
        if (!fleet) {
            return;
        }
        state.minefields.forEach(minefield => {
            if (minefield.ownerEmpireId === fleet.owner) {
                return;
            }
            const lengthInside = getLineIntersectionLength(path.start, path.end, minefield.center, minefield.radius);
            if (lengthInside <= 0) {
                return;
            }
            const typeRules = getMinefieldTypeRules(state, minefield.type);
            const damage = Math.ceil(minefield.density * lengthInside * (typeRules.damageMultiplier || 1));
            if (damage <= 0) {
                return;
            }
            const destroyedShip = applyDamageToFleet(fleet, damage);
            rememberMinefield(state, fleet.owner, minefield, false);
            if (state.turnEvents) {
                state.turnEvents.push({
                    type: "MINEFIELD_HIT",
                    fleetId: fleet.id,
                    minefieldId: minefield.id,
                    damage
                });
            }
            if (destroyedShip) {
                destroyed.add(fleet.id);
            }
        });
    });
    if (destroyed.size) {
        state.fleets = state.fleets.filter(fleet => !destroyed.has(fleet.id));
    }
};

export const resolveMinefieldDecay = (state) => {
    state.minefields = state.minefields
        .map(field => {
            const typeRules = getMinefieldTypeRules(state, field.type);
            const decayRate = field.decayRate ?? typeRules.decayRate ?? 0;
            field.strength *= (1 - decayRate);
            field.radius = field.strength > 0 ? Math.sqrt(field.strength / Math.PI) : 0;
            return field;
        })
        .filter(field => field.strength > 0);
};

export const resolveStargateJumps = (state) => {
    const orders = state.stargateOrders || [];
    if (!orders.length) {
        return;
    }
    const destroyed = new Set();
    orders.forEach(order => {
        const fleet = state.fleets.find(item => item.id === order.fleetId);
        const source = state.stars.find(star => star.id === order.sourcePlanetId);
        const destination = state.stars.find(star => star.id === order.destinationPlanetId);
        if (!fleet || !source || !destination) {
            return;
        }
        if (!source.hasStargate || !destination.hasStargate) {
            return;
        }
        const distance = Math.hypot(destination.x - source.x, destination.y - source.y);
        if (distance > source.stargateRange) {
            return;
        }
        if (Math.hypot(fleet.x - source.x, fleet.y - source.y) > 12) {
            return;
        }
        fleet.x = destination.x;
        fleet.y = destination.y;
        if (state.turnEvents) {
            state.turnEvents.push({
                type: "STARGATE_JUMP",
                fleetId: fleet.id,
                sourcePlanetId: source.id,
                destinationPlanetId: destination.id
            });
        }
        const massLimit = source.stargateMassLimit || 1;
        const misjumpChance = Math.max(0, (fleet.mass / massLimit) - 1);
        if (misjumpChance > 0) {
            const roll = state.rng.nextInt(1000) / 1000;
            if (roll < misjumpChance) {
                const damageRatio = 0.2 + (state.rng.nextInt(50) / 100);
                const damage = Math.ceil(fleet.mineHitpoints * damageRatio);
                const destroyedShip = applyDamageToFleet(fleet, damage);
                if (state.turnEvents) {
                    state.turnEvents.push({
                        type: "STARGATE_MISJUMP",
                        fleetId: fleet.id,
                        damage
                    });
                }
                if (destroyedShip) {
                    destroyed.add(fleet.id);
                }
            }
        }
    });
    if (destroyed.size) {
        state.fleets = state.fleets.filter(fleet => !destroyed.has(fleet.id));
    }
};
