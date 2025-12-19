const buildStarOwnership = (stars) => {
    const counts = new Map();
    stars.forEach(star => {
        if (!star.owner) {
            return;
        }
        counts.set(star.owner, (counts.get(star.owner) || 0) + 1);
    });
    return counts;
};

const countRecentCaptures = (state, playerId) => {
    const previous = state.turnHistory?.[0]?.stars || [];
    let captures = 0;
    state.stars.forEach(star => {
        const prior = previous.find(item => item.id === star.id);
        if (prior && prior.owner && prior.owner !== playerId && star.owner === playerId) {
            captures += 1;
        }
    });
    return captures;
};

export const calculateScores = (state, rules) => {
    const scoring = rules.scoring || {};
    const results = [];
    const starCounts = buildStarOwnership(state.stars);

    state.players.forEach(player => {
        const economy = state.economy?.[player.id];
        const resources = (economy?.credits || 0) + (economy?.minerals || 0);
        const units = state.fleets.filter(fleet => fleet.owner === player.id).length;
        const starsOwned = starCounts.get(player.id) || 0;
        let score = (starsOwned * scoring.starValue) + (resources * scoring.resourceValue) + (units * scoring.unitValue);

        if (scoring.turnEfficiency?.enabled) {
            const remaining = Math.max(0, (rules.maxTurns || 0) - state.turnCount);
            score += remaining * scoring.turnEfficiency.value;
        }
        if (scoring.aggression?.enabled) {
            const captures = countRecentCaptures(state, player.id);
            score += captures * scoring.aggression.value;
        }

        results.push({
            playerId: player.id,
            score,
            starsOwned,
            units,
            resources,
            eliminatedAtTurn: player.eliminatedAtTurn ?? null
        });
    });

    return results;
};

export const resolveDefeats = (state) => {
    const starCounts = buildStarOwnership(state.stars);
    state.players.forEach(player => {
        if (player.status !== "active") {
            return;
        }
        const owned = starCounts.get(player.id) || 0;
        if (owned === 0) {
            player.status = "defeated";
            player.eliminatedAtTurn = state.turnCount;
        }
    });
};

const determineWinnerByScore = (scores) => {
    const ranked = scores.slice().sort((a, b) => b.score - a.score || a.playerId - b.playerId);
    return ranked[0]?.playerId || null;
};

export const evaluateVictory = (state, rules) => {
    const starCounts = buildStarOwnership(state.stars);
    const activePlayers = state.players.filter(player => player.status === "active");
    const activeWithStars = activePlayers.filter(player => (starCounts.get(player.id) || 0) > 0);
    const victoryConditions = rules.victoryConditions || {};

    let winnerId = null;
    let reason = null;

    if (victoryConditions.totalDomination && state.stars.length > 0) {
        const uniqueOwners = new Set(state.stars.map(star => star.owner).filter(Boolean));
        if (uniqueOwners.size === 1) {
            winnerId = [...uniqueOwners][0];
            reason = "TOTAL_DOMINATION";
        }
    }

    if (!winnerId && victoryConditions.elimination) {
        if (activeWithStars.length === 1) {
            winnerId = activeWithStars[0].id;
            reason = "ELIMINATION";
        }
    }

    if (!winnerId && victoryConditions.turnLimit && state.turnCount >= rules.maxTurns) {
        const scores = calculateScores(state, rules);
        winnerId = determineWinnerByScore(scores);
        reason = "TURN_LIMIT";
    }

    if (!winnerId) {
        return { isGameOver: false, reason: null, gameResult: null };
    }

    const scores = calculateScores(state, rules);
    const ranked = scores.slice().sort((a, b) => b.score - a.score || a.playerId - b.playerId);
    const playerResults = ranked.map((result, index) => ({
        playerId: result.playerId,
        score: result.score,
        rank: index + 1,
        eliminatedAtTurn: result.eliminatedAtTurn
    }));

    return {
        isGameOver: true,
        reason,
        gameResult: {
            winnerId,
            finalTurn: state.turnCount,
            playerResults
        }
    };
};
