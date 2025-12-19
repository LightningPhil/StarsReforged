import { Fleet, Message, Minefield, ResourcePacket, Star } from "../models/entities.js";
import { dist, intSqrt } from "./utils.js";
import { CombatResolver } from "./combatResolver.js";
import { OrderResolver } from "./orderResolver.js";

const cloneStar = (star) => {
    const clone = new Star({ id: star.id, x: star.x, y: star.y, name: star.name, owner: star.owner });
    clone.pop = star.pop;
    clone.mins = { ...star.mins };
    clone.def = { ...star.def };
    clone.queue = star.queue ? { ...star.queue } : null;
    clone.visible = star.visible;
    clone.known = star.known;
    clone.snapshot = star.snapshot ? { ...star.snapshot } : null;
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
    clone.colonize = fleet.colonize || false;
    return clone;
};

const clonePacket = (packet) => new ResourcePacket({ ...packet });
const cloneMinefield = (minefield) => new Minefield({ ...minefield });
const cloneMessage = (message) => new Message({ ...message });

const cloneGameState = (state) => ({
    turnCount: state.turnCount,
    year: state.year,
    credits: state.credits,
    minerals: state.minerals,
    mineralStock: { ...state.mineralStock },
    aiCredits: state.aiCredits,
    aiMinerals: state.aiMinerals,
    aiMineralStock: { ...state.aiMineralStock },
    stars: state.stars.map(cloneStar),
    fleets: state.fleets.map(cloneFleet),
    packets: state.packets.map(clonePacket),
    minefields: state.minefields.map(cloneMinefield),
    designs: state.designs,
    aiDesigns: state.aiDesigns,
    messages: state.messages.map(cloneMessage),
    battles: state.battles.slice(),
    sectorScans: state.sectorScans.map(scan => ({ ...scan })),
    logs: state.logs.slice(),
    turnHash: state.turnHash,
    empireCache: { ...state.empireCache },
    research: { ...state.research, levels: state.research.levels.slice() },
    rngSeed: state.rngSeed,
    rng: state.rng,
    nextFleetId: state.nextFleetId,
    nextPacketId: state.nextPacketId,
    race: state.race,
    diplomacy: { ...state.diplomacy, status: { ...state.diplomacy.status } },
    orders: state.orders ? state.orders.slice() : [],
    combatReports: state.combatReports ? state.combatReports.slice() : [],
    turnHistory: state.turnHistory ? state.turnHistory.slice() : [],
    turnEvents: [],
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

const resolveMovement = (state) => {
    const nextPositions = new Map();
    state.fleets
        .slice()
        .sort((a, b) => a.id - b.id)
        .forEach(fleet => {
            if (!fleet.dest) {
                return;
            }
            const speed = fleet.speed;
            const fuelUse = Math.max(1, Math.floor(speed / 60));
            if (fleet.fuel <= 0) {
                fleet.dest = null;
                state.orderErrors.push(`${fleet.name} lacked fuel and could not move.`);
                return;
            }
            const move = stepToward(fleet, fleet.dest.x, fleet.dest.y, speed);
            nextPositions.set(fleet.id, { ...move, fuelUse });
        });

    state.fleets.forEach(fleet => {
        const move = nextPositions.get(fleet.id);
        if (!move) {
            return;
        }
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
        const result = CombatResolver.resolve(systemId, group.fleets, group.star);
        state.fleets = state.fleets.filter(fleet => !group.fleets.includes(fleet));
        state.fleets.push(...result.fleets);
        if (result.report) {
            state.combatReports.unshift(result.report);
        }
    });
};

const resolveProduction = (state) => {
    let taxTotal = 0;
    let industrialOutput = 0;
    state.stars
        .filter(star => star.owner)
        .sort((a, b) => a.id - b.id)
        .forEach(star => {
            const income = Math.floor(star.pop / 900);
            const iGain = Math.floor((star.def.mines * star.mins.i) / 120);
            const bGain = Math.floor((star.def.mines * star.mins.b) / 120);
            const gGain = Math.floor((star.def.mines * star.mins.g) / 120);

            if (star.owner === 1) {
                taxTotal += income;
                industrialOutput += star.def.facts;
                state.mineralStock.i += iGain;
                state.mineralStock.b += bGain;
                state.mineralStock.g += gGain;
            } else if (star.owner === 2) {
                state.aiCredits += income;
                state.aiMineralStock.i += iGain;
                state.aiMineralStock.b += bGain;
                state.aiMineralStock.g += gGain;
            }

            if (star.queue) {
                star.queue.done += star.def.facts;
                if (star.queue.done >= star.queue.cost) {
                    if (star.queue.type === "ship") {
                        const fleetId = state.nextFleetId++;
                        state.fleets.push(new Fleet({
                            id: fleetId,
                            owner: star.queue.owner,
                            x: star.x,
                            y: star.y,
                            name: `${star.queue.bp.name} ${fleetId}`,
                            design: star.queue.bp
                        }));
                    } else if (star.queue.type === "structure") {
                        if (star.queue.kind === "mine") {
                            star.def.mines += star.queue.count;
                        } else if (star.queue.kind === "factory") {
                            star.def.facts += star.queue.count;
                        } else if (star.queue.kind === "base") {
                            star.def.base = { name: "Starbase I", hp: 1000 };
                        }
                    }
                    star.queue = null;
                }
            }
        });

    state.minerals = state.mineralStock.i + state.mineralStock.b + state.mineralStock.g;
    state.aiMinerals = state.aiMineralStock.i + state.aiMineralStock.b + state.aiMineralStock.g;
    state.credits += taxTotal;
    state.empireCache = { taxTotal, industrialOutput };
};

const resolvePopulation = (state) => {
    const growthPermille = 1020 + state.research.levels[5] * 5;
    state.stars
        .filter(star => star.owner)
        .sort((a, b) => a.id - b.id)
        .forEach(star => {
            const grown = Math.floor((star.pop * growthPermille) / 1000);
            star.pop = Math.min(1500000, grown);
        });
};

const resolveResearch = (state) => {
    const budget = Math.floor((state.credits * state.research.budget) / 1000);
    state.research.progress += budget;
    const cost = 400 + state.research.levels[state.research.field] * 200;
    if (state.research.progress >= cost) {
        state.research.levels[state.research.field]++;
        state.research.progress = 0;
    }
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
                state.activeScanners.push({ x: fleet.x, y: fleet.y, r: fleet.scan, owner: 1 });
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
            state.fleets = state.fleets.filter(item => item.id !== fleet.id);
        });
};

export const TurnEngine = {
    processTurn(gameState) {
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
        resolveCombat(state);
        resolveColonization(state);
        resolveProduction(state);
        resolvePopulation(state);
        resolveResearch(state);
        resolveVisibility(state);

        state.orders = [];
        state.turnEvents.push({ type: \"TURN_COMPLETE\", turn: state.turnCount });
        return state;
    }
};
