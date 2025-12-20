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
    stargateTechLevel: star.stargateTechLevel
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
    hp: fleet.hp,
    armor: fleet.armor,
    structure: fleet.structure,
    shields: fleet.shields,
    mineUnits: fleet.mineUnits,
    mineLayingCapacity: fleet.mineLayingCapacity,
    mineSweepingStrength: fleet.mineSweepingStrength,
    mineHitpoints: fleet.mineHitpoints,
    mass: fleet.mass,
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
    destId: packet.destId
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
    empireCache: { ...gameState.empireCache },
    state: gameState.state,
    winnerEmpireId: gameState.winnerEmpireId,
    researchFocus: gameState.researchFocus,
    race: gameState.race ? { ...gameState.race } : null
});

export const serializePlayerState = (gameState, playerId) => {
    const player = gameState.players?.find(entry => entry.id === playerId);
    const economy = gameState.economy?.[playerId];
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
        planets: gameState.stars.filter(star => star.owner === playerId).map(serializeStar),
        fleets: gameState.fleets.filter(fleet => fleet.owner === playerId).map(serializeFleet),
        packets: gameState.packets.filter(packet => packet.owner === playerId).map(serializePacket),
        orders: gameState.orders ? gameState.orders.filter(order => order.issuerId === playerId).map(serializeOrder) : [],
        messages: gameState.messages ? gameState.messages.filter(message => message.recipient === playerId).map(serializeMessage) : [],
        shipDesigns: gameState.shipDesigns?.[playerId] ? gameState.shipDesigns[playerId].map(design => ({
            ...design,
            finalStats: { ...design.finalStats }
        })) : []
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
