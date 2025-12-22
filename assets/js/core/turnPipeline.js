import { TurnEngine } from "./turnEngine.js";
import { assembleGameState, deserializeOrdersState, deserializePlayerState } from "./loadState.js";
import { serializeHistoryState, serializeUniverseState } from "./saveState.js";

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeOrderStates = (orderStates) => normalizeArray(orderStates).flatMap(state => {
    if (!state) {
        return [];
    }
    const deserialized = deserializeOrdersState(state);
    return deserialized?.orders || [];
});

const mapPlanetKnowledgeById = (entries) => normalizeArray(entries)
    .filter(entry => Number.isFinite(entry?.id))
    .reduce((acc, entry) => {
        acc[entry.id] = {
            id: entry.id,
            name: entry.name ?? null,
            x: entry.x ?? null,
            y: entry.y ?? null,
            snapshot: entry.snapshot ? { ...entry.snapshot } : null,
            turn_seen: entry.turn_seen ?? null
        };
        return acc;
    }, {});

const normalizeOrdersInput = (orders) => {
    if (Array.isArray(orders)) {
        return orders;
    }
    if (orders && typeof orders === "object") {
        return Object.values(orders).flatMap(value => normalizeArray(value));
    }
    return [];
};

export const runTurnPipeline = ({ universeState, playerStates, orderStates }) => {
    const gameState = assembleGameState({
        universeState,
        playerState: null,
        rules: universeState?.rules,
        aiConfig: universeState?.aiConfig
    });
    if (!gameState) {
        return null;
    }
    const perPlayerStates = normalizeArray(playerStates)
        .map(state => deserializePlayerState(state))
        .filter(Boolean);
    perPlayerStates.forEach(playerState => {
        if (!playerState) {
            return;
        }
        const playerId = playerState.playerId;
        if (playerState.economy) {
            gameState.economy[playerId] = {
                credits: playerState.economy.credits,
                minerals: playerState.economy.minerals,
                mineralStock: { ...playerState.economy.mineralStock }
            };
        }
        const player = gameState.players.find(entry => entry.id === playerId);
        if (player && playerState.research) {
            player.technology = playerState.research;
        }
        if (playerState.planet_knowledge?.length) {
            if (!gameState.planetKnowledge) {
                gameState.planetKnowledge = {};
            }
            gameState.planetKnowledge[playerId] = mapPlanetKnowledgeById(playerState.planet_knowledge);
        }
    });

    const combinedOrders = normalizeOrderStates(orderStates);
    gameState.orders = combinedOrders;
    const turnResult = TurnEngine.processTurn(gameState);
    const nextState = turnResult.nextState;

    const nextUniverseState = serializeUniverseState(nextState);
    const nextPlayerStates = turnResult.playerStates;
    const historyState = serializeHistoryState(nextState);

    return {
        universeState: nextUniverseState,
        playerStates: nextPlayerStates,
        historyState
    };
};

export const runHostTurn = ({ universeState, orders }) => {
    const gameState = assembleGameState({
        universeState,
        playerState: null,
        rules: universeState?.rules,
        aiConfig: universeState?.aiConfig
    });
    if (!gameState) {
        return null;
    }
    gameState.orders = normalizeOrdersInput(orders);
    const turnResult = TurnEngine.processTurn(gameState);
    return {
        newUniverseState: serializeUniverseState(turnResult.nextState),
        playerViews: turnResult.playerStates
    };
};
