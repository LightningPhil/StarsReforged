import { Fleet, Message, ResourcePacket, Star } from "../models/entities.js";
import { Minefield } from "../models/minefield.js";
import { dist, intSqrt } from "./utils.js";
import { CombatResolver } from "./combatResolver.js";
import { OrderResolver } from "./orderResolver.js";
import {
    resolveMinefieldDecay,
    resolveMinefieldLaying,
    resolveMinefieldSweeping,
    resolveMinefieldTransitDamage,
    resolveStargateJumps
} from "./gameResolution.js";
import {
    calculateEmpireResearchPoints,
    getTechnologyModifiers,
    getTechnologyStateForEmpire,
    resolveResearchForEmpire
} from "./technologyResolver.js";
import { resolvePlanetEconomy } from "./planetEconomyResolver.js";
import { resolveRaceModifiers } from "./raceTraits.js";

const cloneStar = (star) => {
    const clone = new Star({ id: star.id, x: star.x, y: star.y, name: star.name, owner: star.owner });
    clone.pop = star.pop;
    clone.mins = { ...star.mins };
    clone.concentration = star.concentration ? { ...star.concentration } : { ...clone.mins };
    clone.environment = star.environment ? { ...star.environment } : clone.environment;
    clone.habitability = star.habitability ?? clone.habitability;
    clone.deathRate = star.deathRate ?? clone.deathRate;
    clone.factories = star.factories ?? clone.factories;
    clone.mines = star.mines ?? clone.mines;
    clone.def = { ...star.def };
    clone.queue = star.queue ? { ...star.queue } : null;
    clone.autoBuild = star.autoBuild ? { ...star.autoBuild } : null;
    clone.terraforming = star.terraforming ? { ...star.terraforming } : clone.terraforming;
    clone.visible = star.visible;
    clone.known = star.known;
    clone.snapshot = star.snapshot ? { ...star.snapshot } : null;
    clone.hasStargate = star.hasStargate;
    clone.stargateMassLimit = star.stargateMassLimit;
    clone.stargateRange = star.stargateRange;
    clone.stargateTechLevel = star.stargateTechLevel;
    return clone;
};

const cloneFleet = (fleet) => {
    const clone = new Fleet({
        id: fleet.id,
        owner: fleet.owner,
        x: fleet.x,
        y: fleet.y,
        name: fleet.name,
        design: fleet.design
    });
    clone.fuel = fleet.fuel;
    clone.dest = fleet.dest ? { ...fleet.dest } : null;
    clone.hp = fleet.hp;
    clone.armor = fleet.armor;
    clone.structure = fleet.structure;
    clone.shields = fleet.shields;
    clone.mineUnits = fleet.mineUnits;
    clone.mineLayingCapacity = fleet.mineLayingCapacity;
    clone.mineSweepingStrength = fleet.mineSweepingStrength;
    clone.mineHitpoints = fleet.mineHitpoints;
    clone.mass = fleet.mass;
    clone.colonize = fleet.colonize || false;
    return clone;
};

const clonePacket = (packet) => new ResourcePacket({ ...packet });
const cloneMinefield = (minefield) => new Minefield({ ...minefield });
const cloneMessage = (message) => new Message({ ...message });
const cloneTechnology = (technology) => {
    if (!technology) {
        return null;
    }
    const fields = technology.fields ? Object.fromEntries(Object.entries(technology.fields).map(([id, field]) => ([
        id,
        { ...field }
    ]))) : {};
    return {
        fields,
        allocation: technology.allocation ? { ...technology.allocation } : {}
    };
};

const cloneGameState = (state) => ({
    turnCount: state.turnCount,
    year: state.year,
    credits: state.credits,
    minerals: state.minerals,
    mineralStock: { ...state.mineralStock },
    economy: state.economy ? Object.fromEntries(Object.entries(state.economy).map(([id, entry]) => ([
        id,
        { credits: entry.credits, minerals: entry.minerals, mineralStock: { ...entry.mineralStock } }
    ]))) : {},
    stars: state.stars.map(cloneStar),
    fleets: state.fleets.map(cloneFleet),
    packets: state.packets.map(clonePacket),
    minefields: state.minefields.map(cloneMinefield),
    shipDesigns: state.shipDesigns ? Object.fromEntries(Object.entries(state.shipDesigns).map(([id, designs]) => ([
        id,
        designs.map(design => ({ ...design, finalStats: { ...design.finalStats } }))
    ]))) : {},
    minefieldIntel: state.minefieldIntel ? Object.fromEntries(Object.entries(state.minefieldIntel).map(([id, intel]) => ([
        id,
        intel.map(record => ({ ...record, center: { ...record.center } }))
    ]))) : {},
    messages: state.messages.map(cloneMessage),
    battles: state.battles.slice(),
    sectorScans: state.sectorScans.map(scan => ({ ...scan })),
    logs: state.logs.slice(),
    turnHash: state.turnHash,
    empireCache: { ...state.empireCache },
    state: state.state,
    winnerEmpireId: state.winnerEmpireId,
    researchFocus: state.researchFocus,
    rules: state.rules,
    rngSeed: state.rngSeed,
    rng: state.rng,
    nextFleetId: state.nextFleetId,
    nextPacketId: state.nextPacketId,
    race: state.race,
    diplomacy: { ...state.diplomacy, status: { ...state.diplomacy.status } },
    players: state.players ? state.players.map(player => ({ ...player, technology: cloneTechnology(player.technology) })) : [],
    orders: state.orders ? state.orders.slice() : [],
    combatReports: state.combatReports ? state.combatReports.slice() : [],
    turnHistory: state.turnHistory ? state.turnHistory.slice() : [],
    turnEvents: state.turnEvents ? state.turnEvents.slice() : [],
    movementPaths: [],
    minefieldLayingOrders: [],
    minefieldSweepOrders: [],
    stargateOrders: [],
    orderErrors: []
});

const stepToward = (entity, destX, destY, speed) => {
    const dx = destX - entity.x;
    const dy = destY - entity.y;
    const distance = intSqrt(dx * dx + dy * dy);
    if (distance <= speed) {
        return { x: destX, y: destY, arrived: true };
    }
    const scale = Math.floor((speed * 1000) / distance);
    return {
        x: entity.x + Math.floor((dx * scale) / 1000),
        y: entity.y + Math.floor((dy * scale) / 1000),
        arrived: false
    };
};

const getFleetSpeed = (state, fleet) => {
    const modifiers = getTechnologyModifiers(getTechnologyStateForEmpire(state, fleet.owner));
    return Math.max(15, Math.floor(fleet.design.speed * 12 * modifiers.shipSpeed));
};

const getFleetScanRange = (state, fleet) => {
    const modifiers = getTechnologyModifiers(getTechnologyStateForEmpire(state, fleet.owner));
    return Math.floor(fleet.design.range * modifiers.shipRange);
};

const resolveMovement = (state) => {
    const nextPositions = new Map();
    state.fleets
        .slice()
        .sort((a, b) => a.id - b.id)
        .forEach(fleet => {
            if (!fleet.dest) {
                return;
            }
            const speed = getFleetSpeed(state, fleet);
            const fuelUse = Math.max(1, Math.floor(speed / 60));
            if (fleet.fuel <= 0) {
                fleet.dest = null;
                state.orderErrors.push(`${fleet.name} lacked fuel and could not move.`);
                return;
            }
            const move = stepToward(fleet, fleet.dest.x, fleet.dest.y, speed);
            nextPositions.set(fleet.id, { ...move, fuelUse, start: { x: fleet.x, y: fleet.y } });
        });

    state.fleets.forEach(fleet => {
        const move = nextPositions.get(fleet.id);
        if (!move) {
            return;
        }
        const end = { x: move.x, y: move.y };
        state.movementPaths.push({ fleetId: fleet.id, start: move.start, end });
        fleet.x = move.x;
        fleet.y = move.y;
        if (move.arrived) {
            fleet.dest = null;
            fleet.fuel = Math.max(0, fleet.fuel - move.fuelUse * 2);
        } else {
            fleet.fuel = Math.max(0, fleet.fuel - move.fuelUse);
        }
    });
};

const resolveCombat = (state) => {
    const fleetsBySystem = new Map();
    state.fleets.forEach(fleet => {
        const star = state.stars.find(st => dist(st, fleet) < 12);
        if (!star) {
            return;
        }
        if (!fleetsBySystem.has(star.id)) {
            fleetsBySystem.set(star.id, { star, fleets: [] });
        }
        fleetsBySystem.get(star.id).fleets.push(fleet);
    });

    fleetsBySystem.forEach((group, systemId) => {
        const owners = new Set(group.fleets.map(fleet => fleet.owner));
        const hasHostiles = owners.size > 1 || (group.star.owner && !owners.has(group.star.owner));
        if (!hasHostiles) {
            return;
        }
        const result = CombatResolver.resolve(systemId, group.fleets, group.star, (empireId) => (
            getTechnologyModifiers(getTechnologyStateForEmpire(state, empireId))
        ));
        state.fleets = state.fleets.filter(fleet => !group.fleets.includes(fleet));
        state.fleets.push(...result.fleets);
        if (result.report) {
            state.combatReports.unshift(result.report);
        }
    });
};

const resolveResearch = (state) => {
    const raceModifiers = resolveRaceModifiers(state.race).modifiers;
    state.players.forEach(player => {
        const techState = getTechnologyStateForEmpire(state, player.id);
        if (!techState) {
            return;
        }
        const totalRP = calculateEmpireResearchPoints(state, player.id, raceModifiers);
        resolveResearchForEmpire(techState, totalRP, state.rules, raceModifiers);
    });
};

const resolveVisibility = (state) => {
    state.activeScanners = [];
    state.sectorScans = state.sectorScans.filter(scan => scan.expires >= state.turnCount);
    state.stars
        .slice()
        .sort((a, b) => a.id - b.id)
        .forEach(star => {
            if (star.owner === 1) {
                state.activeScanners.push({ x: star.x, y: star.y, r: 260, owner: 1 });
            }
        });
    state.fleets
        .slice()
        .sort((a, b) => a.id - b.id)
        .forEach(fleet => {
            if (fleet.owner === 1) {
                const range = getFleetScanRange(state, fleet);
                state.activeScanners.push({ x: fleet.x, y: fleet.y, r: range, owner: 1 });
            }
        });
    state.sectorScans.forEach(scan => state.activeScanners.push(scan));

    state.stars
        .slice()
        .sort((a, b) => a.id - b.id)
        .forEach(star => {
            const visible = state.activeScanners.some(scan => dist(scan, star) <= scan.r);
            if (visible) {
                star.visible = true;
                star.known = true;
                star.updateSnapshot();
            } else if (star.known) {
                star.visible = false;
            }
        });

    state.minefields.forEach(minefield => {
        const visible = state.activeScanners.some(scan => dist(scan, minefield.center) <= scan.r);
        if (minefield.visibility === "all" || visible || minefield.ownerEmpireId === 1) {
            const intel = {
                id: minefield.id,
                center: { ...minefield.center },
                radius: minefield.radius,
                estimatedStrength: Math.ceil(minefield.strength),
                ownerEmpireId: minefield.ownerEmpireId,
                lastSeenTurn: state.turnCount
            };
            if (!state.minefieldIntel) {
                state.minefieldIntel = {};
            }
            if (!state.minefieldIntel[1]) {
                state.minefieldIntel[1] = [];
            }
            const existing = state.minefieldIntel[1].find(entry => entry.id === minefield.id);
            if (existing) {
                Object.assign(existing, intel);
            } else {
                state.minefieldIntel[1].push(intel);
            }
        }
    });
};

const resolveColonization = (state) => {
    state.fleets
        .filter(fleet => fleet.colonize)
        .forEach(fleet => {
            const star = state.stars.find(st => dist(st, fleet) < 12);
            if (!star || star.owner) {
                return;
            }
            star.owner = fleet.owner;
            star.pop = 2500;
            star.def.mines = 20;
            star.def.facts = 20;
            star.mines = 20;
            star.factories = 20;
            state.fleets = state.fleets.filter(item => item.id !== fleet.id);
        });
};

export const TurnEngine = {
    processTurn(gameState) {
        if (gameState.state === "ENDED") {
            return cloneGameState(gameState);
        }
        const archivedState = {
            turn: gameState.turnCount,
            year: gameState.year,
            stars: gameState.stars.map(star => ({ id: star.id, owner: star.owner, pop: star.pop })),
            fleets: gameState.fleets.map(fleet => ({ id: fleet.id, owner: fleet.owner, x: fleet.x, y: fleet.y }))
        };
        const state = cloneGameState(gameState);
        state.year += 1;
        state.turnCount += 1;
        state.turnHistory.unshift(archivedState);

        const lockedOrders = OrderResolver.lockOrders(state.orders);
        OrderResolver.resolveOrders(state, lockedOrders);

        resolveMovement(state);
        resolveMinefieldLaying(state);
        resolveMinefieldSweeping(state);
        resolveMinefieldTransitDamage(state);
        resolveMinefieldDecay(state);
        resolveStargateJumps(state);
        resolvePlanetEconomy(state);
        resolveCombat(state);
        resolveColonization(state);
        resolveResearch(state);
        resolveVisibility(state);

        state.orders = [];
        state.turnEvents.push({ type: "TURN_COMPLETE", turn: state.turnCount });
        return state;
    }
};
