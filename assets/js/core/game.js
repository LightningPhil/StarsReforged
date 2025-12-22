import { DB } from "../data/db.js";
import { Fleet, Message, Race, Star } from "../models/entities.js";
import { PCG32 } from "./rng.js";
import { dist, intSqrt } from "./utils.js";
import { TurnEngine } from "./turnEngine.js";
import { AIController } from "../ai/AIController.js";
import { loadConfig } from "./config.js";
import { calculateScores, resolveDefeats } from "./gameResolution.js";
import { getVictoryTypeLabel, VictoryResolver } from "./victoryResolver.js";
import { loadGameStateFromFiles } from "./loadState.js";
import {
    adjustAllocationForField,
    calculateEmpireResearchPoints,
    createTechnologyState,
    getRpToNextLevel,
    getTechnologyModifiers,
    getTechnologyStateForEmpire,
    normalizeAllocation,
    resolveResearchForEmpire
} from "./technologyResolver.js";
import { enforceAllocationRules, resolveRaceModifiers } from "./raceTraits.js";
import { buildShipDesign } from "./shipDesign.js";
import { Order, ORDER_TYPES } from "../models/orders.js";

let ui = null;

export const bindUI = (uiRef) => {
    ui = uiRef;
};

const getDesignForStack = (game, fleet, stack) => {
    const designs = game.shipDesigns?.[fleet.owner] || [];
    if (stack?.designId) {
        const match = designs.find(design => design.designId === stack.designId);
        if (match) {
            return match;
        }
    }
    return fleet.design;
};

const getFleetScannerStrength = (game, fleet) => {
    const stacks = fleet.shipStacks || [];
    if (!stacks.length) {
        return fleet.design?.scanner ?? fleet.design?.finalStats?.scanner ?? 0;
    }
    const sum = stacks.reduce((total, stack) => {
        const design = getDesignForStack(game, fleet, stack);
        const scanner = design?.finalStats?.scanner ?? design?.scanner ?? 0;
        const count = stack?.count || 1;
        return total + Math.pow(Math.max(0, scanner), 4) * count;
    }, 0);
    return sum > 0 ? Math.pow(sum, 0.25) : 0;
};

const getFleetCargoMass = (fleet) => {
    const cargo = fleet.cargo || {};
    return (cargo.i || 0) + (cargo.b || 0) + (cargo.g || 0) + (cargo.pop || 0);
};

const getFleetStackTotals = (game, fleet) => {
    const stacks = fleet.shipStacks || [];
    if (!stacks.length) {
        const mass = fleet.design?.finalStats?.mass ?? fleet.design?.mass ?? 0;
        const cloakPoints = fleet.design?.finalStats?.cloakPoints ?? fleet.design?.cloakPoints ?? fleet.design?.cloak ?? 0;
        return { shipMass: mass, cloakPoints: cloakPoints };
    }
    return stacks.reduce((totals, stack) => {
        const design = getDesignForStack(game, fleet, stack);
        const mass = design?.finalStats?.mass ?? design?.mass ?? 0;
        const cloakPoints = design?.finalStats?.cloakPoints ?? design?.cloakPoints ?? design?.cloak ?? 0;
        const count = stack?.count || 1;
        totals.shipMass += mass * count;
        totals.cloakPoints += cloakPoints * count;
        return totals;
    }, { shipMass: 0, cloakPoints: 0 });
};

const getFleetCloakPercent = (game, fleet) => {
    const totals = getFleetStackTotals(game, fleet);
    const totalMass = totals.shipMass + getFleetCargoMass(fleet);
    if (!totalMass) {
        return 0;
    }
    return Math.round(totals.cloakPoints / totalMass);
};

const getFleetScanRange = (game, fleet) => {
    const modifiers = getTechnologyModifiers(getTechnologyStateForEmpire(game, fleet.owner));
    const scannerStrength = getFleetScannerStrength(game, fleet);
    return Math.floor(scannerStrength * modifiers.shipRange);
};

const getIntelState = (scanners, target, cloakPercent = 0) => {
    const effectiveCloak = Math.min(95, Math.max(0, cloakPercent));
    let bestRatio = null;
    scanners.forEach(scanner => {
        const distance = dist(scanner, target);
        const effectiveRange = scanner.r * (1 - effectiveCloak / 100);
        if (effectiveRange <= 0 || distance > effectiveRange) {
            return;
        }
        const ratio = distance / effectiveRange;
        if (bestRatio === null || ratio < bestRatio) {
            bestRatio = ratio;
        }
    });
    if (bestRatio === null) {
        return "none";
    }
    if (bestRatio <= 0.35) {
        return "penetrated";
    }
    if (bestRatio <= 0.7) {
        return "scanned";
    }
    return "visible";
};

export const Game = {
    turnCount: 0,
    year: 2400,
    credits: 1000,
    minerals: 5000,
    mineralStock: { i: 2000, b: 1500, g: 1500 },
    economy: {},
    stars: [],
    fleets: [],
    packets: [],
    minefields: [],
    wormholes: [],
    shipDesigns: {},
    minefieldIntel: {},
    wormholeIntel: {},
    planetKnowledge: {},
    messages: [],
    battles: [],
    sectorScans: [],
    logs: [],
    orders: [],
    combatReports: [],
    turnHistory: [],
    turnEvents: [],
    orderErrors: [],
    turnHash: 0n,
    empireCache: { taxTotal: 0, industrialOutput: 0 },
    players: [],
    rules: null,
    aiConfig: null,
    aiDifficulty: "normal",
    gameResult: null,
    scores: [],
    state: "RUNNING",
    winnerEmpireId: null,
    researchFocus: null,
    rngSeed: 932515789n,
    rng: null,
    nextFleetId: 1,
    nextPacketId: 1,
    race: new Race({
        name: 'The Ashen Arc',
        type: 'Synthetic Nomads',
        grav: '0.3g - 4.2g',
        temp: '-80° - 140°',
        growth: '+17%',
        mining: 'Adaptive',
        primaryTrait: "HE",
        lesserTraits: ["IFE", "MA"],
        tolerance: {
            grav: { center: 50, width: 35, immune: false },
            temp: { center: 55, width: 40, immune: false },
            rad: { center: 45, width: 30, immune: false }
        }
    }),
    diplomacy: {
        status: {
            2: 'Neutral'
        },
        lastWarning: 0
    },
    selection: null,
    activeScanners: [],
    currentTurnLog: null,
    orderQueues: {},

    init: async function() {
        const configs = await loadConfig();
        this.rules = configs.rules;
        this.aiConfig = configs.ai;
        this.aiDifficulty = configs.ai.defaultDifficulty || "normal";
        const loadedState = await loadGameStateFromFiles({
            playerId: 1,
            rules: this.rules,
            aiConfig: this.aiConfig
        });
        if (loadedState) {
            this.applyLoadedState(loadedState);
        } else {
            this.setupPlayers();
            this.researchFocus = this.rules.technologyFields?.[0]?.id || null;
            this.minerals = this.mineralStock.i + this.mineralStock.b + this.mineralStock.g;
            this.rng = new PCG32(this.rngSeed, 54n);
            this.turnHash = this.hashTurnSeed(this.rngSeed, BigInt(this.turnCount));
            this.seedShipDesigns();

            this.generateGalaxy(80);
            this.seedHomeworld();
            this.seedRivals();

            this.logMsg("Welcome, Emperor. The sector is uncharted.", "System");
        }

        if (ui?.init) {
            ui.init();
        }
        this.updateVisibility();
    },

    applyLoadedState: function(loadedState) {
        this.turnCount = loadedState.turnCount ?? this.turnCount;
        this.year = loadedState.year ?? this.year;
        this.rules = loadedState.rules ?? this.rules;
        this.aiConfig = loadedState.aiConfig ?? this.aiConfig;
        this.players = loadedState.players ?? this.players;
        this.economy = loadedState.economy ?? this.economy;
        this.stars = loadedState.stars ?? this.stars;
        this.fleets = loadedState.fleets ?? this.fleets;
        this.packets = loadedState.packets ?? this.packets;
        this.minefields = loadedState.minefields ?? this.minefields;
        this.wormholes = loadedState.wormholes ?? this.wormholes;
        this.shipDesigns = loadedState.shipDesigns ?? this.shipDesigns;
        this.minefieldIntel = loadedState.minefieldIntel ?? this.minefieldIntel;
        this.wormholeIntel = loadedState.wormholeIntel ?? this.wormholeIntel;
        this.messages = loadedState.messages ?? this.messages;
        this.battles = loadedState.battles ?? this.battles;
        this.sectorScans = loadedState.sectorScans ?? this.sectorScans;
        this.logs = loadedState.logs ?? this.logs;
        this.turnHash = loadedState.turnHash ?? this.turnHash;
        this.empireCache = loadedState.empireCache ?? this.empireCache;
        this.state = loadedState.state ?? this.state;
        this.winnerEmpireId = loadedState.winnerEmpireId ?? this.winnerEmpireId;
        this.researchFocus = loadedState.researchFocus ?? this.researchFocus;
        this.rngSeed = loadedState.rngSeed ?? this.rngSeed;
        this.rng = loadedState.rng ?? new PCG32(this.rngSeed, 54n);
        this.nextFleetId = loadedState.nextFleetId ?? this.nextFleetId;
        this.nextPacketId = loadedState.nextPacketId ?? this.nextPacketId;
        this.race = loadedState.race ?? this.race;
        this.diplomacy = loadedState.diplomacy ?? this.diplomacy;
        this.orders = loadedState.orders ?? this.orders;
        this.rebuildOrderQueues(this.orders);
        this.combatReports = loadedState.combatReports ?? this.combatReports;
        this.turnHistory = loadedState.turnHistory ?? this.turnHistory;
        this.turnEvents = loadedState.turnEvents ?? this.turnEvents;
        this.orderErrors = loadedState.orderErrors ?? this.orderErrors;

        const humanEconomy = this.economy?.[1];
        if (humanEconomy) {
            this.credits = humanEconomy.credits;
            this.mineralStock = { ...humanEconomy.mineralStock };
            this.minerals = humanEconomy.minerals;
        }
    },

    hashMix: function(hash, value) {
        const mask = (1n << 64n) - 1n;
        const mixed = (hash ^ value) * 0x9e3779b97f4a7c15n;
        return mixed & mask;
    },

    hashString: function(text) {
        let hash = 0xcbf29ce484222325n;
        for (let i = 0; i < text.length; i++) {
            hash = this.hashMix(hash, BigInt(text.charCodeAt(i)));
        }
        return hash;
    },

    hashTurnSeed: function(previousHash, turnNumber) {
        let hash = this.hashMix(previousHash, turnNumber);
        hash = this.hashMix(hash, 0x94d049bb133111ebn);
        return hash;
    },

    setupPlayers: function() {
        const aiPlayers = this.aiConfig?.aiPlayers || [2];
        const techFields = this.rules?.technologyFields || [];
        const raceModifiers = resolveRaceModifiers(this.race).modifiers;
        this.players = [
            {
                id: 1,
                type: "human",
                status: "active",
                eliminatedAtTurn: null,
                technology: createTechnologyState(techFields, undefined, raceModifiers)
            },
            ...aiPlayers.map(id => ({
                id,
                type: "ai",
                status: "active",
                eliminatedAtTurn: null,
                technology: createTechnologyState(techFields, undefined, raceModifiers)
            }))
        ];

        const humanStart = this.rules?.startingResources?.human || { credits: 1000, mineralStock: { i: 2000, b: 1500, g: 1500 } };
        const aiStart = this.rules?.startingResources?.ai || { credits: 800, mineralStock: { i: 1500, b: 1000, g: 1000 } };

        this.economy = {};
        this.players.forEach(player => {
            const template = player.type === "human" ? humanStart : aiStart;
            this.economy[player.id] = {
                credits: template.credits,
                mineralStock: { ...template.mineralStock },
                minerals: template.mineralStock.i + template.mineralStock.b + template.mineralStock.g
            };
        });
        const humanEconomy = this.economy[1];
        if (humanEconomy) {
            this.credits = humanEconomy.credits;
            this.mineralStock = { ...humanEconomy.mineralStock };
            this.minerals = humanEconomy.minerals;
        }
    },

    seedShipDesigns: function() {
        const hulls = this.rules?.hulls || [];
        this.shipDesigns = {};
        this.players.forEach(player => {
            this.shipDesigns[player.id] = [];
        });
        const scoutHull = hulls.find(hull => hull.id === "scout") || hulls[0];
        const frigateHull = hulls.find(hull => hull.id === "frigate") || hulls[1] || scoutHull;
        const techState = getTechnologyStateForEmpire(this, 1);
        const scoutBuild = buildShipDesign({
            name: "Probe v1",
            hull: scoutHull,
            componentIds: ["ion_drive", "laser_array", "scanner_array"],
            race: this.race,
            techState
        });
        const colonyBuild = buildShipDesign({
            name: "Colony Ark",
            hull: frigateHull,
            componentIds: ["ion_drive", "laser_array", "colony_pod", "reactor_core"],
            race: this.race,
            techState
        });
        [scoutBuild, colonyBuild].forEach(result => {
            if (result.design) {
                this.shipDesigns[1].push(result.design);
            }
        });
        this.players
            .filter(player => player.type === "ai")
            .forEach(player => {
                AIController.ensureBasicDesigns(this, player.id);
            });
    },

    startTurnLog: function() {
        this.currentTurnLog = {
            turn: this.year,
            events: [],
            rngRolls: [],
            checksum: 0n
        };
    },

    finalizeTurnLog: function() {
        if (!this.currentTurnLog) {
            return;
        }
        let checksum = this.hashMix(0x100000001b3n, BigInt(this.year));
        this.currentTurnLog.events.forEach(event => {
            checksum = this.hashMix(checksum, this.hashString(event));
        });
        this.currentTurnLog.rngRolls.forEach(roll => {
            checksum = this.hashMix(checksum, BigInt(roll));
        });
        this.currentTurnLog.checksum = checksum;
        this.logs.unshift(this.currentTurnLog);
        this.turnHash = checksum;
        this.currentTurnLog = null;
    },

    addEvent: function(text) {
        if (this.currentTurnLog) {
            this.currentTurnLog.events.push(text);
        }
    },

    roll: function(max) {
        const value = this.rng.nextInt(max);
        if (this.currentTurnLog) {
            this.currentTurnLog.rngRolls.push(value);
        }
        return value;
    },

    generateGalaxy: function(count) {
        for (let i = 0; i < count; i++) {
            this.stars.push(new Star({
                id: i,
                x: this.roll(3200),
                y: this.roll(3200),
                name: `S-${120 + i}`,
                owner: null,
                rng: this.rng
            }));
        }
    },

    seedHomeworld: function() {
        const h = this.stars[0];
        h.x = 1600;
        h.y = 1600;
        h.owner = 1;
        h.name = "HOMEWORLD";
        h.pop = 62000;
        h.def.mines = 120;
        h.def.facts = 140;
        h.mines = 120;
        h.factories = 140;
        h.def.base = { name: "Starbase I", hp: 1000 };
        h.hasStargate = true;
        h.stargateMassLimit = 420;
        h.stargateRange = 900;
        h.stargateTechLevel = 1;

        this.fleets.push(new Fleet({
            id: this.nextFleetId++,
            owner: 1,
            x: h.x,
            y: h.y,
            name: "Scout 1",
            design: this.shipDesigns[1]?.[0]
        }));
        this.fleets.push(new Fleet({
            id: this.nextFleetId++,
            owner: 1,
            x: h.x,
            y: h.y,
            name: "Colony 1",
            design: this.shipDesigns[1]?.[1] || this.shipDesigns[1]?.[0]
        }));
    },

    seedRivals: function() {
        const aiPlayers = this.players.filter(player => player.type === "ai");
        if (!aiPlayers.length) {
            return;
        }
        const availableStars = this.stars.filter(star => !star.owner && star.id !== 0);
        aiPlayers.forEach((player, index) => {
            const rival = availableStars[index] || this.stars[10 + index];
            if (!rival) {
                return;
            }
            AIController.ensureBasicDesigns(this, player.id);
            const designs = this.shipDesigns[player.id] || [];
            const raiderDesign = designs.find(design => !design.flags.includes("colonize")) || designs[0];
            rival.owner = player.id;
            rival.name = index === 0 ? "CRIMSON NODE" : `DIRECTORATE-${player.id}`;
            rival.pop = 40000;
            rival.def.mines = 80;
            rival.def.facts = 90;
            rival.def.base = { name: "Ravager Hub", hp: 900 };
            rival.hasStargate = true;
            rival.stargateMassLimit = 360;
            rival.stargateRange = 850;
            rival.stargateTechLevel = 1;

            this.fleets.push(new Fleet({
                id: this.nextFleetId++,
                owner: player.id,
                x: rival.x,
                y: rival.y,
                name: `Raider Wing ${player.id}`,
                design: raiderDesign
            }));
        });
    },

    turn: function() {
        if (this.state === "ENDED") {
            this.logMsg("Victory declared. No further turns possible.", "System", "high");
            return;
        }
        const options = arguments.length ? arguments[0] : {};
        const skipAITurns = options?.skipAITurns;
        const aiResults = options?.aiResults || [];
        const aiRolls = Array.isArray(options?.aiRolls) ? options.aiRolls : [];
        const minefieldBefore = new Map(this.minefields.map(field => ([field.id, field.strength])));
        const fleetNames = new Map(this.fleets.map(fleet => ([fleet.id, fleet.name])));
        const nextTurn = this.turnCount + 1;
        const seeded = this.hashTurnSeed(this.turnHash, BigInt(nextTurn));
        this.rngSeed = seeded;
        this.rng = new PCG32(seeded, 54n);
        this.startTurnLog();
        this.turnEvents = [];
        if (skipAITurns) {
            aiRolls.forEach(max => this.roll(max));
            aiResults.forEach(result => {
                this.turnEvents.push({ type: "AI_TURN_STARTED", playerId: result.playerId, turn: this.turnCount + 1 });
                result.orders.forEach(order => {
                    this.queueOrder(order);
                    this.turnEvents.push({
                        type: "AI_ACTION_TAKEN",
                        playerId: result.playerId,
                        orderType: order.type,
                        turn: this.turnCount + 1
                    });
                });
                this.turnEvents.push({
                    type: "AI_TURN_ENDED",
                    playerId: result.playerId,
                    turn: this.turnCount + 1,
                    intent: result.intent
                });
            });
        } else {
            this.processAITurns();
        }
        this.orders = this.collectOrders();
        const stargateOrders = this.orders.filter(order => order.type === ORDER_TYPES.STARGATE_JUMP && order.issuerId === 1);
        const sweepOrders = this.orders.filter(order => order.type === ORDER_TYPES.SWEEP_MINES && order.issuerId === 1);
        const nextState = TurnEngine.processTurn(this);
        this.applyState(nextState);
        if (this.orderErrors?.length) {
            this.orderErrors.forEach(error => {
                this.logMsg(`ORDER ERROR: ${error}`, "System", "high");
            });
        }
        if (this.turnEvents?.length) {
            this.turnEvents.forEach(event => {
                if (event.type === "STARGATE_JUMP") {
                    const fleetLabel = fleetNames.get(event.fleetId) || this.fleets.find(fleet => fleet.id === event.fleetId)?.name || `Fleet#${event.fleetId}`;
                    const source = this.stars.find(star => star.id === event.sourcePlanetId);
                    const destination = this.stars.find(star => star.id === event.destinationPlanetId);
                    const sourceName = source?.name || `Star#${event.sourcePlanetId}`;
                    const destinationName = destination?.name || `Star#${event.destinationPlanetId}`;
                    this.logMsg(`JUMP COMPLETE: ${fleetLabel} ${sourceName} ➜ ${destinationName}`, "Command");
                }
                if (event.type === "STARGATE_MISJUMP") {
                    const fleetLabel = fleetNames.get(event.fleetId) || this.fleets.find(fleet => fleet.id === event.fleetId)?.name || `Fleet#${event.fleetId}`;
                    const stillAlive = this.fleets.some(fleet => fleet.id === event.fleetId);
                    if (!stillAlive) {
                        this.logMsg(`MISJUMP: Fleet ${event.fleetId} destroyed`, "System", "high");
                    } else {
                        this.logMsg(`MISJUMP: ${fleetLabel} took ${event.damage} damage`, "System", "high");
                    }
                }
            });
        }
        if (sweepOrders.length) {
            const minefieldAfter = new Map(this.minefields.map(field => ([field.id, field.strength])));
            sweepOrders.forEach(order => {
                const minefieldId = order.payload?.minefieldId;
                if (!Number.isFinite(minefieldId)) {
                    return;
                }
                const beforeStrength = minefieldBefore.get(minefieldId);
                const afterStrength = minefieldAfter.get(minefieldId);
                const fleetLabel = fleetNames.get(order.payload?.fleetId) || `Fleet#${order.payload?.fleetId}`;
                if (!Number.isFinite(beforeStrength)) {
                    this.logMsg(`SWEEP: no effect on minefield #${minefieldId}`, "Command");
                    return;
                }
                if (!Number.isFinite(afterStrength)) {
                    this.logMsg(`SWEEP: minefield #${minefieldId} collapsed`, "Command");
                    return;
                }
                if (afterStrength < beforeStrength) {
                    this.logMsg(`SWEEP: ${fleetLabel} reduced minefield #${minefieldId} (S ${Math.round(beforeStrength)} → ${Math.round(afterStrength)})`, "Command");
                    return;
                }
                this.logMsg(`SWEEP: no effect on minefield #${minefieldId}`, "Command");
            });
        }
        this.resolveEndOfTurn();
        this.updateVisibility();
        if (ui) {
            ui.updateHeader();
            ui.updateSide();
            ui.updateEmpire();
            ui.updateFleets();
            ui.updateResearch();
            ui.updateComms();
        }
        ui?.playSound?.(140, 0.08);
        this.finalizeTurnLog();
    },

    applyState: function(nextState) {
        this.turnCount = nextState.turnCount;
        this.year = nextState.year;
        this.credits = nextState.credits;
        this.minerals = nextState.minerals;
        this.mineralStock = nextState.mineralStock;
        this.economy = nextState.economy || this.economy;
        this.stars = nextState.stars;
        this.fleets = nextState.fleets;
        this.packets = nextState.packets;
        this.minefields = nextState.minefields;
        this.shipDesigns = nextState.shipDesigns || this.shipDesigns;
        this.minefieldIntel = nextState.minefieldIntel || this.minefieldIntel;
        this.messages = nextState.messages;
        this.battles = nextState.battles;
        this.sectorScans = nextState.sectorScans;
        this.logs = nextState.logs;
        this.empireCache = nextState.empireCache;
        this.rules = nextState.rules || this.rules;
        this.state = nextState.state ?? this.state;
        this.winnerEmpireId = nextState.winnerEmpireId ?? this.winnerEmpireId;
        this.researchFocus = nextState.researchFocus ?? this.researchFocus;
        this.nextFleetId = nextState.nextFleetId;
        this.nextPacketId = nextState.nextPacketId;
        this.orders = nextState.orders;
        this.rebuildOrderQueues(this.orders);
        this.combatReports = nextState.combatReports;
        this.turnHistory = nextState.turnHistory;
        this.turnEvents = nextState.turnEvents;
        this.orderErrors = nextState.orderErrors || [];
        this.players = nextState.players || this.players;
        const humanEconomy = this.economy?.[1];
        if (humanEconomy) {
            this.credits = humanEconomy.credits;
            this.mineralStock = { ...humanEconomy.mineralStock };
            this.minerals = humanEconomy.minerals;
        }
    },

    validateOrders: function() {
        this.addEvent("Orders validated.");
    },

    processPackets: function() {
        this.packets = this.packets
            .sort((a, b) => a.id - b.id)
            .filter(packet => {
                const speed = 80;
                if (this.stepToward(packet, packet.destX, packet.destY, speed)) {
                const economy = this.economy?.[packet.owner];
                if (economy) {
                    economy.mineralStock.i += Math.floor(packet.payload * 0.4);
                    economy.mineralStock.b += Math.floor(packet.payload * 0.3);
                    economy.mineralStock.g += Math.floor(packet.payload * 0.3);
                    economy.minerals = economy.mineralStock.i + economy.mineralStock.b + economy.mineralStock.g;
                    if (packet.owner === 1) {
                        this.mineralStock = { ...economy.mineralStock };
                        this.minerals = economy.minerals;
                        this.logMsg(`Resource packet delivered to ${this.stars[packet.destId]?.name || 'target'}.`, "Industry");
                    }
                }
                return false;
                }
                return true;
            });
    },

    stepToward: function(entity, destX, destY, speed) {
        const dx = destX - entity.x;
        const dy = destY - entity.y;
        const distance = intSqrt(dx * dx + dy * dy);
        if (distance <= speed) {
            entity.x = destX;
            entity.y = destY;
            return true;
        }
        const scale = Math.floor((speed * 1000) / distance);
        entity.x += Math.floor((dx * scale) / 1000);
        entity.y += Math.floor((dy * scale) / 1000);
        return false;
    },

    processFleets: function() {
        this.fleets
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
                this.logMsg(`${fleet.name} has exhausted fuel reserves.`, "Command");
                return;
            }

            if (this.stepToward(fleet, fleet.dest.x, fleet.dest.y, speed)) {
                fleet.dest = null;
                fleet.fuel = Math.max(0, fleet.fuel - fuelUse * 2);
                this.handleArrival(fleet);
            } else {
                fleet.fuel = Math.max(0, fleet.fuel - fuelUse);
            }
        });
    },

    processBombing: function() {
        this.addEvent("Bombing resolution complete.");
    },

    processPopulationGrowth: function() {
        this.stars
            .filter(s => s.owner)
            .sort((a, b) => a.id - b.id)
            .forEach(star => {
                const techState = getTechnologyStateForEmpire(this, star.owner);
                const modifiers = getTechnologyModifiers(techState);
                const grown = Math.floor(star.pop * 1.02 * modifiers.populationGrowth);
                star.pop = Math.min(1500000, grown);
            });
        this.addEvent("Population growth resolved.");
    },

    processProduction: function() {
        let taxTotal = 0;
        let industrialOutput = 0;
        this.stars
            .filter(s => s.owner)
            .sort((a, b) => a.id - b.id)
            .forEach(star => {
                const income = Math.floor(star.pop / 900);
                const iGain = Math.floor((star.def.mines * star.mins.i) / 120);
                const bGain = Math.floor((star.def.mines * star.mins.b) / 120);
                const gGain = Math.floor((star.def.mines * star.mins.g) / 120);

                const economy = this.economy?.[star.owner];
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
                        if (star.queue.type === 'ship') {
                            this.buildComplete(star, star.queue.bp, star.queue.owner);
                        } else if (star.queue.type === 'structure') {
                            this.completeStructure(star, star.queue);
                        }
                    }
                }
            });

        Object.values(this.economy || {}).forEach(entry => {
            entry.minerals = entry.mineralStock.i + entry.mineralStock.b + entry.mineralStock.g;
        });
        const humanEconomy = this.economy?.[1];
        if (humanEconomy) {
            this.credits = humanEconomy.credits;
            this.mineralStock = { ...humanEconomy.mineralStock };
            this.minerals = humanEconomy.minerals;
        }
        this.empireCache = { taxTotal, industrialOutput };
        this.addEvent("Production resolved.");
    },

    processResearch: function() {
        const techState = getTechnologyStateForEmpire(this, 1);
        if (!techState) {
            return;
        }
        const raceModifiers = resolveRaceModifiers(this.race).modifiers;
        const totalRP = calculateEmpireResearchPoints(this, 1, raceModifiers);
        resolveResearchForEmpire(techState, totalRP, this.rules, raceModifiers);
        this.addEvent("Research resolved.");
    },

    processIntelligence: function() {
        this.addEvent("Intelligence updates resolved.");
    },

    processAITurns: function() {
        const aiPlayers = this.players.filter(player => player.type === "ai" && player.status === "active");
        if (!aiPlayers.length) {
            return;
        }
        aiPlayers.forEach(player => {
            const difficulty = this.aiConfig?.difficulty?.[this.aiDifficulty] || this.aiConfig?.difficulty?.normal;
            const maxTimeMs = this.aiConfig?.maxTurnTimeMs ?? 100;
            this.turnEvents.push({ type: "AI_TURN_STARTED", playerId: player.id, turn: this.turnCount + 1 });
            const result = AIController.runTurn(this, player.id, difficulty, { roll: (max) => this.roll(max), maxTimeMs });
            result.orders.forEach(order => {
                this.queueOrder(order);
                this.turnEvents.push({ type: "AI_ACTION_TAKEN", playerId: player.id, orderType: order.type, turn: this.turnCount + 1 });
            });
            this.turnEvents.push({ type: "AI_TURN_ENDED", playerId: player.id, turn: this.turnCount + 1, intent: result.intent });
        });

        const playerNear = this.stars
            .filter(star => star.owner && star.owner !== 1)
            .some(star => this.fleets.some(f => f.owner === 1 && dist(f, star) < 200));
        if (playerNear && this.turnCount - this.diplomacy.lastWarning > 4) {
            this.diplomacy.lastWarning = this.turnCount;
            aiPlayers.forEach(player => {
                this.diplomacy.status[player.id] = "Tense";
            });
            this.logMsg("Your fleets are encroaching on Directorate territory. Withdraw or face consequences.", "Crimson Directorate", "high", "Ashen Arc");
        }
    },

    handleArrival: function(fleet) {
        const star = this.stars.find(st => dist(st, fleet) < 12);
        if (!star) {
            return;
        }

        if (star.owner && star.owner !== fleet.owner) {
            this.generateCombat(fleet, star);
            return;
        }

        if (!star.owner && fleet.design.flags.includes('colonize')) {
            star.owner = fleet.owner;
            star.pop = 2500;
            star.def.mines = 20;
            star.def.facts = 20;
            star.mines = 20;
            star.factories = 20;
            this.logMsg(`${star.name} Colonized!`, "Expansion");
            this.fleets = this.fleets.filter(x => x.id !== fleet.id);
            return;
        }

        this.logMsg(`${fleet.name} arrived at ${star.name}`, "Fleet");
    },

    buildComplete: function(star, blueprint, ownerId = 1) {
        this.spawnShip(star, blueprint, ownerId);
        if (ownerId === 1) {
            this.logMsg(`Production of ${blueprint.name} complete at ${star.name}`, "Industry");
        }
        star.queue = null;
    },

    completeStructure: function(star, queue) {
        if (queue.kind === 'mine') {
            star.def.mines += queue.count;
            star.mines = (star.mines || 0) + queue.count;
        } else if (queue.kind === 'factory') {
            star.def.facts += queue.count;
            star.factories = (star.factories || 0) + queue.count;
        } else if (queue.kind === 'base') {
            star.def.base = { name: "Starbase I", hp: 1000 };
        }
        if (queue.owner === 1) {
            this.logMsg(`${DB.structures[queue.kind].name} construction complete at ${star.name}.`, "Industry");
        }
        star.queue = null;
    },

    saveDesign: function({ name, hullId, componentIds }) {
        const hull = (this.rules?.hulls || []).find(entry => entry.id === hullId);
        const designName = name || `Design-${this.roll(99)}`;
        const techState = getTechnologyStateForEmpire(this, 1);
        const result = buildShipDesign({ name: designName, hull, componentIds, race: this.race, techState });
        if (!result.design) {
            return { success: false, errors: result.errors };
        }
        if (!this.shipDesigns[1]) {
            this.shipDesigns[1] = [];
        }
        this.shipDesigns[1].push(result.design);
        this.logMsg(`New Ship Design \"${result.design.name}\" saved.`, "Engineering");
        return { success: true, design: result.design };
    },

    queueBuild: function(star, designId, ownerId = 1) {
        const starId = star?.id ?? star;
        if (!Number.isFinite(starId)) {
            return;
        }
        this.queueOrder(new Order(ORDER_TYPES.BUILD_SHIPS, ownerId, { starId, designId }));
        if (ownerId === 1) {
            this.logMsg(`BUILD ORDER QUEUED: Ship design ${designId} at ${star?.name || `Star#${starId}`}.`, "Industry");
        }
    },

    queueStructure: function(star, kind, count = 1, ownerId = 1) {
        const starId = star?.id ?? star;
        if (!Number.isFinite(starId)) {
            return;
        }
        this.queueOrder(new Order(ORDER_TYPES.BUILD_STRUCTURE, ownerId, { starId, kind, count }));
        if (ownerId === 1) {
            const structureName = DB.structures?.[kind]?.name || kind;
            this.logMsg(`BUILD ORDER QUEUED: ${structureName} x${count} at ${star?.name || `Star#${starId}`}.`, "Industry");
        }
    },

    spawnShip: function(star, blueprint, ownerId = 1) {
        this.fleets.push(new Fleet({
            id: this.nextFleetId++,
            owner: ownerId,
            x: star.x,
            y: star.y,
            name: `${blueprint.name} ${this.roll(99)}`,
            design: blueprint
        }));
    },

    logMsg: function(text, sender, priority = 'normal', recipient = 'All') {
        this.messages.unshift(new Message({ turn: this.year, sender, recipient, text, priority }));
        this.addEvent(`${sender}: ${text}`);
    },

    sendMessage: function(recipientId, text) {
        const recipient = recipientId === 2 ? "Crimson Directorate" : "Unknown";
        this.logMsg(text, "Ashen Arc", "normal", recipient);
        if (recipientId === 2) {
            this.respondDiplomacy(text);
        }
    },

    respondDiplomacy: function(playerText) {
        const lower = playerText.toLowerCase();
        if (lower.includes("peace") || lower.includes("truce")) {
            this.diplomacy.status[2] = "Cautious";
            this.logMsg("We will consider a ceasefire. Keep your fleets at distance.", "Crimson Directorate", "normal", "Ashen Arc");
        } else if (lower.includes("war") || lower.includes("attack")) {
            this.diplomacy.status[2] = "Hostile";
            this.logMsg("Your threats are noted. We will respond in kind.", "Crimson Directorate", "high", "Ashen Arc");
        } else {
            this.logMsg("Message received. The Directorate remains vigilant.", "Crimson Directorate", "normal", "Ashen Arc");
        }
    },

    resolveEndOfTurn: function() {
        resolveDefeats(this);
        this.scores = calculateScores(this);
        const outcome = VictoryResolver.check(this);
        if (!outcome) {
            return;
        }
        this.state = "ENDED";
        this.winnerEmpireId = outcome.winnerEmpireId;
        this.gameResult = outcome;
        this.turnEvents.push({ type: "GAME_OVER", turn: this.turnCount });
        this.turnEvents.push({ type: "VICTORY_DECLARED", winnerId: outcome.winnerEmpireId, reason: outcome.victoryType });
        const winnerName = outcome.winnerEmpireId === 1
            ? "Ashen Arc"
            : outcome.winnerEmpireId === 2
                ? "Crimson Directorate"
                : `Empire ${outcome.winnerEmpireId}`;
        this.logMsg(`${winnerName} claims victory (${getVictoryTypeLabel(outcome.victoryType)}).`, "System", "high");
        if (outcome.winnerEmpireId === 1) {
            this.logMsg("All systems unified under your banner. Victory achieved.", "System", "high");
        } else {
            this.logMsg("The Crimson Directorate has seized the galaxy. Defeat.", "System", "high");
        }
    },

    generateCombat: function(attacker, defenderStar) {
        const attackerModifiers = getTechnologyModifiers(getTechnologyStateForEmpire(this, attacker.owner));
        const attackPower = Math.floor(attacker.design.attack * attackerModifiers.shipDamage) + this.roll(30);
        const defensePower = (defenderStar.def.base ? 120 : 40) + defenderStar.def.mines;
        const rounds = [];
        let attackerHP = Math.floor((attacker.armor + attacker.structure + attacker.shields) * attackerModifiers.shieldStrength);
        let defenderHP = defensePower * 2;

        for (let round = 1; round <= 3; round++) {
            const atk = Math.floor(attacker.design.attack * attackerModifiers.shipDamage) + this.roll(10);
            const def = Math.floor(defensePower / 4) + this.roll(8);
            defenderHP -= atk;
            attackerHP -= def;
            rounds.push(`Round ${round}: ${attacker.name} hits for ${atk}. Defenses reply for ${def}.`);
        }

        const result = attackerHP > defenderHP ? 'attacker' : 'defender';
        const battleLog = `Combat at ${defenderStar.name}: ${attacker.name} engaged defenses. Outcome: ${result.toUpperCase()}.`;
        this.addEvent(`Combat roll ${attackPower} at ${defenderStar.name}.`);
        this.battles.unshift({
            id: `${this.year}-${defenderStar.id}-${attacker.id}`,
            turn: this.year,
            location: defenderStar.name,
            attacker: attacker.name,
            defender: defenderStar.def.base ? defenderStar.def.base.name : "Orbital Defenses",
            result,
            details: rounds.join('\n') + `\nFinal: ${result.toUpperCase()}`
        });
        this.logMsg(battleLog, "Combat", "high");
        ui?.playSound?.(240, 0.2);

        if (result === 'attacker') {
            defenderStar.owner = attacker.owner;
            defenderStar.pop = Math.floor(defenderStar.pop * 0.4);
            defenderStar.def.base = null;
        } else {
            this.fleets = this.fleets.filter(f => f.id !== attacker.id);
        }
    },

    scanSector: function(star, ownerId = 1) {
        const starId = star?.id ?? star;
        if (!Number.isFinite(starId)) {
            return;
        }
        this.queueOrder(new Order(ORDER_TYPES.SCAN_SECTOR, ownerId, { starId }));
        if (ownerId === 1) {
            this.logMsg(`SCAN ORDER QUEUED: Sector scan from ${star?.name || `Star#${starId}`}.`, "Command");
        }
    },

    placeMinefield: function(fleet, mineUnits) {
        if (!fleet) {
            return;
        }
        const units = Math.max(0, Math.floor(mineUnits || fleet.mineUnits || 0));
        this.queueOrder(new Order(ORDER_TYPES.LAY_MINES, fleet.owner, {
            fleetId: fleet.id,
            mineUnitsToDeploy: units
        }));
        if (fleet.owner === 1) {
            this.logMsg(`${fleet.name} queued minefield deployment.`, "Command");
        }
    },

    launchPacket: function(originId, targetId, amount, ownerId = 1) {
        const origin = this.stars.find(star => star.id === originId);
        if (!origin || origin.owner !== ownerId) {
            return;
        }
        this.queueOrder(new Order(ORDER_TYPES.LAUNCH_PACKET, ownerId, { originId, targetId, amount }));
        if (ownerId === 1) {
            const target = this.stars.find(star => star.id === targetId);
            this.logMsg(`PACKET ORDER QUEUED: ${origin.name} ➜ ${target?.name || `Star#${targetId}`}.`, "Industry");
        }
    },

    updateVisibility: function() {
        this.activeScanners = [];
        this.sectorScans = this.sectorScans.filter(scan => scan.expires >= this.turnCount);
        this.planetKnowledge = this.planetKnowledge || {};
        const planetKnowledge = this.planetKnowledge[1] || {};
        const hiddenFieldCloak = 75;
        this.stars
            .slice()
            .sort((a, b) => a.id - b.id)
            .forEach(star => {
            if (star.owner === 1) {
                this.activeScanners.push({ x: star.x, y: star.y, r: 260, owner: 1 });
            }
        });
        this.fleets
            .slice()
            .sort((a, b) => a.id - b.id)
            .forEach(fleet => {
            if (fleet.owner === 1) {
                const range = getFleetScanRange(this, fleet);
                this.activeScanners.push({ x: fleet.x, y: fleet.y, r: range, owner: 1 });
            }
        });
        this.sectorScans.forEach(scan => this.activeScanners.push(scan));

        this.stars
            .slice()
            .sort((a, b) => a.id - b.id)
            .forEach(star => {
            const intelState = getIntelState(this.activeScanners, star);
            const knownEntry = planetKnowledge[star.id];
            star.intelState = intelState;
            if (intelState !== "none") {
                star.updateSnapshot();
                planetKnowledge[star.id] = {
                    id: star.id,
                    name: star.name,
                    x: star.x,
                    y: star.y,
                    snapshot: star.snapshot ? { ...star.snapshot } : null,
                    turn_seen: this.turnCount
                };
                star.visible = true;
                star.known = true;
                star.lastSeenTurn = this.turnCount;
            } else {
                const restored = knownEntry?.snapshot ?? null;
                star.visible = false;
                star.known = Boolean(knownEntry);
                star.snapshot = restored;
                star.lastSeenTurn = knownEntry?.turn_seen ?? null;
            }
        });
        this.planetKnowledge[1] = planetKnowledge;

        this.fleets.forEach(fleet => {
            if (fleet.owner === 1) {
                fleet.intelState = "penetrated";
                fleet.cloak = getFleetCloakPercent(this, fleet);
                return;
            }
            const cloak = getFleetCloakPercent(this, fleet);
            fleet.cloak = cloak;
            fleet.intelState = getIntelState(this.activeScanners, fleet, cloak);
        });

        if (!this.minefieldIntel[1]) {
            this.minefieldIntel[1] = [];
        }
        this.minefields.forEach(minefield => {
            let intelState = "none";
            if (minefield.visibility === "all" || minefield.ownerEmpireId === 1) {
                intelState = "penetrated";
            } else {
                intelState = getIntelState(this.activeScanners, minefield.center, hiddenFieldCloak);
            }
            if (intelState === "none") {
                return;
            }
            const existing = this.minefieldIntel[1].find(entry => entry.id === minefield.id);
            const payload = {
                id: minefield.id,
                center: { ...minefield.center },
                radius: intelState !== "visible" ? minefield.radius : minefield.radius,
                estimatedStrength: intelState === "visible" ? null : Math.ceil(minefield.strength),
                ownerEmpireId: intelState === "penetrated" ? minefield.ownerEmpireId : null,
                intelState,
                lastSeenTurn: this.turnCount
            };
            if (existing) {
                Object.assign(existing, payload);
            } else {
                this.minefieldIntel[1].push(payload);
            }
        });

        if (!this.wormholeIntel[1]) {
            this.wormholeIntel[1] = [];
        }
        this.wormholes.forEach(wormhole => {
            const intelState = getIntelState(this.activeScanners, wormhole.entry || wormhole, hiddenFieldCloak);
            if (intelState === "none") {
                return;
            }
            const existing = this.wormholeIntel[1].find(entry => entry.id === wormhole.id);
            const payload = {
                id: wormhole.id ?? null,
                entry: wormhole.entry ? { ...wormhole.entry } : null,
                exit: intelState === "penetrated" ? (wormhole.exit ? { ...wormhole.exit } : null) : null,
                endpoints: intelState === "penetrated" && wormhole.endpoints
                    ? wormhole.endpoints.map(endpoint => ({ ...endpoint }))
                    : null,
                intelState,
                lastSeenTurn: this.turnCount
            };
            if (existing) {
                Object.assign(existing, payload);
            } else {
                this.wormholeIntel[1].push(payload);
            }
        });
    },

    buildAIVisibleState: function(playerId) {
        const scanners = [];
        this.stars.forEach(star => {
            if (star.owner === playerId) {
                scanners.push({ x: star.x, y: star.y, r: 260, owner: playerId });
            }
        });
        this.fleets.forEach(fleet => {
            if (fleet.owner === playerId) {
                const range = getFleetScanRange(this, fleet);
                scanners.push({ x: fleet.x, y: fleet.y, r: range, owner: playerId });
            }
        });
        (this.sectorScans || [])
            .filter(scan => scan.owner === playerId)
            .forEach(scan => scanners.push(scan));

        const visibleStars = this.stars
            .filter(star => star.owner === playerId || getIntelState(scanners, star) !== "none")
            .map(star => ({
                id: star.id,
                x: star.x,
                y: star.y,
                name: star.name,
                owner: star.owner,
                pop: star.pop,
                mines: star.mines,
                factories: star.factories,
                def: { ...star.def },
                queue: star.queue ? { ...star.queue } : null,
                habitability: star.habitability,
                environment: { ...star.environment },
                hasStargate: star.hasStargate,
                stargateMassLimit: star.stargateMassLimit,
                stargateRange: star.stargateRange,
                stargateTechLevel: star.stargateTechLevel
            }));

        const visibleFleets = this.fleets
            .filter(fleet => {
                if (fleet.owner === playerId) {
                    return true;
                }
                const cloak = getFleetCloakPercent(this, fleet);
                return getIntelState(scanners, fleet, cloak) !== "none";
            })
            .map(fleet => ({
                id: fleet.id,
                owner: fleet.owner,
                x: fleet.x,
                y: fleet.y,
                dest: fleet.dest ? { ...fleet.dest } : null,
                design: fleet.design ? { ...fleet.design, finalStats: { ...fleet.design.finalStats } } : null,
                mineSweepingStrength: fleet.mineSweepingStrength,
                mass: fleet.mass
            }));

        const hiddenFieldCloak = 75;
        const visibleMinefields = this.minefields.reduce((acc, minefield) => {
            let intelState = "none";
            if (minefield.visibility === "all" || minefield.ownerEmpireId === playerId) {
                intelState = "penetrated";
            } else {
                intelState = getIntelState(scanners, minefield.center, hiddenFieldCloak);
            }
            if (intelState === "none") {
                return acc;
            }
            acc.push({
                id: minefield.id,
                center: { ...minefield.center },
                radius: minefield.radius,
                ownerEmpireId: intelState === "penetrated" ? minefield.ownerEmpireId : null,
                intelState,
                lastSeenTurn: this.turnCount
            });
            return acc;
        }, []);

        const economyEntry = this.economy?.[playerId];
        const visibleEconomy = economyEntry
            ? {
                credits: economyEntry.credits,
                mineralStock: { ...economyEntry.mineralStock },
                minerals: economyEntry.minerals
            }
            : null;

        const playerEntry = this.players.find(player => player.id === playerId);
        return {
            turnCount: this.turnCount,
            rules: this.rules,
            race: this.race,
            stars: visibleStars,
            fleets: visibleFleets,
            minefields: visibleMinefields,
            shipDesigns: { [playerId]: (this.shipDesigns?.[playerId] || []).map(design => ({
                ...design,
                finalStats: design.finalStats ? { ...design.finalStats } : null,
                flags: Array.isArray(design.flags) ? [...design.flags] : []
            })) },
            economy: { [playerId]: visibleEconomy },
            players: playerEntry ? [{ id: playerEntry.id, technology: playerEntry.technology }] : []
        };
    },

    queueOrder: function(order) {
        if (!order || !Number.isFinite(order.issuerId)) {
            return;
        }
        if (!this.orderQueues[order.issuerId]) {
            this.orderQueues[order.issuerId] = [];
        }
        this.orderQueues[order.issuerId].push(order);
        this.orders = this.collectOrders();
    },

    collectOrders: function() {
        return Object.values(this.orderQueues).flat();
    },

    getOrderQueue: function(playerId = 1) {
        return this.orderQueues[playerId] || [];
    },

    rebuildOrderQueues: function(orders = []) {
        this.orderQueues = {};
        orders.forEach(order => {
            if (!order || !Number.isFinite(order.issuerId)) {
                return;
            }
            if (!this.orderQueues[order.issuerId]) {
                this.orderQueues[order.issuerId] = [];
            }
            this.orderQueues[order.issuerId].push(order);
        });
    },

    getTechnologyFields: function() {
        return this.rules?.technologyFields || [];
    },

    getHulls: function() {
        return this.rules?.hulls || [];
    },

    getHullById: function(hullId) {
        return this.getHulls().find(hull => hull.id === hullId);
    },

    getTechnologyState: function(empireId = 1) {
        return getTechnologyStateForEmpire(this, empireId);
    },

    getResearchFieldState: function(fieldId, empireId = 1) {
        const techState = getTechnologyStateForEmpire(this, empireId);
        const field = techState?.fields?.[fieldId];
        if (!field) {
            return null;
        }
        const raceModifiers = resolveRaceModifiers(this.race).modifiers;
        return {
            level: field.level,
            storedRP: field.storedRP,
            rpToNextLevel: getRpToNextLevel(field.level, this.rules, raceModifiers, field.id, techState)
        };
    },

    getResearchAllocation: function(empireId = 1) {
        const techState = getTechnologyStateForEmpire(this, empireId);
        return techState?.allocation || {};
    },

    setResearchAllocation: function(allocation, empireId = 1) {
        const techState = getTechnologyStateForEmpire(this, empireId);
        if (!techState) {
            return;
        }
        const raceModifiers = resolveRaceModifiers(this.race).modifiers;
        const allocationRules = (nextAllocation, fields) => enforceAllocationRules(nextAllocation, fields, raceModifiers);
        techState.allocation = normalizeAllocation(allocation, this.getTechnologyFields(), allocationRules);
    },

    setResearchAllocationForField: function(fieldId, share, empireId = 1) {
        const techState = getTechnologyStateForEmpire(this, empireId);
        if (!techState) {
            return;
        }
        const raceModifiers = resolveRaceModifiers(this.race).modifiers;
        const allocationRules = (nextAllocation, fields) => enforceAllocationRules(nextAllocation, fields, raceModifiers);
        techState.allocation = adjustAllocationForField(techState.allocation, this.getTechnologyFields(), fieldId, share, allocationRules);
    },

    getEmpireResearchPoints: function(empireId = 1) {
        const raceModifiers = resolveRaceModifiers(this.race).modifiers;
        return calculateEmpireResearchPoints(this, empireId, raceModifiers);
    }
};
