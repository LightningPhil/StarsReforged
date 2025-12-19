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
    constructor({ name, hull, engine, weapon, shield, special }) {
        this.name = name;
        this.hull = hull;
        this.engine = engine;
        this.weapon = weapon;
        this.shield = shield;
        this.special = special;
        this.cost = hull.cost + engine.cost + weapon.cost + shield.cost + special.cost;
        this.mass = hull.mass + (special.mass || 0);
        this.fuel = Math.floor(hull.baseFuel + engine.power * 40);
        this.range = Math.floor(engine.scan + hull.baseFuel * 0.4);
        this.speed = Math.max(1, Math.floor(engine.power - hull.mass / 120));
        this.bv = weapon.dmg * 2 + (shield.dmg || 0);
        this.flags = special.flags || [];
        this.attack = weapon.dmg;
        this.defense = shield.dmg || 0;
        this.shields = Math.max(0, Math.floor((shield.dmg || 0) * 2));
        this.hull = Math.max(50, hull.mass * 2);
        this.initiative = engine.power;
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
        this.fuel = design.fuel;
        this.dest = null;
        this.hp = 100 + design.bv;
    }

    get speed() {
        return Math.max(15, this.design.speed * 12);
    }

    get scan() {
        return this.design.range;
    }
}

class Minefield {
    constructor({ x, y, radius, owner }) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.owner = owner;
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

export { Star, ShipDesign, Fleet, Minefield, ResourcePacket, Message, Race };
