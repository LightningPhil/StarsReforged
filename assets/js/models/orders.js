export const ORDER_TYPES = {
    MOVE_FLEET: "MOVE_FLEET",
    COLONIZE: "COLONIZE",
    SCRAP_FLEET: "SCRAP_FLEET",
    BUILD_SHIPS: "BUILD_SHIPS",
    RESEARCH: "RESEARCH",
    DEPLOY_MINEFIELD: "DEPLOY_MINEFIELD",
    LAY_MINES: "LAY_MINES",
    SWEEP_MINES: "SWEEP_MINES",
    STARGATE_JUMP: "STARGATE_JUMP",
    SET_WAYPOINTS: "SET_WAYPOINTS"
};

export const WAYPOINT_TASKS = {
    TRANSPORT: "TRANSPORT",
    COLONIZE: "COLONIZE",
    REMOTE_MINE: "REMOTE_MINE",
    LAY_MINES: "LAY_MINES",
    PATROL: "PATROL",
    SCRAP: "SCRAP"
};

export class Order {
    constructor(type, issuerId, payload) {
        this.id = crypto.randomUUID();
        this.type = type;
        this.issuerId = issuerId;
        this.payload = payload;
    }
}
