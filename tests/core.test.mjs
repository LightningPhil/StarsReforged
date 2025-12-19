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
import { Star, Fleet, ShipDesign, Race } from "../assets/js/models/entities.js";
import { DB } from "../assets/js/data/db.js";

const rulesPath = fileURLToPath(new URL("../config/gameRules.json", import.meta.url));
const rules = JSON.parse(fs.readFileSync(rulesPath, "utf-8"));
const techFieldsPath = fileURLToPath(new URL("../config/technologyFields.json", import.meta.url));
const technologyFields = JSON.parse(fs.readFileSync(techFieldsPath, "utf-8")).fields;

const createDesign = (name, hullIndex, engineIndex, weaponIndex, specialIndex) => new ShipDesign({
    name,
    hull: DB.hulls[hullIndex],
    engine: DB.engines[engineIndex],
    weapon: DB.weapons[weaponIndex],
    shield: DB.weapons[0],
    special: DB.specials[specialIndex]
});

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

    const humanDesign = createDesign("Probe", 0, 0, 0, 0);
    const aiRaider = createDesign("Raider", 0, 1, 1, 0);
    const aiColonizer = createDesign("Seeder", 1, 1, 0, 1);

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
        designs: [humanDesign],
        aiDesigns: [aiRaider, aiColonizer],
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
        design: state.aiDesigns[0]
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
        design: state.designs[0]
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
        design: state.aiDesigns[0]
    }));
    state.fleets.push(new Fleet({
        id: state.nextFleetId++,
        owner: 3,
        x: state.stars[1].x,
        y: state.stars[1].y,
        name: "Raider 3",
        design: state.aiDesigns[0]
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

try {
    testAIDecisionLegality();
    testVictoryConditions();
    testScoreCalculation();
    testHeadlessSimulation();
    testResearchProgression();
    console.log("All tests passed.");
} catch (error) {
    console.error("Test failure:", error);
    process.exitCode = 1;
}
