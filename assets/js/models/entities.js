class Star {
    constructor({ id, x, y, name, owner = null, rng = null }) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.name = name;
        this.owner = owner;
        this.pop = 0;
        const roll = (max = 100) => (rng ? rng.nextInt(max) : 0);
        const envRoll = (max = 100) => (rng ? rng.nextInt(max) : Math.floor(max / 2));
        this.mins = { i: roll(), b: roll(), g: roll() };
        this.environment = {
            grav: envRoll(100),
            temp: envRoll(100),
            rad: envRoll(100)
        };
        this.def = { mines: 0, facts: 0, base: null };
        this.queue = null;
        this.visible = false;
        this.known = false;
        this.snapshot = null;
        this.hasStargate = false;
        this.stargateMassLimit = 0;
        this.stargateRange = 0;
        this.stargateTechLevel = 0;
    }

    updateSnapshot() {
        this.snapshot = {
            owner: this.owner,
            pop: this.pop,
            mins: { ...this.mins },
            environment: { ...this.environment },
            def: { ...this.def },
            hasStargate: this.hasStargate,
            stargateMassLimit: this.stargateMassLimit,
            stargateRange: this.stargateRange,
            stargateTechLevel: this.stargateTechLevel
        };
    }
}

class ShipDesign {
    constructor({ designId, name, hullId, components, finalStats, cost }) {
        this.designId = designId;
        this.name = name;
        this.hullId = hullId;
        this.components = components;
        this.finalStats = finalStats;
        this.cost = cost;
        this.mass = finalStats.mass;
        this.armor = finalStats.armor;
        this.structure = finalStats.structure;
        this.speed = finalStats.speed;
        this.attack = finalStats.attack;
        this.defense = finalStats.defense;
        this.range = finalStats.range;
        this.fuel = finalStats.fuel;
        this.shields = finalStats.shields;
        this.powerOutput = finalStats.powerOutput;
        this.powerUsage = finalStats.powerUsage;
        this.signature = finalStats.signature;
        this.mineCapacity = finalStats.mineCapacity;
        this.mineLayingCapacity = finalStats.mineLayingCapacity;
        this.mineSweepingStrength = finalStats.mineSweepingStrength;
        this.mineHitpoints = finalStats.mineHitpoints;
        this.initiative = finalStats.initiative;
        this.flags = finalStats.flags || [];
    }
}

class Fleet {
    constructor({ id, owner, x, y, name, design }) {
        this.id = id;
        this.owner = owner;
        this.x = x;
        this.y = y;
        this.name = name;
        this.design = design;
        this.designId = design.designId;
        this.fuel = design.fuel;
        this.dest = null;
        this.armor = design.armor;
        this.structure = design.structure;
        this.shields = design.shields;
        this.mineUnits = design.mineCapacity || 0;
        this.mineLayingCapacity = design.mineLayingCapacity || 0;
        this.mineSweepingStrength = design.mineSweepingStrength || 0;
        this.mineHitpoints = design.mineHitpoints || (design.armor + design.structure);
        this.mass = design.mass;
        this.hp = this.armor + this.structure + this.shields;
    }

    get speed() {
        return Math.max(15, this.design.speed * 12);
    }

    get scan() {
        return this.design.range;
    }
}

class ResourcePacket {
    constructor({ id, x, y, destX, destY, payload, destId, owner }) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.destX = destX;
        this.destY = destY;
        this.payload = payload;
        this.destId = destId;
        this.owner = owner;
    }
}

class Message {
    constructor({ turn, sender, recipient, text, priority = 'normal' }) {
        this.turn = turn;
        this.sender = sender;
        this.recipient = recipient;
        this.text = text;
        this.priority = priority;
    }
}

class Race {
    constructor({
        name,
        type,
        grav,
        temp,
        growth,
        mining,
        primaryTrait = null,
        lesserTraits = [],
        tolerance = {}
    }) {
        this.name = name;
        this.type = type;
        this.grav = grav;
        this.temp = temp;
        this.growth = growth;
        this.mining = mining;
        this.primaryTrait = primaryTrait;
        this.lesserTraits = Array.isArray(lesserTraits) ? lesserTraits : [];
        this.tolerance = {
            grav: { center: 50, width: 25, immune: false, ...(tolerance?.grav || {}) },
            temp: { center: 50, width: 25, immune: false, ...(tolerance?.temp || {}) },
            rad: { center: 50, width: 25, immune: false, ...(tolerance?.rad || {}) }
        };
    }
}

export { Star, ShipDesign, Fleet, ResourcePacket, Message, Race };
