import { Fleet, Message, ResourcePacket, Star } from "../models/entities.js";
import { Minefield } from "../models/minefield.js";
import { dist, intSqrt } from "./utils.js";
import { CombatResolver } from "./combatResolver.js";
import { OrderResolver } from "./orderResolver.js";
import {
    calculateEmpireResearchPoints,
    getTechnologyModifiers,
    getTechnologyStateForEmpire,
    resolveResearchForEmpire
} from "./technologyResolver.js";

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
    clone.armor = fleet.armor;
    clone.structure = fleet.structure;
    clone.shields = fleet.shields;
    clone.mineUnits = fleet.mineUnits;
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

const lineIntersectsCircle = (start, end, center, radius) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fx = start.x - center.x;
    const fy = start.y - center.y;
    const a = dx * dx + dy * dy;
    if (a === 0) {
        return dist(start, center) <= radius;
    }
    const b = 2 * (fx * dx + fy * dy);
    const c = (fx * fx + fy * fy) - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        return false;
    }
    const sqrtD = Math.sqrt(discriminant);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
};

const rememberMinefield = (state, empireId, minefield, knownOwner = false) => {
    if (!state.minefieldIntel) {
        state.minefieldIntel = {};
    }
    if (!state.minefieldIntel[empireId]) {
        state.minefieldIntel[empireId] = [];
    }
    const intel = state.minefieldIntel[empireId];
    const existing = intel.find(entry => entry.id === minefield.id);
    const payload = {
        id: minefield.id,
        center: { ...minefield.center },
        radius: minefield.radius,
        estimatedStrength: Math.ceil(minefield.strength),
        ownerEmpireId: knownOwner ? minefield.ownerEmpireId : null,
        lastSeenTurn: state.turnCount
    };
    if (existing) {
        Object.assign(existing, payload);
        return;
    }
    intel.push(payload);
};

const applyMinefieldDamage = (state, fleet, minefield) => {
    const rules = state.rules?.minefields || {};
    const maxMineDamage = rules.maxMineDamage ?? 24;
    const decayFactor = rules.decayFactor ?? 0.5;
    const density = minefield.density;
    const chanceToHit = Math.min(1, Math.max(0, density * (fleet.design.signature || 1)));
    const roll = state.rng.nextInt(10000) / 10000;
    if (roll > chanceToHit) {
        return false;
    }
    const damage = 1 + state.rng.nextInt(maxMineDamage);
    let remaining = damage;
    if (fleet.armor > 0) {
        const absorbed = Math.min(fleet.armor, remaining);
        fleet.armor -= absorbed;
        remaining -= absorbed;
    }
    if (remaining > 0) {
        fleet.structure -= remaining;
    }
    fleet.hp = Math.max(0, fleet.armor + fleet.structure + fleet.shields);
    minefield.strength = Math.max(0, minefield.strength - damage * decayFactor);
    if (state.turnEvents) {
        state.turnEvents.push({
            type: "MINEFIELD_HIT",
            fleetId: fleet.id,
            minefieldId: minefield.id,
            damage
        });
    }
    return fleet.structure <= 0;
};

const resolveMovement = (state) => {
    const nextPositions = new Map();
    const destroyedFleets = new Set();
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
        const path = { start: move.start, end };
        state.minefields
            .slice()
            .sort((a, b) => a.id - b.id)
            .forEach(minefield => {
                if (fleet.owner === minefield.ownerEmpireId) {
                    return;
                }
                if (!lineIntersectsCircle(path.start, path.end, minefield.center, minefield.radius)) {
                    return;
                }
                const destroyed = applyMinefieldDamage(state, fleet, minefield);
                rememberMinefield(state, fleet.owner, minefield, false);
                if (destroyed) {
                    destroyedFleets.add(fleet.id);
                }
            });
        fleet.x = move.x;
        fleet.y = move.y;
        if (move.arrived) {
            fleet.dest = null;
            fleet.fuel = Math.max(0, fleet.fuel - move.fuelUse * 2);
        } else {
            fleet.fuel = Math.max(0, fleet.fuel - move.fuelUse);
        }
    });
    if (destroyedFleets.size) {
        state.fleets = state.fleets.filter(fleet => !destroyedFleets.has(fleet.id));
    }
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

            const economy = state.economy?.[star.owner];
            if (!economy) {
                return;
            }
            if (star.owner === 1) {
                taxTotal += income;
                industrialOutput += star.def.facts;
            }
            economy.credits += income;
            economy.mineralStock.i += iGain;
            economy.mineralStock.b += bGain;
            economy.mineralStock.g += gGain;

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

    Object.values(state.economy || {}).forEach(entry => {
        entry.minerals = entry.mineralStock.i + entry.mineralStock.b + entry.mineralStock.g;
    });
    const playerEconomy = state.economy?.[1];
    if (playerEconomy) {
        state.credits = playerEconomy.credits;
        state.mineralStock = { ...playerEconomy.mineralStock };
        state.minerals = playerEconomy.minerals;
    }
    state.empireCache = { taxTotal, industrialOutput };
};

const resolvePopulation = (state) => {
    state.stars
        .filter(star => star.owner)
        .sort((a, b) => a.id - b.id)
        .forEach(star => {
            const modifiers = getTechnologyModifiers(getTechnologyStateForEmpire(state, star.owner));
            const grown = Math.floor(star.pop * 1.02 * modifiers.populationGrowth);
            star.pop = Math.min(1500000, grown);
        });
};

const resolveResearch = (state) => {
    state.players.forEach(player => {
        const techState = getTechnologyStateForEmpire(state, player.id);
        if (!techState) {
            return;
        }
        const totalRP = calculateEmpireResearchPoints(state, player.id);
        resolveResearchForEmpire(techState, totalRP, state.rules);
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
        if (visible || minefield.ownerEmpireId === 1) {
            rememberMinefield(state, 1, minefield, true);
        }
    });
};

const resolveMinefieldDecay = (state) => {
    const decayRate = state.rules?.minefields?.turnDecay ?? 0.98;
    state.minefields = state.minefields
        .map(field => {
            field.strength *= decayRate;
            return field;
        })
        .filter(field => field.strength >= 1);
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
        resolveCombat(state);
        resolveColonization(state);
        resolveResearch(state);
        resolveProduction(state);
        resolvePopulation(state);
        resolveVisibility(state);
        resolveMinefieldDecay(state);

        state.orders = [];
        state.turnEvents.push({ type: "TURN_COMPLETE", turn: state.turnCount });
        return state;
    }
};
