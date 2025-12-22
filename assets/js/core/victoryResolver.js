import { getTotalTechLevels } from "./technologyResolver.js";

const POP_OUTPUT_DIVISOR = 1000;

const countEmpirePlanets = (state, empireId) => state.stars.filter(star => star.owner === empireId).length;
const countEmpireShips = (state, empireId) => state.fleets.filter(fleet => fleet.owner === empireId).length;
const countEmpirePopulation = (state, empireId) => state.stars
    .filter(star => star.owner === empireId)
    .reduce((sum, star) => sum + star.pop, 0);
const countEmpireProductionCapacity = (state, empireId) => state.stars
    .filter(star => star.owner === empireId)
    .reduce((sum, star) => sum + star.factories + Math.floor(star.pop / POP_OUTPUT_DIVISOR), 0);

const buildScoreEntry = (state, player) => {
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
        totals: { totalPopulation, totalPlanets, totalShips, totalTechLevels }
    };
};

const selectWinnerByScore = (scores) => {
    const ranked = scores.slice().sort((a, b) => b.score - a.score || a.playerId - b.playerId);
    return ranked[0]?.playerId ?? null;
};

const selectWinnerByValue = (entries) => {
    const ranked = entries.slice().sort((a, b) => b.value - a.value || a.playerId - b.playerId);
    return ranked[0]?.playerId ?? null;
};

const getVictoryConfig = (state) => state.rules?.victory || {};
const isConditionEnabled = (state, key) => state.rules?.victory?.enabled?.[key] ?? true;

const getDesignForStack = (state, empireId, fleet, stack) => {
    const designs = state.shipDesigns?.[empireId] || [];
    if (stack?.designId) {
        const match = designs.find(design => design.designId === stack.designId);
        if (match) {
            return match;
        }
    }
    return fleet.design;
};

const isCapitalShipDesign = (state, design) => {
    if (!design) {
        return false;
    }
    const rules = getVictoryConfig(state);
    const hullIds = rules.capitalShipHullIds || [];
    if (hullIds.length) {
        return hullIds.includes(design.hullId);
    }
    if (Number.isFinite(rules.capitalShipMassThreshold)) {
        return design.mass >= rules.capitalShipMassThreshold;
    }
    return false;
};

const countCapitalShips = (state, empireId) => state.fleets
    .filter(fleet => fleet.owner === empireId)
    .reduce((sum, fleet) => {
        const stacks = fleet.shipStacks || [];
        if (!stacks.length) {
            return sum + (isCapitalShipDesign(state, fleet.design) ? 1 : 0);
        }
        const stackTotal = stacks.reduce((stackSum, stack) => {
            const design = getDesignForStack(state, empireId, fleet, stack);
            if (!isCapitalShipDesign(state, design)) {
                return stackSum;
            }
            return stackSum + (stack?.count || 1);
        }, 0);
        return sum + stackTotal;
    }, 0);

export const getVictoryTypeLabel = (victoryType) => ({
    TOTAL_ANNIHILATION: "Total Annihilation",
    ECONOMIC_SUPREMACY: "Economic Supremacy",
    PLANETARY_DOMINION: "Planetary Dominion",
    TECH_SUPREMACY: "Technological Ascendancy",
    SCORE_THRESHOLD: "Score Supremacy",
    INDUSTRIAL_SUPREMACY: "Industrial Supremacy",
    CAPITAL_SHIP_SUPREMACY: "Capital Fleet Supremacy",
    YEAR_LIMIT: "Year Limit",
    TURN_LIMIT: "Turn Limit"
})[victoryType] || "Victory";

export const VictoryResolver = {
    check(state) {
        if (state?.turnCount < 10) {
            return null;
        }
        if (!state?.players?.length) {
            return null;
        }
        const activePlayers = state.players.filter(player => player.status === "active");
        if (!activePlayers.length) {
            return null;
        }

        if (isConditionEnabled(state, "totalAnnihilation")) {
            const aliveEmpires = activePlayers.filter(player => {
                const planets = countEmpirePlanets(state, player.id);
                const ships = countEmpireShips(state, player.id);
                return planets > 0 || ships > 0;
            });

            if (aliveEmpires.length === 1) {
                return { winnerEmpireId: aliveEmpires[0].id, victoryType: "TOTAL_ANNIHILATION" };
            }
        }

        if (isConditionEnabled(state, "planetShare")) {
            const totalPlanets = activePlayers.reduce((sum, player) => sum + countEmpirePlanets(state, player.id), 0);
            const threshold = getVictoryConfig(state).planetShareThreshold ?? 0.6;
            if (totalPlanets > 0) {
                const contenders = activePlayers
                    .map(player => ({
                        id: player.id,
                        share: countEmpirePlanets(state, player.id) / totalPlanets
                    }))
                    .filter(entry => entry.share >= threshold)
                    .sort((a, b) => b.share - a.share || a.id - b.id);
                if (contenders.length) {
                    return { winnerEmpireId: contenders[0].id, victoryType: "PLANETARY_DOMINION" };
                }
            }
        }

        if (isConditionEnabled(state, "economicSupremacy")) {
            const totalPopulation = activePlayers.reduce((sum, player) => sum + countEmpirePopulation(state, player.id), 0);
            const threshold = getVictoryConfig(state).economicSupremacyThreshold ?? 0.6;
            if (totalPopulation > 0) {
                const contenders = activePlayers
                    .map(player => ({
                        id: player.id,
                        share: countEmpirePopulation(state, player.id) / totalPopulation
                    }))
                    .filter(entry => entry.share >= threshold)
                    .sort((a, b) => b.share - a.share || a.id - b.id);
                if (contenders.length) {
                    return { winnerEmpireId: contenders[0].id, victoryType: "ECONOMIC_SUPREMACY" };
                }
            }
        }

        if (isConditionEnabled(state, "techMilestones")) {
            const techThreshold = getVictoryConfig(state).techMilestoneTotal ?? null;
            if (Number.isFinite(techThreshold)) {
                const contenders = activePlayers
                    .map(player => ({
                        playerId: player.id,
                        value: getTotalTechLevels(player.technology)
                    }))
                    .filter(entry => entry.value >= techThreshold);
                if (contenders.length) {
                    return { winnerEmpireId: selectWinnerByValue(contenders), victoryType: "TECH_SUPREMACY" };
                }
            }
        }

        if (isConditionEnabled(state, "scoreThreshold")) {
            const scoreThreshold = getVictoryConfig(state).scoreThreshold ?? null;
            if (Number.isFinite(scoreThreshold)) {
                const scores = activePlayers.map(player => buildScoreEntry(state, player));
                const contenders = scores
                    .filter(entry => entry.score >= scoreThreshold)
                    .map(entry => ({ playerId: entry.playerId, value: entry.score }));
                if (contenders.length) {
                    return { winnerEmpireId: selectWinnerByValue(contenders), victoryType: "SCORE_THRESHOLD" };
                }
            }
        }

        if (isConditionEnabled(state, "productionCapacity")) {
            const productionThreshold = getVictoryConfig(state).productionCapacityShareThreshold ?? null;
            const totalProduction = activePlayers.reduce((sum, player) => sum + countEmpireProductionCapacity(state, player.id), 0);
            if (totalProduction > 0 && Number.isFinite(productionThreshold)) {
                const contenders = activePlayers
                    .map(player => ({
                        id: player.id,
                        share: countEmpireProductionCapacity(state, player.id) / totalProduction
                    }))
                    .filter(entry => entry.share >= productionThreshold)
                    .sort((a, b) => b.share - a.share || a.id - b.id);
                if (contenders.length) {
                    return { winnerEmpireId: contenders[0].id, victoryType: "INDUSTRIAL_SUPREMACY" };
                }
            }
        }

        if (isConditionEnabled(state, "capitalShips")) {
            const capitalThreshold = getVictoryConfig(state).capitalShipCountThreshold ?? null;
            if (Number.isFinite(capitalThreshold)) {
                const contenders = activePlayers
                    .map(player => ({
                        playerId: player.id,
                        value: countCapitalShips(state, player.id)
                    }))
                    .filter(entry => entry.value >= capitalThreshold);
                if (contenders.length) {
                    return { winnerEmpireId: selectWinnerByValue(contenders), victoryType: "CAPITAL_SHIP_SUPREMACY" };
                }
            }
        }

        if (isConditionEnabled(state, "yearLimit")) {
            const maxYear = getVictoryConfig(state).maxYear ?? null;
            if (Number.isFinite(maxYear) && state.year >= maxYear) {
                const scores = activePlayers.map(player => buildScoreEntry(state, player));
                return { winnerEmpireId: selectWinnerByScore(scores), victoryType: "YEAR_LIMIT" };
            }
        }

        if (isConditionEnabled(state, "turnLimit")) {
            const maxTurns = getVictoryConfig(state).maxTurns ?? state.rules?.maxTurns ?? 250;
            if (state.turnCount >= maxTurns) {
                const scores = activePlayers.map(player => buildScoreEntry(state, player));
                return { winnerEmpireId: selectWinnerByScore(scores), victoryType: "TURN_LIMIT" };
            }
        }

        return null;
    },
    buildScoreEntry
};
