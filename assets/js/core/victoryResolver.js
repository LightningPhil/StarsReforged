import { getTotalTechLevels } from "./technologyResolver.js";

const countEmpirePlanets = (state, empireId) => state.stars.filter(star => star.owner === empireId).length;
const countEmpireShips = (state, empireId) => state.fleets.filter(fleet => fleet.owner === empireId).length;
const countEmpirePopulation = (state, empireId) => state.stars
    .filter(star => star.owner === empireId)
    .reduce((sum, star) => sum + star.pop, 0);

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

export const VictoryResolver = {
    check(state) {
        if (!state?.players?.length) {
            return null;
        }
        const activePlayers = state.players.filter(player => player.status === "active");
        if (!activePlayers.length) {
            return null;
        }

        const aliveEmpires = activePlayers.filter(player => {
            const planets = countEmpirePlanets(state, player.id);
            const ships = countEmpireShips(state, player.id);
            return planets > 0 || ships > 0;
        });

        if (aliveEmpires.length === 1) {
            return { winnerEmpireId: aliveEmpires[0].id, victoryType: "TOTAL_ANNIHILATION" };
        }

        const totalPopulation = activePlayers.reduce((sum, player) => sum + countEmpirePopulation(state, player.id), 0);
        const threshold = state.rules?.victory?.economicSupremacyThreshold ?? 0.6;
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

        const maxTurns = state.rules?.victory?.maxTurns ?? state.rules?.maxTurns ?? 250;
        if (state.turnCount >= maxTurns) {
            const scores = activePlayers.map(player => buildScoreEntry(state, player));
            return { winnerEmpireId: selectWinnerByScore(scores), victoryType: "TURN_LIMIT" };
        }

        return null;
    },
    buildScoreEntry
};
