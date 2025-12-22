const getUniverseStorageKey = (gameId) => `game_${gameId}_universe`;

const getPlayerStorageKey = (gameId, playerId) => `game_${gameId}_player_${playerId}`;

const readLocalStorageJson = (key) => {
    if (typeof localStorage === "undefined") {
        return null;
    }
    const raw = localStorage.getItem(key);
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
};

const writeLocalStorageJson = (key, value) => {
    if (typeof localStorage === "undefined") {
        return false;
    }
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        return false;
    }
};

export const loadUniverseStateFromStorage = (gameId) => readLocalStorageJson(getUniverseStorageKey(gameId));

export const saveUniverseStateToStorage = (gameId, state) => (
    writeLocalStorageJson(getUniverseStorageKey(gameId), state)
);

export const loadPlayerStateFromStorage = (gameId, playerId) => (
    readLocalStorageJson(getPlayerStorageKey(gameId, playerId))
);

export const savePlayerStateToStorage = (gameId, playerId, state) => (
    writeLocalStorageJson(getPlayerStorageKey(gameId, playerId), state)
);

export { getUniverseStorageKey, getPlayerStorageKey };
