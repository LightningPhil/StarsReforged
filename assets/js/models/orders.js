export const ORDER_TYPES = {
    MOVE_FLEET: "MOVE_FLEET",
    COLONIZE: "COLONIZE",
    SCRAP_FLEET: "SCRAP_FLEET",
    BUILD_SHIPS: "BUILD_SHIPS",
    RESEARCH: "RESEARCH"
};

export class Order {
    constructor(type, issuerId, payload) {
        this.id = crypto.randomUUID();
        this.type = type;
        this.issuerId = issuerId;
        this.payload = payload;
    }
}
