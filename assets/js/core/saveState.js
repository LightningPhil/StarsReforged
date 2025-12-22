import {
    createHistoryStateDTO,
    createOrdersStateDTO,
    createPlayerStateDTO,
    createUniverseStateDTO
} from "../models/saveState.js";

const serializeStar = (star) => ({
    id: star.id,
    name: star.name,
    x: star.x,
    y: star.y,
    owner: star.owner,
    pop: star.pop,
    mins: { ...star.mins },
    concentration: star.concentration ? { ...star.concentration } : null,
    environment: star.environment ? { ...star.environment } : null,
    habitability: star.habitability ?? null,
    deathRate: star.deathRate ?? null,
    factories: star.factories ?? null,
    mines: star.mines ?? null,
    def: { ...star.def },
    queue: star.queue ? { ...star.queue } : null,
    autoBuild: star.autoBuild ? { ...star.autoBuild } : null,
    terraforming: star.terraforming ? { ...star.terraforming } : null,
    visible: star.visible,
    known: star.known,
    snapshot: star.snapshot ? { ...star.snapshot } : null,
    hasStargate: star.hasStargate,
    stargateMassLimit: star.stargateMassLimit,
    stargateRange: star.stargateRange,
    stargateTechLevel: star.stargateTechLevel,
    massDriverRating: star.massDriverRating ?? 0
});

const serializeFleet = (fleet) => ({
    id: fleet.id,
    owner: fleet.owner,
    x: fleet.x,
    y: fleet.y,
    name: fleet.name,
    designId: fleet.designId,
    design: fleet.design ? { ...fleet.design, finalStats: { ...fleet.design.finalStats } } : null,
    fuel: fleet.fuel,
    dest: fleet.dest ? { ...fleet.dest } : null,
    waypoints: fleet.waypoints ? fleet.waypoints.map(point => ({ ...point })) : [],
    cargo: fleet.cargo ? { ...fleet.cargo } : null,
    cargoCapacity: fleet.cargoCapacity,
    shipStacks: fleet.shipStacks ? fleet.shipStacks.map(stack => ({ ...stack })) : [],
    hp: fleet.hp,
    armor: fleet.armor,
    structure: fleet.structure,
    shields: fleet.shields,
    mineUnits: fleet.mineUnits,
    mineLayingCapacity: fleet.mineLayingCapacity,
    mineSweepingStrength: fleet.mineSweepingStrength,
    mineHitpoints: fleet.mineHitpoints,
    mass: fleet.mass,
    cargoMass: fleet.cargoMass,
    fuelPool: fleet.fuelPool,
    colonize: fleet.colonize || false
});

const serializePacket = (packet) => ({
    id: packet.id,
    owner: packet.owner,
    x: packet.x,
    y: packet.y,
    destX: packet.destX,
    destY: packet.destY,
    payload: packet.payload,
    destId: packet.destId,
    type: packet.type,
    speed: packet.speed,
    driverRating: packet.driverRating,
    decayRate: packet.decayRate,
    catchRadius: packet.catchRadius,
    damageMultiplier: packet.damageMultiplier
});

const serializeMinefield = (minefield) => ({
    id: minefield.id,
    ownerEmpireId: minefield.ownerEmpireId,
    center: { ...minefield.center },
    radius: minefield.radius,
    strength: minefield.strength,
    type: minefield.type,
    turnCreated: minefield.turnCreated,
    sweepResistance: minefield.sweepResistance,
    decayRate: minefield.decayRate,
    visibility: minefield.visibility
});

const serializeTechnology = (technology) => ({
    fields: technology?.fields ? Object.fromEntries(Object.entries(technology.fields).map(([id, field]) => ([
        id,
        { ...field }
    ]))) : {},
    allocation: technology?.allocation ? { ...technology.allocation } : {}
});

const serializeOrder = (order) => ({
    id: order.id,
    type: order.type,
    issuerId: order.issuerId,
    payload: order.payload ? { ...order.payload } : null
});

const serializeMessage = (message) => ({
    turn: message.turn,
    sender: message.sender,
    recipient: message.recipient,
    text: message.text,
    priority: message.priority
});

const serializePlanetKnowledgeEntry = (entry) => ({
    id: entry.id,
    name: entry.name,
    x: entry.x,
    y: entry.y,
    snapshot: entry.snapshot ? { ...entry.snapshot } : null,
    turn_seen: entry.turn_seen ?? null
});

export const serializeUniverseState = (gameState) => createUniverseStateDTO({
    turnCount: gameState.turnCount,
    year: gameState.year,
    credits: gameState.credits,
    minerals: gameState.minerals,
    mineralStock: { ...gameState.mineralStock },
    rngSeed: gameState.rngSeed?.toString?.() ?? `${gameState.rngSeed}`,
    turnHash: gameState.turnHash?.toString?.() ?? `${gameState.turnHash}`,
    nextFleetId: gameState.nextFleetId,
    nextPacketId: gameState.nextPacketId,
    rules: gameState.rules,
    aiConfig: gameState.aiConfig,
    players: gameState.players?.map(player => ({
        ...player,
        technology: serializeTechnology(player.technology)
    })) || [],
    economy: gameState.economy ? Object.fromEntries(Object.entries(gameState.economy).map(([id, entry]) => ([
        id,
        {
            credits: entry.credits,
            minerals: entry.minerals,
            mineralStock: { ...entry.mineralStock }
        }
    ]))) : {},
    planets: gameState.stars.map(serializeStar),
    fleets: gameState.fleets.map(serializeFleet),
    packets: gameState.packets.map(serializePacket),
    minefields: gameState.minefields.map(serializeMinefield),
    wormholes: gameState.wormholes ? gameState.wormholes.map(wormhole => ({ ...wormhole })) : [],
    shipDesigns: gameState.shipDesigns ? Object.fromEntries(Object.entries(gameState.shipDesigns).map(([id, designs]) => ([
        id,
        designs.map(design => ({ ...design, finalStats: { ...design.finalStats } }))
    ]))) : {},
    diplomacy: {
        ...gameState.diplomacy,
        status: { ...gameState.diplomacy?.status }
    },
    messages: gameState.messages.map(serializeMessage),
    orders: gameState.orders ? gameState.orders.map(serializeOrder) : [],
    logs: gameState.logs ? gameState.logs.slice() : [],
    combatReports: gameState.combatReports ? gameState.combatReports.slice() : [],
    turnHistory: gameState.turnHistory ? gameState.turnHistory.slice() : [],
    turnEvents: gameState.turnEvents ? gameState.turnEvents.slice() : [],
    orderErrors: gameState.orderErrors ? gameState.orderErrors.slice() : [],
    minefieldIntel: gameState.minefieldIntel ? Object.fromEntries(Object.entries(gameState.minefieldIntel).map(([id, intel]) => ([
        id,
        intel.map(record => ({ ...record, center: { ...record.center } }))
    ]))) : {},
    wormholeIntel: gameState.wormholeIntel ? Object.fromEntries(Object.entries(gameState.wormholeIntel).map(([id, intel]) => ([
        id,
        intel.map(record => ({
            ...record,
            entry: record.entry ? { ...record.entry } : null,
            exit: record.exit ? { ...record.exit } : null,
            endpoints: record.endpoints ? record.endpoints.map(endpoint => ({ ...endpoint })) : null
        }))
    ]))) : {},
    empireCache: { ...gameState.empireCache },
    state: gameState.state,
    winnerEmpireId: gameState.winnerEmpireId,
    researchFocus: gameState.researchFocus,
    race: gameState.race ? { ...gameState.race } : null
});

export const serializePlayerState = (gameState, playerId) => {
    const player = gameState.players?.find(entry => entry.id === playerId);
    const economy = gameState.economy?.[playerId];
    const visibility = gameState.visibilityByPlayer?.[playerId];
    const starVisibility = visibility?.stars || null;
    const fleetVisibility = visibility?.fleets || null;
    const packetVisibility = visibility?.packets || null;
    const planetKnowledge = gameState.planetKnowledge?.[playerId] || {};
    const visibleStars = starVisibility
        ? gameState.stars.filter(star => starVisibility[star.id] && starVisibility[star.id] !== "none")
        : gameState.stars.filter(star => star.owner === playerId);
    const visibleStarIds = new Set(visibleStars.map(star => star.id));
    const knownStars = Object.values(planetKnowledge)
        .filter(entry => Number.isFinite(entry?.id) && !visibleStarIds.has(entry.id))
        .map(entry => {
            const snapshot = entry.snapshot ? { ...entry.snapshot } : null;
            const snapshotData = entry.snapshot || {};
            return {
                id: entry.id,
                name: entry.name ?? `Star#${entry.id}`,
                x: entry.x ?? 0,
                y: entry.y ?? 0,
                owner: snapshotData.owner ?? null,
                pop: snapshotData.pop ?? 0,
                mins: snapshotData.mins ? { ...snapshotData.mins } : { i: 0, b: 0, g: 0 },
                concentration: snapshotData.concentration ? { ...snapshotData.concentration } : null,
                environment: snapshotData.environment ? { ...snapshotData.environment } : null,
                habitability: snapshotData.habitability ?? null,
                deathRate: snapshotData.deathRate ?? null,
                factories: snapshotData.factories ?? null,
                mines: snapshotData.mines ?? null,
                def: snapshotData.def ? { ...snapshotData.def } : { mines: 0, facts: 0, base: null },
                queue: null,
                autoBuild: snapshotData.autoBuild ? { ...snapshotData.autoBuild } : null,
                terraforming: snapshotData.terraforming ? { ...snapshotData.terraforming } : null,
                visible: false,
                known: true,
                snapshot,
                hasStargate: snapshotData.hasStargate ?? false,
                stargateMassLimit: snapshotData.stargateMassLimit ?? 0,
                stargateRange: snapshotData.stargateRange ?? 0,
                stargateTechLevel: snapshotData.stargateTechLevel ?? 0,
                massDriverRating: snapshotData.massDriverRating ?? 0
            };
        });
    const visibleFleets = fleetVisibility
        ? gameState.fleets.filter(fleet => fleetVisibility[fleet.id] && fleetVisibility[fleet.id] !== "none")
        : gameState.fleets.filter(fleet => fleet.owner === playerId);
    const visiblePackets = packetVisibility
        ? gameState.packets.filter(packet => packetVisibility[packet.id] && packetVisibility[packet.id] !== "none")
        : gameState.packets.filter(packet => packet.owner === playerId);
    return createPlayerStateDTO({
        playerId,
        turnCount: gameState.turnCount,
        year: gameState.year,
        economy: economy ? {
            credits: economy.credits,
            minerals: economy.minerals,
            mineralStock: { ...economy.mineralStock }
        } : null,
        research: serializeTechnology(player?.technology),
        researchFocus: gameState.researchFocus,
        diplomacy: {
            ...gameState.diplomacy,
            status: { ...gameState.diplomacy?.status }
        },
        planets: visibleStars.map(star => serializeStar({
            ...star,
            visible: true,
            known: true,
            snapshot: planetKnowledge[star.id]?.snapshot ?? star.snapshot
        })).concat(knownStars.map(serializeStar)),
        fleets: visibleFleets.map(serializeFleet),
        packets: visiblePackets.map(serializePacket),
        orders: gameState.orders ? gameState.orders.filter(order => order.issuerId === playerId).map(serializeOrder) : [],
        messages: gameState.messages ? gameState.messages.filter(message => message.recipient === playerId).map(serializeMessage) : [],
        shipDesigns: gameState.shipDesigns?.[playerId] ? gameState.shipDesigns[playerId].map(design => ({
            ...design,
            finalStats: { ...design.finalStats }
        })) : [],
        planet_knowledge: Object.values(planetKnowledge).map(serializePlanetKnowledgeEntry)
    });
};

export const serializeOrdersState = ({ playerId, turnCount, year, orders }) => createOrdersStateDTO({
    playerId,
    turnCount,
    year,
    orders: orders ? orders.map(serializeOrder) : []
});

export const serializeHistoryState = (gameState) => createHistoryStateDTO({
    turnCount: gameState.turnCount,
    year: gameState.year,
    scores: gameState.scores ? gameState.scores.map(score => ({ ...score })) : [],
    logs: gameState.logs ? gameState.logs.slice() : [],
    battles: gameState.battles ? gameState.battles.slice() : [],
    combatReports: gameState.combatReports ? gameState.combatReports.slice() : [],
    turnHistory: gameState.turnHistory ? gameState.turnHistory.slice() : [],
    turnEvents: gameState.turnEvents ? gameState.turnEvents.slice() : [],
    messages: gameState.messages ? gameState.messages.map(serializeMessage) : []
});
