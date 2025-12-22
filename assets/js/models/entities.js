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
        this.concentration = { ...this.mins };
        this.environment = {
            grav: envRoll(100),
            temp: envRoll(100),
            rad: envRoll(100)
        };
        this.habitability = 0;
        this.deathRate = 0;
        this.factories = 0;
        this.mines = 0;
        this.def = { mines: 0, facts: 0, base: null };
        this.queue = null;
        this.terraforming = {
            active: false,
            target: null,
            progress: 0
        };
        this.autoBuild = null;
        this.visible = false;
        this.known = false;
        this.snapshot = null;
        this.hasStargate = false;
        this.stargateMassLimit = 0;
        this.stargateRange = 0;
        this.stargateTechLevel = 0;
        this.massDriverRating = 0;
    }

    updateSnapshot() {
        this.snapshot = {
            owner: this.owner,
            pop: this.pop,
            mins: { ...this.mins },
            concentration: { ...this.concentration },
            environment: { ...this.environment },
            def: { ...this.def },
            habitability: this.habitability,
            deathRate: this.deathRate,
            factories: this.factories,
            mines: this.mines,
            terraforming: this.terraforming ? { ...this.terraforming } : null,
            autoBuild: this.autoBuild ? { ...this.autoBuild } : null,
            hasStargate: this.hasStargate,
            stargateMassLimit: this.stargateMassLimit,
            stargateRange: this.stargateRange,
            stargateTechLevel: this.stargateTechLevel,
            massDriverRating: this.massDriverRating
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
        this.beamDamage = finalStats.beamDamage ?? finalStats.attack ?? 0;
        this.torpedoDamage = finalStats.torpedoDamage ?? 0;
        this.beamRange = finalStats.beamRange ?? (this.beamDamage > 0 ? 1 : 0);
        this.torpedoRange = finalStats.torpedoRange ?? (this.torpedoDamage > 0 ? 2 : 0);
        this.bombing = finalStats.bombing ?? 0;
        this.gattling = finalStats.gattling ?? 0;
        this.sapper = finalStats.sapper ?? 0;
        this.defense = finalStats.defense;
        this.range = finalStats.range;
        this.fuel = finalStats.fuel;
        this.cargo = finalStats.cargo;
        this.shields = finalStats.shields;
        this.powerOutput = finalStats.powerOutput;
        this.powerUsage = finalStats.powerUsage;
        this.signature = finalStats.signature;
        this.scanner = finalStats.scanner ?? 0;
        this.camo = finalStats.camo ?? 0;
        this.cloakPoints = finalStats.cloakPoints ?? 0;
        this.cloak = this.cloakPoints ?? 0;
        this.mineCapacity = finalStats.mineCapacity;
        this.mineLayingCapacity = finalStats.mineLayingCapacity;
        this.mineSweepingStrength = finalStats.mineSweepingStrength;
        this.mineHitpoints = finalStats.mineHitpoints;
        this.initiative = finalStats.initiative;
        this.flags = finalStats.flags || [];
        this.engineFuelUsage = finalStats.engineFuelUsage ?? null;
        this.ramscoopFreeSpeed = finalStats.ramscoopFreeSpeed ?? 0;
    }
}

class Fleet {
    constructor({ id, owner, x, y, name, design, waypoints = null, cargo = null, shipStacks = null, warp = null }) {
        this.id = id;
        this.owner = owner;
        this.x = x;
        this.y = y;
        this.name = name;
        this.design = design;
        this.designId = design.designId;
        this.fuel = design.fuel;
        this.warp = Number.isFinite(warp) ? warp : design.speed;
        this.dest = null;
        this.waypoints = Array.isArray(waypoints) ? waypoints.map(point => ({ ...point })) : [];
        this.cargoCapacity = design.cargo || 0;
        this.cargo = cargo ? { ...cargo } : { i: 0, b: 0, g: 0, pop: 0 };
        this.shipStacks = Array.isArray(shipStacks) && shipStacks.length
            ? shipStacks.map(stack => ({ ...stack }))
            : [{ designId: this.designId, count: 1 }];
        this.shipStacks = this.shipStacks.map(stack => {
            const normalized = {
                ...stack,
                count: Math.max(0, Math.floor(stack.count || 1))
            };
            if (normalized.designId === this.designId) {
                return {
                    ...normalized,
                    stats: normalized.stats || {
                        armor: design.armor,
                        structure: design.structure,
                        shields: design.shields,
                        initiative: design.initiative,
                        defense: design.defense,
                        beamDamage: design.beamDamage ?? design.attack ?? 0,
                        torpedoDamage: design.torpedoDamage ?? 0,
                        beamRange: design.beamRange ?? (design.attack > 0 ? 1 : 0),
                        torpedoRange: design.torpedoRange ?? (design.torpedoDamage > 0 ? 2 : 0),
                        bombing: design.bombing ?? 0,
                        gattling: design.gattling ?? 0,
                        sapper: design.sapper ?? 0,
                        speed: design.speed
                    },
                    mass: normalized.mass ?? design.mass,
                    cargoCapacity: normalized.cargoCapacity ?? (design.cargo || 0),
                    fuelCapacity: normalized.fuelCapacity ?? (design.fuel || 0)
                };
            }
            return normalized;
        });
        const stackTotals = this.shipStacks.reduce((totals, stack) => {
            const count = stack.count || 0;
            totals.mass += (stack.mass || 0) * count;
            totals.cargoCapacity += (stack.cargoCapacity || 0) * count;
            totals.fuelPool += (stack.fuelCapacity || 0) * count;
            return totals;
        }, { mass: 0, cargoCapacity: 0, fuelPool: 0 });
        this.cargoCapacity = stackTotals.cargoCapacity || this.cargoCapacity;
        this.fuelPool = stackTotals.fuelPool || this.fuel;
        if (!Number.isFinite(this.fuel)) {
            this.fuel = this.fuelPool;
        } else if (Number.isFinite(this.fuelPool) && this.fuelPool > 0) {
            this.fuel = Math.min(this.fuel, this.fuelPool);
        }
        this.armor = design.armor;
        this.structure = design.structure;
        this.shields = design.shields;
        this.mineUnits = design.mineCapacity || 0;
        this.mineLayingCapacity = design.mineLayingCapacity || 0;
        this.mineSweepingStrength = design.mineSweepingStrength || 0;
        this.mineHitpoints = design.mineHitpoints || (design.armor + design.structure);
        this.mass = stackTotals.mass || design.mass;
        this.cargoMass = (this.cargo?.i || 0)
            + (this.cargo?.b || 0)
            + (this.cargo?.g || 0)
            + (this.cargo?.pop || 0);
        this.hp = this.armor + this.structure + this.shields;
        this.cloakPoints = design.cloakPoints ?? design.finalStats?.cloakPoints ?? design.cloak ?? 0;
        this.cloak = this.cloakPoints;
    }

    get speed() {
        const stackSpeeds = (this.shipStacks || [])
            .map(stack => stack.stats?.speed)
            .filter(speed => Number.isFinite(speed));
        const minSpeed = stackSpeeds.length ? Math.min(...stackSpeeds) : this.design.speed;
        return Math.max(15, minSpeed * 12);
    }

    get scan() {
        return this.design.scanner ?? this.design.finalStats?.scanner ?? 0;
    }
}

class ResourcePacket {
    constructor({
        id,
        x,
        y,
        destX,
        destY,
        payload,
        destId,
        owner,
        type = "resource",
        speed = null,
        driverRating = null,
        decayRate = null,
        catchRadius = null,
        damageMultiplier = null
    }) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.destX = destX;
        this.destY = destY;
        this.payload = payload;
        this.destId = destId;
        this.owner = owner;
        this.type = type;
        this.speed = speed;
        this.driverRating = driverRating;
        this.decayRate = decayRate;
        this.catchRadius = catchRadius;
        this.damageMultiplier = damageMultiplier;
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
        tolerance = {},
        economy = {}
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
        this.economy = {
            resPerColonist: economy.resPerColonist ?? 1000,
            resPerFactory: economy.resPerFactory ?? 10,
            factoryCost: economy.factoryCost ?? 10,
            mineCost: economy.mineCost ?? 6,
            maxFactoriesPer10k: economy.maxFactoriesPer10k ?? 10,
            maxMinesPer10k: economy.maxMinesPer10k ?? 10,
            miningRate: economy.miningRate ?? 1
        };
    }
}

export { Star, ShipDesign, Fleet, ResourcePacket, Message, Race };
