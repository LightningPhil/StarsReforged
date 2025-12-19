import { ORDER_TYPES } from "../models/orders.js";

const getFleetById = (state, fleetId) => state.fleets.find(fleet => fleet.id === fleetId);
const getStarById = (state, starId) => state.stars.find(star => star.id === starId);

const logOrderError = (state, message) => {
    if (!state.orderErrors) {
        state.orderErrors = [];
    }
    state.orderErrors.push(message);
};

const resolveMoveFleet = (state, order) => {
    const fleet = getFleetById(state, order.payload?.fleetId);
    if (!fleet || fleet.owner !== order.issuerId) {
        logOrderError(state, `Invalid MOVE_FLEET order from ${order.issuerId}.`);
        return;
    }
    const dest = order.payload?.dest;
    if (!dest || !Number.isFinite(dest.x) || !Number.isFinite(dest.y)) {
        logOrderError(state, `Invalid MOVE_FLEET destination for fleet ${fleet.id}.`);
        return;
    }
    fleet.dest = { x: dest.x, y: dest.y };
};

const resolveColonize = (state, order) => {
    const fleet = getFleetById(state, order.payload?.fleetId);
    if (!fleet || fleet.owner !== order.issuerId) {
        logOrderError(state, `Invalid COLONIZE order from ${order.issuerId}.`);
        return;
    }
    if (!fleet.design.flags.includes("colonize")) {
        logOrderError(state, `Fleet ${fleet.id} cannot colonize.`); 
        return;
    }
    fleet.colonize = true;
};

const resolveScrapFleet = (state, order) => {
    const fleet = getFleetById(state, order.payload?.fleetId);
    if (!fleet || fleet.owner !== order.issuerId) {
        logOrderError(state, `Invalid SCRAP_FLEET order from ${order.issuerId}.`);
        return;
    }
    state.fleets = state.fleets.filter(item => item.id !== fleet.id);
};

const resolveBuildShips = (state, order) => {
    const star = getStarById(state, order.payload?.starId);
    const designIndex = order.payload?.designIndex;
    if (!star || star.owner !== order.issuerId) {
        logOrderError(state, `Invalid BUILD_SHIPS order from ${order.issuerId}.`);
        return;
    }
    const designs = order.issuerId === 1 ? state.designs : state.aiDesigns;
    const blueprint = designs?.[designIndex];
    if (!blueprint) {
        logOrderError(state, `Unknown design index ${designIndex} for BUILD_SHIPS.`);
        return;
    }
    if (star.queue) {
        logOrderError(state, `Star ${star.id} already has a build queue.`);
        return;
    }
    const economy = state.economy?.[order.issuerId];
    if (!economy || economy.credits < blueprint.cost) {
        logOrderError(state, `Insufficient credits to build ${blueprint.name}.`);
        return;
    }
    economy.credits -= blueprint.cost;
    star.queue = { type: "ship", bp: blueprint, cost: blueprint.cost, done: 0, owner: order.issuerId };
};

const resolveResearch = (state, order) => {
    if (order.issuerId !== 1) {
        return;
    }
    const field = order.payload?.field;
    const budget = order.payload?.budget;
    if (!Number.isFinite(field) || !Number.isFinite(budget)) {
        logOrderError(state, "Invalid RESEARCH order payload.");
        return;
    }
    state.research.field = field;
    state.research.budget = budget;
};

export const OrderResolver = {
    lockOrders(orders = []) {
        return orders.slice().map(order => ({ ...order, payload: { ...order.payload } }));
    },

    resolveOrders(state, orders) {
        orders.forEach(order => {
            switch (order.type) {
                case ORDER_TYPES.MOVE_FLEET:
                    resolveMoveFleet(state, order);
                    break;
                case ORDER_TYPES.COLONIZE:
                    resolveColonize(state, order);
                    break;
                case ORDER_TYPES.SCRAP_FLEET:
                    resolveScrapFleet(state, order);
                    break;
                case ORDER_TYPES.BUILD_SHIPS:
                    resolveBuildShips(state, order);
                    break;
                case ORDER_TYPES.RESEARCH:
                    resolveResearch(state, order);
                    break;
                default:
                    logOrderError(state, `Unknown order type ${order.type}.`);
            }
        });
    }
};
