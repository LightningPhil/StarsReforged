import { TurnEngine } from "./turnEngine.js";
import { assembleGameState, deserializeOrdersState, deserializePlayerState } from "./loadState.js";
import { serializeHistoryState, serializePlayerState, serializeUniverseState } from "./saveState.js";

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeOrderStates = (orderStates) => normalizeArray(orderStates).flatMap(state => {
    if (!state) {
        return [];
    }
    const deserialized = deserializeOrdersState(state);
    return deserialized?.orders || [];
});

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
    });

    const combinedOrders = normalizeOrderStates(orderStates);
    gameState.orders = combinedOrders;
    const nextState = TurnEngine.processTurn(gameState);

    const nextUniverseState = serializeUniverseState(nextState);
    const nextPlayerStates = nextState.players.map(player => serializePlayerState(nextState, player.id));
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
    const nextState = TurnEngine.processTurn(gameState);
    return {
        newUniverseState: serializeUniverseState(nextState),
        playerViews: nextState.players.map(player => serializePlayerState(nextState, player.id))
    };
};
