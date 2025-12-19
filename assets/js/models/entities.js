class Star {
    constructor({ id, x, y, name, owner = null, rng = null }) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.name = name;
        this.owner = owner;
        this.pop = 0;
        const roll = () => (rng ? rng.nextInt(100) : 0);
        this.mins = { i: roll(), b: roll(), g: roll() };
        this.def = { mines: 0, facts: 0, base: null };
        this.queue = null;
        this.visible = false;
        this.known = false;
        this.snapshot = null;
    }

    updateSnapshot() {
        this.snapshot = {
            owner: this.owner,
            pop: this.pop,
            mins: { ...this.mins },
            def: { ...this.def }
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
    constructor({ name, type, grav, temp, growth, mining }) {
        this.name = name;
        this.type = type;
        this.grav = grav;
        this.temp = temp;
        this.growth = growth;
        this.mining = mining;
    }
}

export { Star, ShipDesign, Fleet, ResourcePacket, Message, Race };
