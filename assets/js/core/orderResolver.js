import { ORDER_TYPES } from "../models/orders.js";
import {
    adjustAllocationForField,
    getTechnologyModifiers,
    getTechnologyStateForEmpire,
    normalizeAllocation
} from "./technologyResolver.js";
import { enforceAllocationRules, resolveRaceModifiers } from "./raceTraits.js";

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
    const designId = order.payload?.designId;
    if (!star || star.owner !== order.issuerId) {
        logOrderError(state, `Invalid BUILD_SHIPS order from ${order.issuerId}.`);
        return;
    }
    const designs = state.shipDesigns?.[order.issuerId] || [];
    const blueprint = designId
        ? designs.find(design => design.designId === designId)
        : designs?.[designIndex];
    if (!blueprint) {
        logOrderError(state, `Unknown ship design for BUILD_SHIPS.`);
        return;
    }
    if (star.queue) {
        logOrderError(state, `Star ${star.id} already has a build queue.`);
        return;
    }
    const techState = getTechnologyStateForEmpire(state, order.issuerId);
    const modifiers = getTechnologyModifiers(techState);
    const adjustedCost = Math.ceil(blueprint.cost * modifiers.shipCost);
    const economy = state.economy?.[order.issuerId];
    if (!economy || economy.credits < adjustedCost) {
        logOrderError(state, `Insufficient credits to build ${blueprint.name}.`);
        return;
    }
    economy.credits -= adjustedCost;
    star.queue = { type: "ship", bp: blueprint, cost: adjustedCost, done: 0, owner: order.issuerId };
};

const resolveLayMines = (state, order) => {
    const fleet = getFleetById(state, order.payload?.fleetId);
    const mineUnitsToDeploy = Math.max(0, Math.floor(order.payload?.mineUnitsToDeploy || 0));
    if (!fleet || fleet.owner !== order.issuerId) {
        logOrderError(state, `Invalid LAY_MINES order from ${order.issuerId}.`);
        return;
    }
    if (fleet.mineLayingCapacity <= 0) {
        logOrderError(state, `Fleet ${fleet.id} lacks mine-laying capacity.`);
        return;
    }
    const maxDeploy = Math.min(fleet.mineUnits, fleet.mineLayingCapacity);
    if (mineUnitsToDeploy <= 0 || mineUnitsToDeploy > maxDeploy) {
        logOrderError(state, `Fleet ${fleet.id} has insufficient mine units.`);
        return;
    }
    if (!state.minefieldLayingOrders) {
        state.minefieldLayingOrders = [];
    }
    state.minefieldLayingOrders.push({
        fleetId: fleet.id,
        mineUnitsToDeploy,
        type: order.payload?.type || "standard"
    });
};

const resolveSweepMines = (state, order) => {
    const fleet = getFleetById(state, order.payload?.fleetId);
    const minefieldId = order.payload?.minefieldId;
    if (!fleet || fleet.owner !== order.issuerId) {
        logOrderError(state, `Invalid SWEEP_MINES order from ${order.issuerId}.`);
        return;
    }
    if (fleet.mineSweepingStrength <= 0) {
        logOrderError(state, `Fleet ${fleet.id} lacks mine-sweeping capability.`);
        return;
    }
    if (!Number.isFinite(minefieldId)) {
        logOrderError(state, `Invalid SWEEP_MINES target for fleet ${fleet.id}.`);
        return;
    }
    if (!state.minefieldSweepOrders) {
        state.minefieldSweepOrders = [];
    }
    state.minefieldSweepOrders.push({ fleetId: fleet.id, minefieldId });
};

const resolveStargateJump = (state, order) => {
    const fleet = getFleetById(state, order.payload?.fleetId);
    const sourcePlanetId = order.payload?.sourcePlanetId;
    const destinationPlanetId = order.payload?.destinationPlanetId;
    if (!fleet || fleet.owner !== order.issuerId) {
        logOrderError(state, `Invalid STARGATE_JUMP order from ${order.issuerId}.`);
        return;
    }
    const source = getStarById(state, sourcePlanetId);
    const destination = getStarById(state, destinationPlanetId);
    if (!source || !destination) {
        logOrderError(state, `Invalid STARGATE_JUMP endpoint for fleet ${fleet.id}.`);
        return;
    }
    if (!source.hasStargate || !destination.hasStargate) {
        logOrderError(state, `Stargate missing for fleet ${fleet.id}.`);
        return;
    }
    const dx = destination.x - source.x;
    const dy = destination.y - source.y;
    const distance = Math.hypot(dx, dy);
    if (distance > source.stargateRange) {
        logOrderError(state, `Destination out of range for fleet ${fleet.id}.`);
        return;
    }
    if (!Number.isFinite(source.stargateMassLimit) || source.stargateMassLimit <= 0) {
        logOrderError(state, `Stargate mass limit unavailable for fleet ${fleet.id}.`);
        return;
    }
    if (Math.hypot(fleet.x - source.x, fleet.y - source.y) > 12) {
        logOrderError(state, `Fleet ${fleet.id} must be at source stargate to jump.`);
        return;
    }
    if (!state.stargateOrders) {
        state.stargateOrders = [];
    }
    state.stargateOrders.push({ fleetId: fleet.id, sourcePlanetId, destinationPlanetId });
};

const resolveResearch = (state, order) => {
    const techState = getTechnologyStateForEmpire(state, order.issuerId);
    if (!techState) {
        return;
    }
    const fields = state.rules?.technologyFields || [];
    const raceModifiers = resolveRaceModifiers(state.race).modifiers;
    const allocationRules = (allocation, appliedFields) => enforceAllocationRules(allocation, appliedFields, raceModifiers);
    const allocation = order.payload?.allocation;
    const fieldId = order.payload?.fieldId;
    const share = order.payload?.share;
    if (allocation && typeof allocation === "object") {
        techState.allocation = normalizeAllocation(allocation, fields, allocationRules);
        return;
    }
    if (fieldId && Number.isFinite(share)) {
        techState.allocation = adjustAllocationForField(techState.allocation, fields, fieldId, share, allocationRules);
        return;
    }
    logOrderError(state, "Invalid RESEARCH order payload.");
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
                case ORDER_TYPES.DEPLOY_MINEFIELD:
                case ORDER_TYPES.LAY_MINES:
                    resolveLayMines(state, order);
                    break;
                case ORDER_TYPES.SWEEP_MINES:
                    resolveSweepMines(state, order);
                    break;
                case ORDER_TYPES.STARGATE_JUMP:
                    resolveStargateJump(state, order);
                    break;
                default:
                    logOrderError(state, `Unknown order type ${order.type}.`);
            }
        });
    }
};
