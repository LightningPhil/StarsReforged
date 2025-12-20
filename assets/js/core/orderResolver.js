import { ORDER_TYPES, WAYPOINT_TASKS } from "../models/orders.js";
import {
    adjustAllocationForField,
    getTechnologyModifiers,
    getTechnologyStateForEmpire,
    normalizeAllocation
} from "./technologyResolver.js";
import { enforceAllocationRules, resolveRaceModifiers } from "./raceTraits.js";

const getFleetById = (state, fleetId) => state.fleets.find(fleet => fleet.id === fleetId);
const getStarById = (state, starId) => state.stars.find(star => star.id === starId);
const DEFAULT_MINERAL_RATIO = { i: 0.4, b: 0.3, g: 0.3 };

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

const resolveSetWaypoints = (state, order) => {
    const fleet = getFleetById(state, order.payload?.fleetId);
    if (!fleet || fleet.owner !== order.issuerId) {
        logOrderError(state, `Invalid SET_WAYPOINTS order from ${order.issuerId}.`);
        return;
    }
    const waypoints = Array.isArray(order.payload?.waypoints) ? order.payload.waypoints : null;
    if (!waypoints) {
        logOrderError(state, `Invalid SET_WAYPOINTS payload for fleet ${fleet.id}.`);
        return;
    }
    const allowedTasks = new Set(Object.values(WAYPOINT_TASKS));
    const normalized = waypoints
        .map(point => ({
            x: point?.x,
            y: point?.y,
            task: point?.task ?? null,
            data: point?.data ?? null
        }))
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
        .map(point => ({
            ...point,
            task: point.task && allowedTasks.has(point.task) ? point.task : null
        }));
    if (!normalized.length) {
        logOrderError(state, `SET_WAYPOINTS requires at least one waypoint for fleet ${fleet.id}.`);
        return;
    }
    fleet.waypoints = normalized;
    fleet.dest = { x: normalized[0].x, y: normalized[0].y };
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
    star.queue = {
        type: "ship",
        bp: blueprint,
        cost: adjustedCost,
        done: 0,
        owner: order.issuerId,
        mineralCost: {
            i: Math.ceil(adjustedCost * DEFAULT_MINERAL_RATIO.i),
            b: Math.ceil(adjustedCost * DEFAULT_MINERAL_RATIO.b),
            g: Math.ceil(adjustedCost * DEFAULT_MINERAL_RATIO.g)
        }
    };
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
    const maxRange = Math.min(source.stargateRange || 0, destination.stargateRange || 0);
    if (distance > maxRange) {
        logOrderError(state, `Destination out of range for fleet ${fleet.id}.`);
        return;
    }
    if (!Number.isFinite(source.stargateMassLimit) || source.stargateMassLimit <= 0) {
        logOrderError(state, `Stargate mass limit unavailable for fleet ${fleet.id}.`);
        return;
    }
    if (!Number.isFinite(destination.stargateMassLimit) || destination.stargateMassLimit <= 0) {
        logOrderError(state, `Destination stargate mass limit unavailable for fleet ${fleet.id}.`);
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
                case ORDER_TYPES.SET_WAYPOINTS:
                    resolveSetWaypoints(state, order);
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
