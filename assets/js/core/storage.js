const getUniverseStorageKey = (gameId) => `game_${gameId}_universe`;

const getPlayerStorageKey = (gameId, playerId) => `game_${gameId}_player_${playerId}`;

const rleEncode = (input) => {
    if (!input) {
        return "";
    }
    let output = "";
    let count = 1;
    for (let i = 1; i <= input.length; i += 1) {
        if (input[i] === input[i - 1] && count < 255) {
            count += 1;
        } else {
            output += `${String.fromCharCode(count)}${input[i - 1]}`;
            count = 1;
        }
    }
    return output;
};

const rleDecode = (input) => {
    if (!input) {
        return "";
    }
    let output = "";
    for (let i = 0; i < input.length; i += 2) {
        const count = input.charCodeAt(i);
        const char = input[i + 1] || "";
        output += char.repeat(count);
    }
    return output;
};

const xorCipher = (input, key) => {
    if (!key) {
        return input;
    }
    let output = "";
    for (let i = 0; i < input.length; i += 1) {
        output += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return output;
};

const encodePayload = (value, options = {}) => {
    const json = JSON.stringify(value);
    const compressed = options.compress ? rleEncode(json) : json;
    const encrypted = options.key ? xorCipher(compressed, options.key) : compressed;
    return btoa(encrypted);
};

const decodePayload = (value, options = {}) => {
    try {
        const decoded = atob(value);
        const decrypted = options.key ? xorCipher(decoded, options.key) : decoded;
        const inflated = options.compress ? rleDecode(decrypted) : decrypted;
        return JSON.parse(inflated);
    } catch (error) {
        return null;
    }
};

const readLocalStorageJson = (key, options = {}) => {
    if (typeof localStorage === "undefined") {
        return null;
    }
    const raw = localStorage.getItem(key);
    if (!raw) {
        return null;
    }
    return decodePayload(raw, options);
};

const writeLocalStorageJson = (key, value, options = {}) => {
    if (typeof localStorage === "undefined") {
        return false;
    }
    try {
        localStorage.setItem(key, encodePayload(value, options));
        return true;
    } catch (error) {
        return false;
    }
};

export const loadUniverseStateFromStorage = (gameId, options) => readLocalStorageJson(getUniverseStorageKey(gameId), options);

export const saveUniverseStateToStorage = (gameId, state, options) => (
    writeLocalStorageJson(getUniverseStorageKey(gameId), state, options)
);

export const loadPlayerStateFromStorage = (gameId, playerId, options) => (
    readLocalStorageJson(getPlayerStorageKey(gameId, playerId), options)
);

export const savePlayerStateToStorage = (gameId, playerId, state, options) => (
    writeLocalStorageJson(getPlayerStorageKey(gameId, playerId), state, options)
);

export { getUniverseStorageKey, getPlayerStorageKey };
