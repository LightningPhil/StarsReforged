export const ORDER_TYPES = {
    MOVE_FLEET: "MOVE_FLEET",
    COLONIZE: "COLONIZE",
    SCRAP_FLEET: "SCRAP_FLEET",
    BUILD_SHIPS: "BUILD_SHIPS",
    BUILD_STRUCTURE: "BUILD_STRUCTURE",
    RESEARCH: "RESEARCH",
    DEPLOY_MINEFIELD: "DEPLOY_MINEFIELD",
    LAY_MINES: "LAY_MINES",
    LAUNCH_PACKET: "LAUNCH_PACKET",
    SWEEP_MINES: "SWEEP_MINES",
    STARGATE_JUMP: "STARGATE_JUMP",
    SCAN_SECTOR: "SCAN_SECTOR",
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
