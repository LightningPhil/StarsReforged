export class Minefield {
    constructor({ id, ownerEmpireId, center, radius, strength, type = "standard", turnCreated }) {
        this.id = id;
        this.ownerEmpireId = ownerEmpireId;
        this.center = { ...center };
        this.radius = radius;
        this.strength = strength;
        this.type = type;
        this.turnCreated = turnCreated;
    }

    get density() {
        const area = Math.PI * this.radius * this.radius;
        return area > 0 ? this.strength / area : 0;
    }
}
