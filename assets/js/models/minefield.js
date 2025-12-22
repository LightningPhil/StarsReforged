export class Minefield {
    static TYPE_DEFAULTS = {
        standard: { sweepResistance: 1.0, decayRate: 0.05, safeSpeed: 4, riskFactor: 0.003, damagePerEngine: 100 },
        heavy: { sweepResistance: 1.5, decayRate: 0.03, safeSpeed: 6, riskFactor: 0.01, damagePerEngine: 500 },
        speed_trap: { sweepResistance: 2.0, decayRate: 0.02, safeSpeed: 5, riskFactor: 0.03, damagePerEngine: 0 }
    };

    constructor({
        id,
        ownerEmpireId,
        center,
        radius,
        strength,
        type = "standard",
        turnCreated,
        sweepResistance,
        decayRate,
        visibility = "owner"
    }) {
        const defaults = Minefield.TYPE_DEFAULTS[type] || Minefield.TYPE_DEFAULTS.standard;
        this.id = id;
        this.ownerEmpireId = ownerEmpireId;
        this.center = { ...center };
        this.radius = radius;
        this.strength = strength;
        this.type = type;
        this.turnCreated = turnCreated;
        this.sweepResistance = sweepResistance ?? defaults.sweepResistance;
        this.decayRate = decayRate ?? defaults.decayRate;
        this.visibility = visibility;
    }

    get density() {
        const area = Math.PI * this.radius * this.radius;
        return area > 0 ? this.strength / area : 0;
    }
}
