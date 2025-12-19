import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { AIController } from "../assets/js/ai/AIController.js";
import { OrderResolver } from "../assets/js/core/orderResolver.js";
import { TurnEngine } from "../assets/js/core/turnEngine.js";
import { calculateScores, resolveDefeats } from "../assets/js/core/gameResolution.js";
import { VictoryResolver } from "../assets/js/core/victoryResolver.js";
import { createTechnologyState, resolveResearchForEmpire } from "../assets/js/core/technologyResolver.js";
import { PCG32 } from "../assets/js/core/rng.js";
import { buildShipDesign } from "../assets/js/core/shipDesign.js";
import { Minefield } from "../assets/js/models/minefield.js";
import { Star, Fleet, Race } from "../assets/js/models/entities.js";
import { ORDER_TYPES } from "../assets/js/models/orders.js";

const rulesPath = fileURLToPath(new URL("../config/gameRules.json", import.meta.url));
const rules = JSON.parse(fs.readFileSync(rulesPath, "utf-8"));
const techFieldsPath = fileURLToPath(new URL("../config/technologyFields.json", import.meta.url));
const technologyFields = JSON.parse(fs.readFileSync(techFieldsPath, "utf-8")).fields;

const createDesign = (name, hullId, componentIds) => {
    const hull = rules.hulls.find(entry => entry.id === hullId);
    const result = buildShipDesign({ name, hull, componentIds });
    return result.design;
};

const createBaseState = () => {
    const rng = new PCG32(932515789n, 54n);
    const stars = [
        new Star({ id: 0, x: 100, y: 100, name: "ALPHA" }),
        new Star({ id: 1, x: 300, y: 120, name: "BETA" }),
        new Star({ id: 2, x: 500, y: 180, name: "GAMMA" })
    ];
    stars.forEach(star => {
        star.pop = 5000;
        star.def.mines = 20;
        star.def.facts = 20;
    });

    const humanDesign = createDesign("Probe", "scout", ["ion_drive", "laser_array", "scanner_array"]);
    const aiRaider = createDesign("Raider", "scout", ["ion_drive", "laser_array", "armor_plating"]);
    const aiColonizer = createDesign("Seeder", "frigate", ["ion_drive", "laser_array", "colony_pod", "reactor_core"]);

    return {
        turnCount: 0,
        year: 2400,
        credits: 1000,
        minerals: 5000,
        mineralStock: { i: 2000, b: 1500, g: 1500 },
        economy: {
            1: { credits: 1000, mineralStock: { i: 2000, b: 1500, g: 1500 }, minerals: 5000 },
            2: { credits: 800, mineralStock: { i: 1500, b: 1000, g: 1000 }, minerals: 3500 }
        },
        stars,
        fleets: [],
        packets: [],
        minefields: [],
        shipDesigns: {
            1: [humanDesign],
            2: [aiRaider, aiColonizer]
        },
        minefieldIntel: { 1: [] },
        messages: [],
        battles: [],
        sectorScans: [],
        logs: [],
        turnHash: 0n,
        empireCache: { taxTotal: 0, industrialOutput: 0 },
        state: "RUNNING",
        winnerEmpireId: null,
        researchFocus: null,
        rules: { ...rules, technologyFields },
        rngSeed: 932515789n,
        rng,
        nextFleetId: 1,
        nextPacketId: 1,
        race: new Race({
            name: "Test",
            type: "Synthetic",
            grav: "1g",
            temp: "0",
            growth: "",
            mining: ""
        }),
        diplomacy: { status: { 2: "Neutral" }, lastWarning: 0 },
        players: [
            { id: 1, type: "human", status: "active", eliminatedAtTurn: null, technology: createTechnologyState(technologyFields) },
            { id: 2, type: "ai", status: "active", eliminatedAtTurn: null, technology: createTechnologyState(technologyFields) }
        ],
        orders: [],
        combatReports: [],
        turnHistory: [],
        turnEvents: []
    };
};

const testAIDecisionLegality = () => {
    const state = createBaseState();
    state.stars[0].owner = 2;
    state.stars[1].owner = 1;
    state.fleets.push(new Fleet({
        id: state.nextFleetId++,
        owner: 2,
        x: state.stars[0].x,
        y: state.stars[0].y,
        name: "Raider Wing",
        design: state.shipDesigns[2][0]
    }));

    const difficulty = { aggression: 0.6, riskTolerance: 0.5, lookaheadDepth: 1 };
    const result = AIController.runTurn(state, 2, difficulty, { roll: (max) => state.rng.nextInt(max), maxTimeMs: 100 });
    const testState = { ...state, orderErrors: [] };
    OrderResolver.resolveOrders(testState, result.orders);
    assert.equal(testState.orderErrors.length, 0, "AI orders should be legal");
};

const testVictoryConditions = () => {
    const state = createBaseState();
    state.stars.forEach(star => {
        star.owner = 1;
    });
    const outcome = VictoryResolver.check(state);
    assert.equal(Boolean(outcome), true, "Game should end when one player owns all stars");
    assert.equal(outcome.winnerEmpireId, 1, "Player 1 should be winner");
};

const testScoreCalculation = () => {
    const state = createBaseState();
    state.stars[0].owner = 1;
    state.stars[1].owner = 1;
    state.stars[2].owner = 2;
    state.fleets.push(new Fleet({
        id: state.nextFleetId++,
        owner: 1,
        x: state.stars[0].x,
        y: state.stars[0].y,
        name: "Probe",
        design: state.shipDesigns[1][0]
    }));
    const scores = calculateScores(state);
    const playerOne = scores.find(score => score.playerId === 1);
    const expected = (state.stars[0].pop + state.stars[1].pop)
        + (2 * 50)
        + (1 * 10)
        + (playerOne.totalTechLevels * 25);
    assert.equal(playerOne.score, expected, "Score should match configured formula");
};

const testHeadlessSimulation = () => {
    const state = createBaseState();
    state.players = [
        { id: 2, type: "ai", status: "active", eliminatedAtTurn: null, technology: createTechnologyState(technologyFields) },
        { id: 3, type: "ai", status: "active", eliminatedAtTurn: null, technology: createTechnologyState(technologyFields) }
    ];
    state.economy = {
        2: { credits: 800, mineralStock: { i: 1500, b: 1000, g: 1000 }, minerals: 3500 },
        3: { credits: 800, mineralStock: { i: 1500, b: 1000, g: 1000 }, minerals: 3500 }
    };
    state.stars[0].owner = 2;
    state.stars[1].owner = 3;
    state.stars[2].owner = null;
    state.fleets.push(new Fleet({
        id: state.nextFleetId++,
        owner: 2,
        x: state.stars[0].x,
        y: state.stars[0].y,
        name: "Raider 2",
        design: state.shipDesigns[2][0]
    }));
    state.fleets.push(new Fleet({
        id: state.nextFleetId++,
        owner: 3,
        x: state.stars[1].x,
        y: state.stars[1].y,
        name: "Raider 3",
        design: state.shipDesigns[2][0]
    }));

    const difficulty = { aggression: 0.6, riskTolerance: 0.5, lookaheadDepth: 1 };
    const simulationRules = { ...rules, victory: { ...rules.victory, maxTurns: 5 }, technologyFields };
    state.rules = simulationRules;

    let outcome = null;
    while (state.turnCount < simulationRules.victory.maxTurns) {
        state.turnEvents = [];
        state.orders = [];
        state.players.filter(player => player.status === "active").forEach(player => {
            const result = AIController.runTurn(state, player.id, difficulty, { roll: (max) => state.rng.nextInt(max), maxTimeMs: 50 });
            state.orders.push(...result.orders);
        });
        const nextState = TurnEngine.processTurn(state);
        Object.assign(state, nextState);
        resolveDefeats(state);
        outcome = VictoryResolver.check(state);
        if (outcome) {
            break;
        }
    }
    assert.equal(Boolean(outcome), true, "Simulation should reach a terminal state");
};

const testResearchProgression = () => {
    const state = createBaseState();
    state.stars[0].owner = 1;
    state.stars[0].pop = 10000;
    const techState = state.players[0].technology;
    techState.allocation = { WEAP: 1, PROP: 0, CONST: 0, ELEC: 0, ENER: 0, BIOT: 0, TERR: 0 };
    resolveResearchForEmpire(techState, 10000 * rules.research.populationModifier, state.rules);
    assert.ok(techState.fields.WEAP.level > 1, "Weapons tech should advance with sufficient RP");
};

const testMineDamageDeterminism = () => {
    const createStateWithMine = () => {
        const state = createBaseState();
        const design = createDesign("Runner", "scout", ["ion_drive", "laser_array", "armor_plating"]);
        const fleet = new Fleet({
            id: state.nextFleetId++,
            owner: 1,
            x: 100,
            y: 100,
            name: "Runner",
            design
        });
        fleet.dest = { x: 200, y: 100 };
        state.fleets.push(fleet);
        state.minefields.push(new Minefield({
            id: 1,
            ownerEmpireId: 2,
            center: { x: 150, y: 100 },
            radius: 20,
            strength: 120,
            type: "standard",
            turnCreated: state.turnCount
        }));
        return state;
    };
    const stateA = createStateWithMine();
    const stateB = createStateWithMine();
    const nextA = TurnEngine.processTurn(stateA);
    const nextB = TurnEngine.processTurn(stateB);
    const hpA = nextA.fleets.find(fleet => fleet.id === 1)?.mineHitpoints ?? 0;
    const hpB = nextB.fleets.find(fleet => fleet.id === 1)?.mineHitpoints ?? 0;
    assert.equal(hpA, hpB, "Minefield transit damage should be deterministic with fixed RNG seed");
};

const testMinefieldDecay = () => {
    const state = createBaseState();
    state.minefields.push(new Minefield({
        id: 1,
        ownerEmpireId: 2,
        center: { x: 100, y: 100 },
        radius: 10,
        strength: 100,
        type: "standard",
        turnCreated: state.turnCount
    }));
    const first = TurnEngine.processTurn(state);
    const second = TurnEngine.processTurn(first);
    const strength = second.minefields[0]?.strength || 0;
    assert.ok(strength < 100, "Minefield strength should decay over multiple turns");
};

const testMineSweepingReducesStrength = () => {
    const state = createBaseState();
    const sweeperDesign = createDesign("Sweeper", "scout", ["ion_drive", "laser_array", "scanner_array"]);
    const sweeper = new Fleet({
        id: state.nextFleetId++,
        owner: 1,
        x: state.stars[0].x,
        y: state.stars[0].y,
        name: "Sweeper",
        design: sweeperDesign
    });
    sweeper.mineSweepingStrength = 40;
    state.fleets.push(sweeper);
    const minefield = new Minefield({
        id: 7,
        ownerEmpireId: 2,
        center: { x: sweeper.x, y: sweeper.y },
        radius: 40,
        strength: 120,
        type: "standard",
        turnCreated: state.turnCount
    });
    state.minefields.push(minefield);
    state.orders = [{
        type: ORDER_TYPES.SWEEP_MINES,
        issuerId: 1,
        payload: { fleetId: sweeper.id, minefieldId: minefield.id }
    }];
    const next = TurnEngine.processTurn(state);
    const updated = next.minefields.find(field => field.id === minefield.id);
    if (!updated) {
        assert.ok(true, "Minefield should be removed when swept to zero");
        return;
    }
    assert.ok(updated.strength < 120, "Minefield strength should be reduced by sweeping");
};

const testStargateJumpMovesFleet = () => {
    const state = createBaseState();
    const source = state.stars[0];
    const destination = state.stars[1];
    source.hasStargate = true;
    source.stargateRange = 500;
    source.stargateMassLimit = 500;
    destination.hasStargate = true;
    destination.stargateRange = 500;
    destination.stargateMassLimit = 500;
    const fleet = new Fleet({
        id: state.nextFleetId++,
        owner: 1,
        x: source.x,
        y: source.y,
        name: "Jumper",
        design: state.shipDesigns[1][0]
    });
    state.fleets.push(fleet);
    state.orders = [{
        type: ORDER_TYPES.STARGATE_JUMP,
        issuerId: 1,
        payload: { fleetId: fleet.id, sourcePlanetId: source.id, destinationPlanetId: destination.id }
    }];
    const next = TurnEngine.processTurn(state);
    const moved = next.fleets.find(item => item.id === fleet.id);
    assert.ok(moved, "Fleet should survive the jump");
    assert.equal(moved.x, destination.x, "Fleet should arrive at destination x");
    assert.equal(moved.y, destination.y, "Fleet should arrive at destination y");
};

const testStargateMisjumpScaling = () => {
    const state = createBaseState();
    const source = state.stars[0];
    const destination = state.stars[1];
    source.hasStargate = true;
    source.stargateRange = 500;
    source.stargateMassLimit = 100;
    destination.hasStargate = true;
    destination.stargateRange = 500;
    destination.stargateMassLimit = 100;

    const lightDesign = createDesign("Light", "scout", ["ion_drive", "laser_array", "scanner_array"]);
    const heavyDesign = createDesign("Heavy", "destroyer", ["fusion_burn", "plasma_lance", "laser_array", "armor_plating", "reactor_core"]);
    const lightFleet = new Fleet({
        id: state.nextFleetId++,
        owner: 1,
        x: source.x,
        y: source.y,
        name: "Light",
        design: lightDesign
    });
    const heavyFleet = new Fleet({
        id: state.nextFleetId++,
        owner: 1,
        x: source.x,
        y: source.y,
        name: "Heavy",
        design: heavyDesign
    });
    state.fleets.push(lightFleet, heavyFleet);

    const iterations = 12;
    let lightLosses = 0;
    let heavyLosses = 0;
    for (let i = 0; i < iterations; i++) {
        const trial = createBaseState();
        const src = trial.stars[0];
        const dst = trial.stars[1];
        src.hasStargate = true;
        src.stargateRange = 500;
        src.stargateMassLimit = 120;
        dst.hasStargate = true;
        dst.stargateRange = 500;
        dst.stargateMassLimit = 120;
        const light = new Fleet({
            id: trial.nextFleetId++,
            owner: 1,
            x: src.x,
            y: src.y,
            name: "Light",
            design: lightDesign
        });
        const heavy = new Fleet({
            id: trial.nextFleetId++,
            owner: 1,
            x: src.x,
            y: src.y,
            name: "Heavy",
            design: heavyDesign
        });
        trial.fleets.push(light, heavy);
        trial.orders = [
            {
                type: ORDER_TYPES.STARGATE_JUMP,
                issuerId: 1,
                payload: { fleetId: light.id, sourcePlanetId: src.id, destinationPlanetId: dst.id }
            },
            {
                type: ORDER_TYPES.STARGATE_JUMP,
                issuerId: 1,
                payload: { fleetId: heavy.id, sourcePlanetId: src.id, destinationPlanetId: dst.id }
            }
        ];
        const resolved = TurnEngine.processTurn(trial);
        if (!resolved.fleets.find(fleet => fleet.id === light.id)) {
            lightLosses += 1;
        }
        if (!resolved.fleets.find(fleet => fleet.id === heavy.id)) {
            heavyLosses += 1;
        }
    }
    assert.ok(heavyLosses >= lightLosses, "Heavier fleets should misjump more often than lighter fleets");
};

const testInvalidOrderRejection = () => {
    const state = createBaseState();
    state.stars[0].hasStargate = false;
    state.orders = [{
        type: ORDER_TYPES.STARGATE_JUMP,
        issuerId: 1,
        payload: { fleetId: 999, sourcePlanetId: 0, destinationPlanetId: 1 }
    }];
    const next = TurnEngine.processTurn(state);
    assert.ok(next.orderErrors.length > 0, "Invalid orders should be rejected");
};

try {
    testAIDecisionLegality();
    testVictoryConditions();
    testScoreCalculation();
    testHeadlessSimulation();
    testResearchProgression();
    testMineDamageDeterminism();
    testMinefieldDecay();
    testMineSweepingReducesStrength();
    testStargateJumpMovesFleet();
    testStargateMisjumpScaling();
    testInvalidOrderRejection();
    console.log("All tests passed.");
} catch (error) {
    console.error("Test failure:", error);
    process.exitCode = 1;
}
