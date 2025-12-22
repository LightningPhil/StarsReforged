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
    DETONATE_MINES: "DETONATE_MINES",
    STARGATE_JUMP: "STARGATE_JUMP",
    SCAN_SECTOR: "SCAN_SECTOR",
    SET_WAYPOINTS: "SET_WAYPOINTS",
    UPDATE_BATTLE_PLAN: "UPDATE_BATTLE_PLAN",
    MERGE_FLEET: "MERGE_FLEET",
    SPLIT_FLEET: "SPLIT_FLEET",
    TRANSFER_FLEET: "TRANSFER_FLEET"
};

export const WAYPOINT_TASKS = {
    TRANSPORT: "TRANSPORT",
    COLONIZE: "COLONIZE",
    REMOTE_MINE: "REMOTE_MINE",
    LAY_MINES: "LAY_MINES",
    PATROL: "PATROL",
    SCRAP: "SCRAP"
};

export const WAYPOINT_TASK_PAYLOADS = {
    TRANSPORT: {
        mode: "UNLOAD",
        cargo: { i: 0, b: 0, g: 0, pop: 0 }
    },
    COLONIZE: {
        seedPopulation: 2500,
        minerals: { i: 0, b: 0, g: 0 }
    },
    REMOTE_MINE: {
        minerals: { i: 0, b: 0, g: 0 }
    },
    LAY_MINES: {
        mineUnitsToDeploy: 0,
        type: "standard"
    },
    PATROL: {
        radius: 60
    },
    SCRAP: {
        recoveryRate: 0.5
    }
};

export class Order {
    constructor(type, issuerId, payload) {
        this.id = crypto.randomUUID();
        this.type = type;
        this.issuerId = issuerId;
        this.payload = payload;
    }
}
