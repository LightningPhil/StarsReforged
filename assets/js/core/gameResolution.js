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
