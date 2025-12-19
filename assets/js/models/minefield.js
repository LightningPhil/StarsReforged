export class Minefield {
    static TYPE_DEFAULTS = {
        standard: { sweepResistance: 1.0, decayRate: 0.05 },
        heavy: { sweepResistance: 1.5, decayRate: 0.03 },
        smart: { sweepResistance: 2.0, decayRate: 0.02 }
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
