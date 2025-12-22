import { ORDER_TYPES, WAYPOINT_TASKS } from "../models/orders.js";
import { DB } from "../data/db.js";
import { ResourcePacket } from "../models/entities.js";
import {
    adjustAllocationForField,
    getTechnologyModifiers,
    getTechnologyStateForEmpire,
    normalizeAllocation
} from "./technologyResolver.js";
import { enforceAllocationRules, resolveRaceModifiers } from "./raceTraits.js";

const getRaceForEmpire = (state, empireId) => {
    const player = state.players?.find(entry => entry.id === empireId);
    return player?.race || state.race;
};

const getFleetById = (state, fleetId) => state.fleets.find(fleet => fleet.id === fleetId);
const getStarById = (state, starId) => state.stars.find(star => star.id === starId);
const DEFAULT_MINERAL_RATIO = { i: 0.4, b: 0.3, g: 0.3 };
const getFleetCargoMass = (fleet) => {
    const cargo = fleet.cargo || {};
    return (cargo.i || 0) + (cargo.b || 0) + (cargo.g || 0) + (cargo.pop || 0);
};

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
            data: point?.data ?? null,
            speed: Number.isFinite(point?.speed) ? Math.max(1, Math.floor(point.speed)) : null
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
    if (!state.fleetScrapOrders) {
        state.fleetScrapOrders = [];
    }
    state.fleetScrapOrders.push({ fleetId: fleet.id });
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

const resolveBuildStructure = (state, order) => {
    const star = getStarById(state, order.payload?.starId);
    const kind = order.payload?.kind;
    const count = Math.max(1, Math.floor(order.payload?.count || 1));
    if (!star || star.owner !== order.issuerId) {
        logOrderError(state, `Invalid BUILD_STRUCTURE order from ${order.issuerId}.`);
        return;
    }
    const structure = DB.structures?.[kind];
    if (!structure) {
        logOrderError(state, `Unknown structure for BUILD_STRUCTURE.`);
        return;
    }
    if (star.queue) {
        logOrderError(state, `Star ${star.id} already has a build queue.`);
        return;
    }
    if (kind === "base" && star.def.base) {
        logOrderError(state, `Star ${star.id} already has a starbase.`);
        return;
    }
    const economy = state.economy?.[order.issuerId];
    const cost = structure.cost * count;
    if (!economy || economy.credits < cost) {
        logOrderError(state, `Insufficient credits to build ${structure.name}.`);
        return;
    }
    economy.credits -= cost;
    star.queue = {
        type: "structure",
        kind,
        count,
        cost,
        done: 0,
        owner: order.issuerId,
        mineralCost: {
            i: Math.ceil(cost * DEFAULT_MINERAL_RATIO.i),
            b: Math.ceil(cost * DEFAULT_MINERAL_RATIO.b),
            g: Math.ceil(cost * DEFAULT_MINERAL_RATIO.g)
        }
    };
};

const resolveScanSector = (state, order) => {
    const star = getStarById(state, order.payload?.starId);
    if (!star || star.owner !== order.issuerId) {
        logOrderError(state, `Invalid SCAN_SECTOR order from ${order.issuerId}.`);
        return;
    }
    const modifiers = getTechnologyModifiers(getTechnologyStateForEmpire(state, order.issuerId));
    const range = Math.floor(200 * modifiers.shipRange);
    if (!state.sectorScans) {
        state.sectorScans = [];
    }
    state.sectorScans.push({
        x: star.x,
        y: star.y,
        r: range,
        owner: order.issuerId,
        expires: state.turnCount
    });
};

const withdrawMinerals = (stock, amount) => {
    if (!stock) {
        return false;
    }
    let remaining = amount;
    const take = (key) => {
        const used = Math.min(stock[key], remaining);
        stock[key] -= used;
        remaining -= used;
    };
    take("i");
    take("b");
    take("g");
    return remaining <= 0;
};

const resolveLaunchPacket = (state, order) => {
    const origin = getStarById(state, order.payload?.originId);
    const targetId = order.payload?.targetId;
    const amount = Math.max(0, Math.floor(order.payload?.amount || 0));
    if (!origin || origin.owner !== order.issuerId) {
        logOrderError(state, `Invalid LAUNCH_PACKET order from ${order.issuerId}.`);
        return;
    }
    const target = getStarById(state, targetId);
    if (!target) {
        logOrderError(state, `Invalid LAUNCH_PACKET target for ${order.issuerId}.`);
        return;
    }
    if (!amount) {
        logOrderError(state, `Invalid LAUNCH_PACKET payload for ${order.issuerId}.`);
        return;
    }
    if (!withdrawMinerals(origin.mins, amount)) {
        logOrderError(state, `Insufficient minerals for packet launch.`);
        return;
    }
    const raceModifiers = resolveRaceModifiers(getRaceForEmpire(state, order.issuerId)).modifiers;
    const efficiency = raceModifiers.massDriverEfficiency || 1;
    const payload = Math.max(0, Math.floor(amount * efficiency));
    if (payload <= 0) {
        logOrderError(state, `Packet launch failed due to efficiency losses.`);
        return;
    }
    const driverRules = state.rules?.massDriver || {};
    const driverSpeed = driverRules.speed ?? null;
    const driverRating = driverRules.driverRating ?? driverSpeed ?? null;
    state.packets.push(new ResourcePacket({
        id: state.nextPacketId++,
        x: origin.x,
        y: origin.y,
        destX: target.x,
        destY: target.y,
        destId: target.id,
        payload,
        owner: order.issuerId,
        speed: driverSpeed,
        driverRating
    }));
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
    const raceModifiers = resolveRaceModifiers(getRaceForEmpire(state, order.issuerId)).modifiers;
    const dx = destination.x - source.x;
    const dy = destination.y - source.y;
    const distance = Math.hypot(dx, dy);
    const maxRange = Math.min(source.stargateRange || 0, destination.stargateRange || 0)
        * (raceModifiers.stargateRangeMultiplier || 1);
    if (maxRange <= 0) {
        logOrderError(state, `Destination out of range for fleet ${fleet.id}.`);
        return;
    }
    if (distance > maxRange * 5) {
        logOrderError(state, `Destination out of range for fleet ${fleet.id}.`);
        return;
    }
    const isInterstellarTraveler = getRaceForEmpire(state, order.issuerId)?.primaryTrait === "IT";
    const cargoMass = getFleetCargoMass(fleet);
    if (!isInterstellarTraveler && cargoMass > 0) {
        logOrderError(state, `Fleet ${fleet.id} cannot gate cargo without Interstellar Traveler.`);
        return;
    }
    const massLimitMultiplier = raceModifiers.stargateMassMultiplier || 1;
    if (!Number.isFinite(source.stargateMassLimit) || source.stargateMassLimit * massLimitMultiplier <= 0) {
        logOrderError(state, `Stargate mass limit unavailable for fleet ${fleet.id}.`);
        return;
    }
    if (!Number.isFinite(destination.stargateMassLimit) || destination.stargateMassLimit * massLimitMultiplier <= 0) {
        logOrderError(state, `Destination stargate mass limit unavailable for fleet ${fleet.id}.`);
        return;
    }
    const totalMass = (fleet.mass || 0) + cargoMass;
    const maxMass = Math.min(source.stargateMassLimit || 0, destination.stargateMassLimit || 0) * massLimitMultiplier;
    if (totalMass > maxMass * 5) {
        logOrderError(state, `Fleet ${fleet.id} exceeds stargate mass limits.`);
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

const resolveMergeFleet = (state, order) => {
    const sourceFleetId = order.payload?.sourceFleetId ?? order.payload?.fleetId;
    const targetFleetId = order.payload?.targetFleetId;
    const source = getFleetById(state, sourceFleetId);
    const target = getFleetById(state, targetFleetId);
    if (!source || !target || source.owner !== order.issuerId || target.owner !== order.issuerId) {
        logOrderError(state, `Invalid MERGE_FLEET order from ${order.issuerId}.`);
        return;
    }
    if (source.id === target.id) {
        logOrderError(state, `MERGE_FLEET requires two distinct fleets.`);
        return;
    }
    if (!state.fleetMergeOrders) {
        state.fleetMergeOrders = [];
    }
    state.fleetMergeOrders.push({ sourceFleetId: source.id, targetFleetId: target.id });
};

const resolveSplitFleet = (state, order) => {
    const fleet = getFleetById(state, order.payload?.fleetId);
    const stacks = order.payload?.stacks;
    if (!fleet || fleet.owner !== order.issuerId) {
        logOrderError(state, `Invalid SPLIT_FLEET order from ${order.issuerId}.`);
        return;
    }
    if (!Array.isArray(stacks) || !stacks.length) {
        logOrderError(state, `SPLIT_FLEET requires stacks to split.`);
        return;
    }
    if (!state.fleetSplitOrders) {
        state.fleetSplitOrders = [];
    }
    state.fleetSplitOrders.push({
        fleetId: fleet.id,
        name: order.payload?.name,
        stacks: stacks.map(stack => ({
            designId: stack?.designId,
            count: Math.max(0, Math.floor(stack?.count || 0))
        })),
        cargo: order.payload?.cargo || null,
        fuel: order.payload?.fuel
    });
};

const resolveTransferFleet = (state, order) => {
    const sourceFleetId = order.payload?.sourceFleetId ?? order.payload?.fromFleetId;
    const targetFleetId = order.payload?.targetFleetId ?? order.payload?.toFleetId;
    const source = getFleetById(state, sourceFleetId);
    const target = getFleetById(state, targetFleetId);
    if (!source || !target || source.owner !== order.issuerId || target.owner !== order.issuerId) {
        logOrderError(state, `Invalid TRANSFER_FLEET order from ${order.issuerId}.`);
        return;
    }
    if (source.id === target.id) {
        logOrderError(state, `TRANSFER_FLEET requires two distinct fleets.`);
        return;
    }
    if (!state.fleetTransferOrders) {
        state.fleetTransferOrders = [];
    }
    state.fleetTransferOrders.push({
        sourceFleetId: source.id,
        targetFleetId: target.id,
        stacks: Array.isArray(order.payload?.stacks)
            ? order.payload.stacks.map(stack => ({
                designId: stack?.designId,
                count: Math.max(0, Math.floor(stack?.count || 0))
            }))
            : null,
        cargo: order.payload?.cargo || null,
        fuel: order.payload?.fuel
    });
};

const resolveResearch = (state, order) => {
    const techState = getTechnologyStateForEmpire(state, order.issuerId);
    if (!techState) {
        return;
    }
    const fields = state.rules?.technologyFields || [];
    const raceModifiers = resolveRaceModifiers(getRaceForEmpire(state, order.issuerId)).modifiers;
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
                case ORDER_TYPES.MERGE_FLEET:
                    resolveMergeFleet(state, order);
                    break;
                case ORDER_TYPES.SPLIT_FLEET:
                    resolveSplitFleet(state, order);
                    break;
                case ORDER_TYPES.TRANSFER_FLEET:
                    resolveTransferFleet(state, order);
                    break;
                case ORDER_TYPES.BUILD_SHIPS:
                    resolveBuildShips(state, order);
                    break;
                case ORDER_TYPES.BUILD_STRUCTURE:
                    resolveBuildStructure(state, order);
                    break;
                case ORDER_TYPES.RESEARCH:
                    resolveResearch(state, order);
                    break;
                case ORDER_TYPES.SCAN_SECTOR:
                    resolveScanSector(state, order);
                    break;
                case ORDER_TYPES.DEPLOY_MINEFIELD:
                case ORDER_TYPES.LAY_MINES:
                    resolveLayMines(state, order);
                    break;
                case ORDER_TYPES.LAUNCH_PACKET:
                    resolveLaunchPacket(state, order);
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
