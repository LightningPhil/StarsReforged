export const SAVE_SCHEMA_VERSION = 1;

export const SAVE_FORMATS = {
    UNIVERSE: "stars-universe",
    PLAYER: "stars-player",
    ORDERS: "stars-orders",
    HISTORY: "stars-history"
};

export const UNIVERSE_STATE_SCHEMA = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    format: SAVE_FORMATS.UNIVERSE,
    turnCount: 0,
    year: 2400,
    credits: 0,
    minerals: 0,
    mineralStock: { i: 0, b: 0, g: 0 },
    rngSeed: "0",
    turnHash: "0",
    nextFleetId: 1,
    nextPacketId: 1,
    rules: {},
    aiConfig: {},
    players: [],
    economy: {},
    planets: [],
    fleets: [],
    packets: [],
    minefields: [],
    wormholes: [],
    shipDesigns: {},
    diplomacy: { status: {}, lastWarning: 0 },
    orders: [],
    messages: [],
    logs: [],
    combatReports: [],
    turnHistory: [],
    turnEvents: [],
    minefieldIntel: {},
    wormholeIntel: {},
    empireCache: { taxTotal: 0, industrialOutput: 0 },
    state: "RUNNING",
    winnerEmpireId: null,
    researchFocus: null,
    race: null
};

export const PLAYER_STATE_SCHEMA = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    format: SAVE_FORMATS.PLAYER,
    playerId: 1,
    turnCount: 0,
    year: 2400,
    economy: null,
    research: {},
    researchFocus: null,
    diplomacy: { status: {}, lastWarning: 0 },
    planets: [],
    fleets: [],
    packets: [],
    orders: [],
    messages: [],
    shipDesigns: []
};

export const ORDERS_STATE_SCHEMA = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    format: SAVE_FORMATS.ORDERS,
    playerId: 1,
    turnCount: 0,
    year: 2400,
    orders: []
};

export const HISTORY_STATE_SCHEMA = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    format: SAVE_FORMATS.HISTORY,
    turnCount: 0,
    year: 2400,
    scores: [],
    logs: [],
    battles: [],
    combatReports: [],
    turnHistory: [],
    turnEvents: [],
    messages: []
};

export const createUniverseStateDTO = (data) => ({
    schemaVersion: SAVE_SCHEMA_VERSION,
    format: SAVE_FORMATS.UNIVERSE,
    ...data
});

export const createPlayerStateDTO = (data) => ({
    schemaVersion: SAVE_SCHEMA_VERSION,
    format: SAVE_FORMATS.PLAYER,
    ...data
});

export const createOrdersStateDTO = (data) => ({
    schemaVersion: SAVE_SCHEMA_VERSION,
    format: SAVE_FORMATS.ORDERS,
    ...data
});

export const createHistoryStateDTO = (data) => ({
    schemaVersion: SAVE_SCHEMA_VERSION,
    format: SAVE_FORMATS.HISTORY,
    ...data
});
