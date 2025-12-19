import { ORDER_TYPES } from "../models/orders.js";
import { dist } from "../core/utils.js";

const buildAIState = (gameState, playerId) => {
    const ownedStars = gameState.stars.filter(star => star.owner === playerId);
    const neutralStars = gameState.stars.filter(star => !star.owner);
    const enemyStars = gameState.stars.filter(star => star.owner && star.owner !== playerId);
    const enemyFleets = gameState.fleets.filter(fleet => fleet.owner !== playerId);
    const riskScores = new Map();

    gameState.stars.forEach(star => {
        const nearbyEnemies = enemyFleets.filter(fleet => dist(fleet, star) < 220);
        const risk = nearbyEnemies.reduce((sum, fleet) => sum + (fleet.design?.bv || 0), 0);
        riskScores.set(star.id, risk);
    });

    return {
        ownedStars,
        neutralStars,
        enemyStars,
        enemyFleets,
        riskScores,
        lastKnownEnemyActions: enemyFleets.map(fleet => ({ id: fleet.id, x: fleet.x, y: fleet.y, owner: fleet.owner }))
    };
};

const selectIntent = (aiState, difficulty, roll) => {
    const { neutralStars, enemyStars, ownedStars, enemyFleets } = aiState;
    const aggression = difficulty.aggression;
    const caution = 1 - difficulty.riskTolerance;
    const enemyNearby = ownedStars.some(star => enemyFleets.some(fleet => dist(fleet, star) < 250));

    if (neutralStars.length > 0 && (!enemyNearby || roll(100) > aggression * 100)) {
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

const createBuildOrder = (star, designIndex, playerId) => ({
    type: ORDER_TYPES.BUILD_SHIPS,
    issuerId: playerId,
    payload: { starId: star.id, designIndex }
});

const createColonizeOrder = (fleet, playerId) => ({
    type: ORDER_TYPES.COLONIZE,
    issuerId: playerId,
    payload: { fleetId: fleet.id }
});

export const AIController = {
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
        const credits = economy?.credits ?? 0;
        const designs = gameState.aiDesigns || [];
        const colonizerIndex = designs.findIndex(design => design.flags.includes("colonize"));
        const raiderIndex = designs.findIndex(design => !design.flags.includes("colonize"));

        aiState.ownedStars
            .filter(star => !star.queue)
            .forEach(star => {
                if (Date.now() - startTime > maxTimeMs) {
                    return;
                }
                if (colonizerIndex >= 0 && !gameState.fleets.some(fleet => fleet.owner === playerId && fleet.design.flags.includes("colonize"))) {
                    orders.push(createBuildOrder(star, colonizerIndex, playerId));
                    return;
                }
                if (raiderIndex >= 0 && credits >= designs[raiderIndex]?.cost && roll(100) < 30) {
                    orders.push(createBuildOrder(star, raiderIndex, playerId));
                }
            });

        const idleFleets = gameState.fleets.filter(fleet => fleet.owner === playerId && !fleet.dest);
        idleFleets.forEach(fleet => {
            if (Date.now() - startTime > maxTimeMs) {
                return;
            }
            if (fleet.design.flags.includes("colonize")) {
                orders.push(createColonizeOrder(fleet, playerId));
            }
            let targetPool = [];
            if (intent === "EXPAND") {
                targetPool = aiState.neutralStars;
            } else if (intent === "ATTACK") {
                targetPool = aiState.enemyStars;
            } else if (intent === "DEFEND") {
                targetPool = aiState.ownedStars;
            } else {
                targetPool = aiState.neutralStars.length ? aiState.neutralStars : aiState.enemyStars;
            }
            const target = pickTarget(fleet, targetPool, profile.lookaheadDepth, roll);
            if (target) {
                orders.push(createMoveOrder(fleet, target, playerId));
            }
        });

        return {
            orders,
            intent,
            aiState
        };
    }
};
