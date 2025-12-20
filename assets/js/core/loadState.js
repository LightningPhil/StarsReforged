import { Fleet, Message, ResourcePacket, Star } from "../models/entities.js";
import { Minefield } from "../models/minefield.js";
import { SAVE_FORMATS, SAVE_SCHEMA_VERSION } from "../models/saveState.js";
import { PCG32 } from "./rng.js";

const DEFAULT_PATHS = {
    universe: "./saves/universe.xy",
    player: (playerId) => `./saves/player${playerId}.m${playerId}`,
    orders: (playerId) => `./saves/orders${playerId}.x${playerId}`
};

const parseBigInt = (value, fallback = 0n) => {
    if (typeof value === "bigint") {
        return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return BigInt(Math.floor(value));
    }
    if (typeof value === "string" && value.length) {
        try {
            return BigInt(value);
        } catch (error) {
            return fallback;
        }
    }
    return fallback;
};

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const migrateUniverseState = (state) => {
    if (!state || typeof state !== "object") {
        return { state: null, migrated: false };
    }
    let migrated = false;
    const next = { ...state };
    if (!next.schemaVersion) {
        next.schemaVersion = SAVE_SCHEMA_VERSION;
        migrated = true;
    }
    if (!next.format) {
        next.format = SAVE_FORMATS.UNIVERSE;
        migrated = true;
    }
    if (!next.planets && next.stars) {
        next.planets = next.stars;
        migrated = true;
    }
    next.planets = normalizeArray(next.planets);
    next.fleets = normalizeArray(next.fleets);
    next.packets = normalizeArray(next.packets);
    next.minefields = normalizeArray(next.minefields);
    next.wormholes = normalizeArray(next.wormholes);
    next.players = normalizeArray(next.players);
    next.messages = normalizeArray(next.messages);
    next.orders = normalizeArray(next.orders);
    next.turnHistory = normalizeArray(next.turnHistory);
    next.turnEvents = normalizeArray(next.turnEvents);
    next.logs = normalizeArray(next.logs);
    next.combatReports = normalizeArray(next.combatReports);
    next.battles = normalizeArray(next.battles);
    next.sectorScans = normalizeArray(next.sectorScans);
    next.orderErrors = normalizeArray(next.orderErrors);
    next.shipDesigns = next.shipDesigns || {};
    next.economy = next.economy || {};
    next.diplomacy = next.diplomacy || { status: {}, lastWarning: 0 };
    next.mineralStock = next.mineralStock || { i: 0, b: 0, g: 0 };
    next.minefieldIntel = next.minefieldIntel || {};
    next.wormholeIntel = next.wormholeIntel || {};
    next.empireCache = next.empireCache || { taxTotal: 0, industrialOutput: 0 };
    return { state: next, migrated };
};

const migratePlayerState = (state) => {
    if (!state || typeof state !== "object") {
        return { state: null, migrated: false };
    }
    let migrated = false;
    const next = { ...state };
    if (!next.schemaVersion) {
        next.schemaVersion = SAVE_SCHEMA_VERSION;
        migrated = true;
    }
    if (!next.format) {
        next.format = SAVE_FORMATS.PLAYER;
        migrated = true;
    }
    if (!next.planets && next.stars) {
        next.planets = next.stars;
        migrated = true;
    }
    next.planets = normalizeArray(next.planets);
    next.fleets = normalizeArray(next.fleets);
    next.packets = normalizeArray(next.packets);
    next.orders = normalizeArray(next.orders);
    next.messages = normalizeArray(next.messages);
    next.shipDesigns = normalizeArray(next.shipDesigns);
    next.diplomacy = next.diplomacy || { status: {}, lastWarning: 0 };
    return { state: next, migrated };
};

const migrateOrdersState = (state) => {
    if (!state || typeof state !== "object") {
        return { state: null, migrated: false };
    }
    let migrated = false;
    const next = { ...state };
    if (!next.schemaVersion) {
        next.schemaVersion = SAVE_SCHEMA_VERSION;
        migrated = true;
    }
    if (!next.format) {
        next.format = SAVE_FORMATS.ORDERS;
        migrated = true;
    }
    next.orders = normalizeArray(next.orders);
    return { state: next, migrated };
};

const validateUniverseState = (state) => {
    const errors = [];
    if (!state) {
        errors.push("Universe state missing.");
    } else {
        if (state.format !== SAVE_FORMATS.UNIVERSE) {
            errors.push(`Universe format mismatch: ${state.format}`);
        }
        if (!Array.isArray(state.planets)) {
            errors.push("Universe planets missing.");
        }
        if (!Array.isArray(state.fleets)) {
            errors.push("Universe fleets missing.");
        }
        if (!Array.isArray(state.packets)) {
            errors.push("Universe packets missing.");
        }
    }
    return { valid: errors.length === 0, errors };
};

const validatePlayerState = (state) => {
    const errors = [];
    if (!state) {
        errors.push("Player state missing.");
    } else {
        if (state.format !== SAVE_FORMATS.PLAYER) {
            errors.push(`Player format mismatch: ${state.format}`);
        }
        if (!Number.isFinite(state.playerId)) {
            errors.push("Player id missing.");
        }
    }
    return { valid: errors.length === 0, errors };
};

const validateOrdersState = (state) => {
    const errors = [];
    if (!state) {
        errors.push("Orders state missing.");
    } else if (state.format !== SAVE_FORMATS.ORDERS) {
        errors.push(`Orders format mismatch: ${state.format}`);
    }
    return { valid: errors.length === 0, errors };
};

const safeFetchJson = async (path) => {
    if (typeof fetch !== "function") {
        return null;
    }
    try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (error) {
        return null;
    }
};

const cloneTechnology = (technology) => ({
    fields: technology?.fields ? Object.fromEntries(Object.entries(technology.fields).map(([id, field]) => ([
        id,
        { ...field }
    ]))) : {},
    allocation: technology?.allocation ? { ...technology.allocation } : {}
});

const resolveFleetDesign = (fleetDto, shipDesigns) => {
    if (fleetDto.design) {
        return {
            ...fleetDto.design,
            finalStats: { ...fleetDto.design.finalStats }
        };
    }
    const ownerDesigns = shipDesigns?.[fleetDto.owner] || [];
    const match = ownerDesigns.find(design => design.designId === fleetDto.designId);
    if (match) {
        return { ...match, finalStats: { ...match.finalStats } };
    }
    return {
        designId: fleetDto.designId || "unknown",
        name: fleetDto.name || "Unknown Design",
        hullId: fleetDto.hullId || "unknown",
        components: [],
        finalStats: {
            mass: fleetDto.mass || 0,
            armor: fleetDto.armor || 0,
            structure: fleetDto.structure || 0,
            speed: 0,
            attack: 0,
            defense: 0,
            range: 0,
            fuel: fleetDto.fuel || 0,
            shields: fleetDto.shields || 0,
            powerOutput: 0,
            powerUsage: 0,
            signature: 0,
            mineCapacity: fleetDto.mineUnits || 0,
            mineLayingCapacity: fleetDto.mineLayingCapacity || 0,
            mineSweepingStrength: fleetDto.mineSweepingStrength || 0,
            mineHitpoints: fleetDto.mineHitpoints || 0,
            initiative: 0,
            flags: []
        },
        cost: 0
    };
};

export const deserializeUniverseState = (state) => {
    const { state: migratedState } = migrateUniverseState(state);
    const validation = validateUniverseState(migratedState);
    if (!validation.valid) {
        return null;
    }
    const rngSeed = parseBigInt(migratedState.rngSeed, 0n);
    const turnHash = parseBigInt(migratedState.turnHash, 0n);
    const shipDesigns = migratedState.shipDesigns || {};
    const stars = migratedState.planets.map(dto => {
        const star = new Star({ id: dto.id, x: dto.x, y: dto.y, name: dto.name, owner: dto.owner });
        star.pop = dto.pop || 0;
        star.mins = {
            i: dto.mins?.i ?? 0,
            b: dto.mins?.b ?? 0,
            g: dto.mins?.g ?? 0
        };
        star.concentration = {
            i: dto.concentration?.i ?? star.mins.i,
            b: dto.concentration?.b ?? star.mins.b,
            g: dto.concentration?.g ?? star.mins.g
        };
        star.environment = {
            grav: dto.environment?.grav ?? star.environment.grav,
            temp: dto.environment?.temp ?? star.environment.temp,
            rad: dto.environment?.rad ?? star.environment.rad
        };
        star.habitability = dto.habitability ?? star.habitability ?? 0;
        star.deathRate = dto.deathRate ?? star.deathRate ?? 0;
        star.factories = dto.factories ?? dto.def?.facts ?? star.factories ?? 0;
        star.mines = dto.mines ?? dto.def?.mines ?? star.mines ?? 0;
        star.def = {
            mines: dto.def?.mines ?? 0,
            facts: dto.def?.facts ?? 0,
            base: dto.def?.base ?? null
        };
        star.queue = dto.queue ? { ...dto.queue } : null;
        star.autoBuild = dto.autoBuild ? { ...dto.autoBuild } : null;
        star.terraforming = dto.terraforming ? { ...dto.terraforming } : star.terraforming;
        star.visible = dto.visible || false;
        star.known = dto.known || false;
        star.snapshot = dto.snapshot ? { ...dto.snapshot } : null;
        star.hasStargate = dto.hasStargate || false;
        star.stargateMassLimit = dto.stargateMassLimit || 0;
        star.stargateRange = dto.stargateRange || 0;
        star.stargateTechLevel = dto.stargateTechLevel || 0;
        return star;
    });

    const fleets = migratedState.fleets.map(dto => {
        const design = resolveFleetDesign(dto, shipDesigns);
        const fleet = new Fleet({
            id: dto.id,
            owner: dto.owner,
            x: dto.x,
            y: dto.y,
            name: dto.name,
            design,
            waypoints: dto.waypoints,
            cargo: dto.cargo,
            shipStacks: dto.shipStacks
        });
        fleet.designId = dto.designId || design.designId;
        fleet.fuel = dto.fuel ?? design.fuel;
        fleet.dest = dto.dest ? { ...dto.dest } : null;
        fleet.waypoints = Array.isArray(dto.waypoints) ? dto.waypoints.map(point => ({ ...point })) : fleet.waypoints;
        fleet.cargo = dto.cargo ? { ...dto.cargo } : fleet.cargo;
        fleet.cargoCapacity = dto.cargoCapacity ?? fleet.cargoCapacity;
        fleet.shipStacks = Array.isArray(dto.shipStacks) && dto.shipStacks.length
            ? dto.shipStacks.map(stack => ({ ...stack }))
            : fleet.shipStacks;
        fleet.hp = dto.hp ?? fleet.hp;
        fleet.armor = dto.armor ?? fleet.armor;
        fleet.structure = dto.structure ?? fleet.structure;
        fleet.shields = dto.shields ?? fleet.shields;
        fleet.mineUnits = dto.mineUnits ?? fleet.mineUnits;
        fleet.mineLayingCapacity = dto.mineLayingCapacity ?? fleet.mineLayingCapacity;
        fleet.mineSweepingStrength = dto.mineSweepingStrength ?? fleet.mineSweepingStrength;
        fleet.mineHitpoints = dto.mineHitpoints ?? fleet.mineHitpoints;
        fleet.mass = dto.mass ?? fleet.mass;
        fleet.colonize = dto.colonize || false;
        return fleet;
    });

    const packets = migratedState.packets.map(dto => new ResourcePacket({
        id: dto.id,
        owner: dto.owner,
        x: dto.x,
        y: dto.y,
        destX: dto.destX,
        destY: dto.destY,
        payload: dto.payload,
        destId: dto.destId,
        type: dto.type,
        speed: dto.speed,
        decayRate: dto.decayRate,
        catchRadius: dto.catchRadius,
        damageMultiplier: dto.damageMultiplier
    }));

    const minefields = migratedState.minefields.map(dto => new Minefield({
        id: dto.id,
        ownerEmpireId: dto.ownerEmpireId,
        center: { ...dto.center },
        radius: dto.radius,
        strength: dto.strength,
        type: dto.type,
        turnCreated: dto.turnCreated,
        sweepResistance: dto.sweepResistance,
        decayRate: dto.decayRate,
        visibility: dto.visibility
    }));

    const messages = migratedState.messages.map(dto => new Message({
        turn: dto.turn,
        sender: dto.sender,
        recipient: dto.recipient,
        text: dto.text,
        priority: dto.priority
    }));

    return {
        turnCount: migratedState.turnCount || 0,
        year: migratedState.year || 2400,
        credits: migratedState.credits || 0,
        minerals: migratedState.minerals || 0,
        mineralStock: { ...migratedState.mineralStock },
        rngSeed,
        turnHash,
        nextFleetId: migratedState.nextFleetId || 1,
        nextPacketId: migratedState.nextPacketId || 1,
        rules: migratedState.rules || null,
        aiConfig: migratedState.aiConfig || null,
        players: migratedState.players.map(player => ({
            ...player,
            technology: cloneTechnology(player.technology)
        })),
        economy: migratedState.economy || {},
        stars,
        fleets,
        packets,
        minefields,
        wormholes: migratedState.wormholes || [],
        shipDesigns,
        minefieldIntel: migratedState.minefieldIntel || {},
        wormholeIntel: migratedState.wormholeIntel || {},
        messages,
        orders: migratedState.orders || [],
        logs: migratedState.logs || [],
        combatReports: migratedState.combatReports || [],
        battles: migratedState.battles || [],
        sectorScans: migratedState.sectorScans || [],
        turnHistory: migratedState.turnHistory || [],
        turnEvents: migratedState.turnEvents || [],
        orderErrors: migratedState.orderErrors || [],
        empireCache: migratedState.empireCache || { taxTotal: 0, industrialOutput: 0 },
        state: migratedState.state || "RUNNING",
        winnerEmpireId: migratedState.winnerEmpireId ?? null,
        researchFocus: migratedState.researchFocus ?? null,
        diplomacy: migratedState.diplomacy || { status: {}, lastWarning: 0 },
        race: migratedState.race || null
    };
};

export const deserializePlayerState = (state) => {
    const { state: migratedState } = migratePlayerState(state);
    const validation = validatePlayerState(migratedState);
    if (!validation.valid) {
        return null;
    }
    return {
        playerId: migratedState.playerId,
        turnCount: migratedState.turnCount || 0,
        year: migratedState.year || 2400,
        economy: migratedState.economy || null,
        research: cloneTechnology(migratedState.research),
        researchFocus: migratedState.researchFocus ?? null,
        diplomacy: migratedState.diplomacy || { status: {}, lastWarning: 0 },
        planets: migratedState.planets || [],
        fleets: migratedState.fleets || [],
        packets: migratedState.packets || [],
        orders: migratedState.orders || [],
        messages: migratedState.messages || [],
        shipDesigns: migratedState.shipDesigns || []
    };
};

export const deserializeOrdersState = (state) => {
    const { state: migratedState } = migrateOrdersState(state);
    const validation = validateOrdersState(migratedState);
    if (!validation.valid) {
        return null;
    }
    return {
        playerId: migratedState.playerId,
        turnCount: migratedState.turnCount || 0,
        year: migratedState.year || 2400,
        orders: migratedState.orders || []
    };
};

export const assembleGameState = ({ universeState, playerState, rules, aiConfig }) => {
    if (!universeState) {
        return null;
    }
    const base = deserializeUniverseState(universeState);
    if (!base) {
        return null;
    }
    const resolvedRules = universeState.rules || rules || base.rules;
    const resolvedAi = universeState.aiConfig || aiConfig || base.aiConfig;
    base.rules = resolvedRules;
    base.aiConfig = resolvedAi;
    base.rng = new PCG32(base.rngSeed || 0n, 54n);
    if (playerState) {
        const playerId = playerState.playerId;
        if (playerState.economy) {
            base.economy[playerId] = {
                credits: playerState.economy.credits,
                minerals: playerState.economy.minerals,
                mineralStock: { ...playerState.economy.mineralStock }
            };
            if (playerId === 1) {
                base.credits = playerState.economy.credits;
                base.minerals = playerState.economy.minerals;
                base.mineralStock = { ...playerState.economy.mineralStock };
            }
        }
        const player = base.players.find(entry => entry.id === playerId);
        if (player && playerState.research) {
            player.technology = cloneTechnology(playerState.research);
        }
        base.researchFocus = playerState.researchFocus ?? base.researchFocus;
        base.diplomacy = playerState.diplomacy || base.diplomacy;
        base.messages = playerState.messages || base.messages;
        base.orders = playerState.orders || base.orders;
    }
    return base;
};

export const loadUniverseState = async ({ universePath = DEFAULT_PATHS.universe } = {}) => {
    const raw = await safeFetchJson(universePath);
    const { state: migratedState } = migrateUniverseState(raw);
    const validation = validateUniverseState(migratedState);
    if (!validation.valid) {
        return null;
    }
    return migratedState;
};

export const loadPlayerState = async ({ playerId = 1, playerPath = DEFAULT_PATHS.player(playerId) } = {}) => {
    const raw = await safeFetchJson(playerPath);
    const { state: migratedState } = migratePlayerState(raw);
    const validation = validatePlayerState(migratedState);
    if (!validation.valid) {
        return null;
    }
    return migratedState;
};

export const loadOrdersState = async ({ playerId = 1, ordersPath = DEFAULT_PATHS.orders(playerId) } = {}) => {
    const raw = await safeFetchJson(ordersPath);
    const { state: migratedState } = migrateOrdersState(raw);
    const validation = validateOrdersState(migratedState);
    if (!validation.valid) {
        return null;
    }
    return migratedState;
};

export const loadGameStateFromFiles = async ({
    playerId = 1,
    universePath = DEFAULT_PATHS.universe,
    playerPath = DEFAULT_PATHS.player(playerId),
    rules,
    aiConfig
} = {}) => {
    const [universeState, playerState] = await Promise.all([
        loadUniverseState({ universePath }),
        loadPlayerState({ playerId, playerPath })
    ]);
    if (!universeState) {
        return null;
    }
    return assembleGameState({ universeState, playerState, rules, aiConfig });
};
