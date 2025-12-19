import { ORDER_TYPES } from "../models/orders.js";
import { Minefield } from "../models/minefield.js";
import {
    adjustAllocationForField,
    getTechnologyModifiers,
    getTechnologyStateForEmpire,
    normalizeAllocation
} from "./technologyResolver.js";

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

const resolveDeployMinefield = (state, order) => {
    const fleet = getFleetById(state, order.payload?.fleetId);
    const mineUnitsToDeploy = Math.max(0, Math.floor(order.payload?.mineUnitsToDeploy || 0));
    if (!fleet || fleet.owner !== order.issuerId) {
        logOrderError(state, `Invalid DEPLOY_MINEFIELD order from ${order.issuerId}.`);
        return;
    }
    if (fleet.dest) {
        logOrderError(state, `Fleet ${fleet.id} must be stationary to deploy minefields.`);
        return;
    }
    if (!fleet.design.flags.includes("minelayer")) {
        logOrderError(state, `Fleet ${fleet.id} lacks a minelayer module.`);
        return;
    }
    if (mineUnitsToDeploy <= 0 || mineUnitsToDeploy > fleet.mineUnits) {
        logOrderError(state, `Fleet ${fleet.id} has insufficient mine units.`);
        return;
    }
    const centerX = order.payload?.centerX ?? fleet.x;
    const centerY = order.payload?.centerY ?? fleet.y;
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
        logOrderError(state, `Invalid DEPLOY_MINEFIELD center for fleet ${fleet.id}.`);
        return;
    }
    const radiusPerUnit = state.rules?.minefields?.radiusPerUnit ?? 0.6;
    const radius = Math.max(20, Math.floor(Math.sqrt(mineUnitsToDeploy) * 6 + mineUnitsToDeploy * radiusPerUnit));
    const minefieldId = state.minefields.reduce((max, field) => Math.max(max, field.id), 0) + 1;
    const newField = new Minefield({
        id: minefieldId,
        ownerEmpireId: fleet.owner,
        center: { x: centerX, y: centerY },
        radius,
        strength: mineUnitsToDeploy,
        type: "standard",
        turnCreated: state.turnCount
    });
    const existing = state.minefields.find(field => field.ownerEmpireId === fleet.owner && (
        Math.hypot(field.center.x - centerX, field.center.y - centerY) <= field.radius + radius
    ));
    if (existing) {
        const totalStrength = existing.strength + newField.strength;
        const weightedX = (existing.center.x * existing.strength + newField.center.x * newField.strength) / totalStrength;
        const weightedY = (existing.center.y * existing.strength + newField.center.y * newField.strength) / totalStrength;
        existing.center = { x: weightedX, y: weightedY };
        existing.strength = totalStrength;
        existing.radius = Math.sqrt(existing.radius * existing.radius + radius * radius);
    } else {
        state.minefields.push(newField);
    }
    fleet.mineUnits -= mineUnitsToDeploy;
};

const resolveResearch = (state, order) => {
    const techState = getTechnologyStateForEmpire(state, order.issuerId);
    if (!techState) {
        return;
    }
    const fields = state.rules?.technologyFields || [];
    const allocation = order.payload?.allocation;
    const fieldId = order.payload?.fieldId;
    const share = order.payload?.share;
    if (allocation && typeof allocation === "object") {
        techState.allocation = normalizeAllocation(allocation, fields);
        return;
    }
    if (fieldId && Number.isFinite(share)) {
        techState.allocation = adjustAllocationForField(techState.allocation, fields, fieldId, share);
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
                    resolveDeployMinefield(state, order);
                    break;
                default:
                    logOrderError(state, `Unknown order type ${order.type}.`);
            }
        });
    }
};
