import { ORDER_TYPES } from "../models/orders.js";
import { dist } from "../core/utils.js";
import { buildShipDesign } from "../core/shipDesign.js";
import { getTechnologyStateForEmpire } from "../core/technologyResolver.js";
import { DB } from "../data/db.js";

const lineIntersectsCircle = (start, end, center, radius) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fx = start.x - center.x;
    const fy = start.y - center.y;
    const a = dx * dx + dy * dy;
    if (a === 0) {
        return dist(start, center) <= radius;
    }
    const b = 2 * (fx * dx + fy * dy);
    const c = (fx * fx + fy * fy) - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        return false;
    }
    const sqrtD = Math.sqrt(discriminant);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
};

const buildAIState = (gameState, playerId) => {
    const ownedStars = gameState.stars.filter(star => star.owner === playerId);
    const neutralStars = gameState.stars.filter(star => !star.owner);
    const enemyStars = gameState.stars.filter(star => star.owner && star.owner !== playerId);
    const enemyFleets = gameState.fleets.filter(fleet => fleet.owner !== playerId);
    const riskScores = new Map();

    gameState.stars.forEach(star => {
        const nearbyEnemies = enemyFleets.filter(fleet => dist(fleet, star) < 220);
        const risk = nearbyEnemies.reduce((sum, fleet) => sum + (fleet.design?.attack || 0), 0);
        riskScores.set(star.id, risk);
    });

    const visibleMinefields = Array.isArray(gameState.minefields) ? gameState.minefields : [];

    return {
        ownedStars,
        neutralStars,
        enemyStars,
        enemyFleets,
        riskScores,
        visibleMinefields,
        lastKnownEnemyActions: enemyFleets.map(fleet => ({ id: fleet.id, x: fleet.x, y: fleet.y, owner: fleet.owner }))
    };
};

const isGreenWorld = (star) => Number.isFinite(star.habitability) && star.habitability >= 0;

const selectIntent = (aiState, difficulty, roll) => {
    const { neutralStars, enemyStars, ownedStars, enemyFleets } = aiState;
    const aggression = difficulty.aggression;
    const caution = 1 - difficulty.riskTolerance;
    const enemyNearby = ownedStars.some(star => enemyFleets.some(fleet => dist(fleet, star) < 250));
    const habitableNeutral = neutralStars.filter(isGreenWorld);

    if (habitableNeutral.length > 0 && (!enemyNearby || roll(100) > aggression * 100)) {
        return "EXPAND";
    }
    if (enemyStars.length > 0 && roll(100) < aggression * 100 && roll(100) > caution * 100) {
        return enemyNearby ? "ATTACK" : "CONSOLIDATE";
    }
    if (enemyNearby) {
        return "DEFEND";
    }
    return "CONSOLIDATE";
};

const pickTarget = (origin, candidates, depth, roll) => {
    if (!candidates.length) {
        return null;
    }
    const sorted = candidates
        .slice()
        .sort((a, b) => dist(origin, a) - dist(origin, b) || a.id - b.id);
    const limit = Math.max(1, Math.min(sorted.length, depth));
    const choice = roll(limit) || 0;
    return sorted[choice];
};

const createMoveOrder = (fleet, target, playerId) => ({
    type: ORDER_TYPES.MOVE_FLEET,
    issuerId: playerId,
    payload: { fleetId: fleet.id, dest: { x: target.x, y: target.y } }
});

const createSweepOrder = (fleet, minefieldId, playerId) => ({
    type: ORDER_TYPES.SWEEP_MINES,
    issuerId: playerId,
    payload: { fleetId: fleet.id, minefieldId }
});

const createStargateOrder = (fleet, sourceId, destinationId, playerId) => ({
    type: ORDER_TYPES.STARGATE_JUMP,
    issuerId: playerId,
    payload: { fleetId: fleet.id, sourcePlanetId: sourceId, destinationPlanetId: destinationId }
});

const createBuildOrder = (star, designId, playerId) => ({
    type: ORDER_TYPES.BUILD_SHIPS,
    issuerId: playerId,
    payload: { starId: star.id, designId }
});

const createBuildStructureOrder = (star, kind, count, playerId) => ({
    type: ORDER_TYPES.BUILD_STRUCTURE,
    issuerId: playerId,
    payload: { starId: star.id, kind, count }
});

const createColonizeOrder = (fleet, playerId) => ({
    type: ORDER_TYPES.COLONIZE,
    issuerId: playerId,
    payload: { fleetId: fleet.id }
});

const getDefenseNeed = (star, targetRatio = 0.25) => {
    const mines = Math.max(0, star.mines || 0);
    const facts = Math.max(0, star.factories || 0);
    const defMines = Math.max(0, star.def?.mines || 0);
    const defFacts = Math.max(0, star.def?.facts || 0);
    const mineTarget = Math.ceil(mines * targetRatio);
    const factTarget = Math.ceil(facts * targetRatio);
    const mineDeficit = mineTarget - defMines;
    const factDeficit = factTarget - defFacts;
    if (mineDeficit > 0) {
        return { kind: "mine", count: Math.max(1, mineDeficit) };
    }
    if (factDeficit > 0) {
        return { kind: "factory", count: Math.max(1, factDeficit) };
    }
    return null;
};

const isUnsafeMinefield = (field, playerId) => field.ownerEmpireId == null || field.ownerEmpireId !== playerId;

export const AIController = {
    ensureBasicDesigns(gameState, playerId) {
        if (!gameState.shipDesigns) {
            gameState.shipDesigns = {};
        }
        if (!gameState.shipDesigns[playerId]) {
            gameState.shipDesigns[playerId] = [];
        }
        const designs = gameState.shipDesigns[playerId];
        if (designs.length) {
            return designs;
        }
        const hulls = gameState.rules?.hulls || [];
        const scoutHull = hulls.find(hull => hull.id === "scout") || hulls[0];
        const frigateHull = hulls.find(hull => hull.id === "frigate") || hulls[1] || scoutHull;
        const techState = getTechnologyStateForEmpire(gameState, playerId);
        const raider = buildShipDesign({
            name: "Raider",
            hull: scoutHull,
            componentIds: ["ion_drive", "laser_array", "armor_plating"],
            race: gameState.race,
            techState
        });
        const colonizer = buildShipDesign({
            name: "Seeder",
            hull: frigateHull,
            componentIds: ["ion_drive", "laser_array", "colony_pod", "reactor_core"],
            race: gameState.race,
            techState
        });
        [raider, colonizer].forEach(result => {
            if (result.design) {
                designs.push(result.design);
            }
        });
        return designs;
    },

    runTurn(gameState, playerId, difficulty, options = {}) {
        const roll = options.roll || ((max) => Math.floor(Math.random() * max));
        const maxTimeMs = options.maxTimeMs ?? 100;
        const startTime = Date.now();
        const orders = [];
        const profile = {
            aggression: 0.6,
            riskTolerance: 0.5,
            lookaheadDepth: 1,
            ...difficulty
        };
        const aiState = buildAIState(gameState, playerId);
        const intent = selectIntent(aiState, profile, roll);

        const economy = gameState.economy?.[playerId];
        let availableCredits = economy?.credits ?? 0;
        const designs = this.ensureBasicDesigns(gameState, playerId) || [];
        const colonizerIndex = designs.findIndex(design => design.flags.includes("colonize"));
        const raiderIndex = designs
            .map((design, index) => ({ design, index }))
            .filter(entry => !entry.design.flags.includes("colonize"))
            .sort((a, b) => a.design.cost - b.design.cost)[0]?.index ?? -1;

        aiState.ownedStars
            .filter(star => !star.queue)
            .forEach(star => {
                if (Date.now() - startTime > maxTimeMs) {
                    return;
                }
                const defenseNeed = getDefenseNeed(star);
                if (defenseNeed) {
                    const structure = DB.structures?.[defenseNeed.kind];
                    const cost = structure ? structure.cost * defenseNeed.count : null;
                    if (structure && availableCredits >= cost) {
                        orders.push(createBuildStructureOrder(star, defenseNeed.kind, defenseNeed.count, playerId));
                        availableCredits -= cost;
                        return;
                    }
                }
                if (colonizerIndex >= 0 && !gameState.fleets.some(fleet => fleet.owner === playerId && fleet.design.flags.includes("colonize"))) {
                    const cost = designs[colonizerIndex]?.cost ?? 0;
                    if (availableCredits >= cost) {
                        orders.push(createBuildOrder(star, designs[colonizerIndex].designId, playerId));
                        availableCredits -= cost;
                    }
                    return;
                }
                if (raiderIndex >= 0 && availableCredits >= designs[raiderIndex]?.cost) {
                    orders.push(createBuildOrder(star, designs[raiderIndex].designId, playerId));
                    availableCredits -= designs[raiderIndex]?.cost ?? 0;
                }
            });

        const idleFleets = gameState.fleets.filter(fleet => fleet.owner === playerId && !fleet.dest);
        idleFleets.forEach(fleet => {
            if (Date.now() - startTime > maxTimeMs) {
                return;
            }
            const blockingMinefield = aiState.visibleMinefields.find(field => (
                field.ownerEmpireId && field.ownerEmpireId !== playerId && dist(fleet, field.center) <= field.radius
            ));
            if (blockingMinefield && fleet.mineSweepingStrength > 0) {
                orders.push(createSweepOrder(fleet, blockingMinefield.id, playerId));
                return;
            }
            if (fleet.design.flags.includes("colonize")) {
                orders.push(createColonizeOrder(fleet, playerId));
            }
            let targetPool = [];
            const habitableNeutral = aiState.neutralStars.filter(isGreenWorld);
            if (intent === "EXPAND") {
                targetPool = habitableNeutral;
            } else if (intent === "ATTACK") {
                targetPool = aiState.enemyStars;
            } else if (intent === "DEFEND") {
                targetPool = aiState.ownedStars;
            } else {
                targetPool = habitableNeutral.length ? habitableNeutral : aiState.enemyStars;
            }
            const target = pickTarget(fleet, targetPool, profile.lookaheadDepth, roll);
            if (target) {
                const sourceStar = gameState.stars.find(star => dist(star, fleet) < 12);
                if (sourceStar?.hasStargate && target.hasStargate) {
                    const distance = dist(sourceStar, target);
                    if (distance <= sourceStar.stargateRange && fleet.mass <= sourceStar.stargateMassLimit) {
                        orders.push(createStargateOrder(fleet, sourceStar.id, target.id, playerId));
                        return;
                    }
                }
                const unsafe = aiState.visibleMinefields.some(field => (
                    isUnsafeMinefield(field, playerId)
                    && lineIntersectsCircle(fleet, target, field.center, field.radius)
                ));
                if (!unsafe || targetPool.length === 1) {
                    orders.push(createMoveOrder(fleet, target, playerId));
                    return;
                }
                const safeTarget = targetPool.find(candidate => !aiState.visibleMinefields.some(field => (
                    isUnsafeMinefield(field, playerId)
                    && lineIntersectsCircle(fleet, candidate, field.center, field.radius)
                )));
                if (safeTarget) {
                    orders.push(createMoveOrder(fleet, safeTarget, playerId));
                } else {
                    orders.push(createMoveOrder(fleet, target, playerId));
                }
            }
        });

        return {
            orders,
            intent,
            aiState
        };
    }
};
