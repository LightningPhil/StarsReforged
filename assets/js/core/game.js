import { DB } from "../data/db.js";
import { Fleet, Message, Minefield, Race, ResourcePacket, ShipDesign, Star } from "../models/entities.js";
import { PCG32 } from "./rng.js";
import { dist, intSqrt } from "./utils.js";
import { TurnEngine } from "./turnEngine.js";
import { AIController } from "../ai/AIController.js";
import { loadConfig } from "./config.js";
import { evaluateVictory, resolveDefeats, calculateScores } from "./gameResolution.js";

let ui = null;
let renderer = null;

export const bindUI = (uiRef) => {
    ui = uiRef;
};

export const bindRenderer = (rendererRef) => {
    renderer = rendererRef;
};

export const Game = {
    turnCount: 0,
    year: 2400,
    credits: 1000,
    minerals: 5000,
    mineralStock: { i: 2000, b: 1500, g: 1500 },
    economy: {},
    stars: [],
    fleets: [],
    packets: [],
    minefields: [],
    designs: [],
    aiDesigns: [],
    messages: [],
    battles: [],
    sectorScans: [],
    logs: [],
    orders: [],
    combatReports: [],
    turnHistory: [],
    turnEvents: [],
    turnHash: 0n,
    empireCache: { taxTotal: 0, industrialOutput: 0 },
    players: [],
    rules: null,
    aiConfig: null,
    aiDifficulty: "normal",
    gameResult: null,
    scores: [],
    research: {
        field: 0,
        levels: [0, 0, 0, 0, 0, 0],
        progress: 0,
        budget: 15
    },
    rngSeed: 932515789n,
    rng: null,
    nextFleetId: 1,
    nextPacketId: 1,
    race: new Race({
        name: 'The Ashen Arc',
        type: 'Synthetic Nomads',
        grav: '0.3g - 4.2g',
        temp: '-80° - 140°',
        growth: '+17%',
        mining: 'Adaptive'
    }),
    diplomacy: {
        status: {
            2: 'Neutral'
        },
        lastWarning: 0
    },
    selection: null,
    activeScanners: [],
    audio: {
        ctx: null
    },
    isGameOver: false,
    currentTurnLog: null,

    init: async function() {
        const configs = await loadConfig();
        this.rules = configs.rules;
        this.aiConfig = configs.ai;
        this.aiDifficulty = configs.ai.defaultDifficulty || "normal";
        this.setupPlayers();
        this.minerals = this.mineralStock.i + this.mineralStock.b + this.mineralStock.g;
        this.rng = new PCG32(this.rngSeed, 54n);
        this.turnHash = this.hashTurnSeed(this.rngSeed, BigInt(this.turnCount));
        this.designs.push(new ShipDesign({
            name: "Probe v1",
            hull: DB.hulls[0],
            engine: DB.engines[0],
            weapon: DB.weapons[0],
            shield: DB.weapons[0],
            special: DB.specials[0]
        }));
        this.designs.push(new ShipDesign({
            name: "Colony Ark",
            hull: DB.hulls[1],
            engine: DB.engines[0],
            weapon: DB.weapons[0],
            shield: DB.weapons[0],
            special: DB.specials[1]
        }));

        this.generateGalaxy(80);
        this.seedHomeworld();
        this.seedRivals();

        this.logMsg("Welcome, Emperor. The sector is uncharted.", "System");

        if (renderer?.init) {
            renderer.init();
        }
        if (ui?.init) {
            ui.init();
        }
        this.updateVisibility();
    },

    hashMix: function(hash, value) {
        const mask = (1n << 64n) - 1n;
        const mixed = (hash ^ value) * 0x9e3779b97f4a7c15n;
        return mixed & mask;
    },

    hashString: function(text) {
        let hash = 0xcbf29ce484222325n;
        for (let i = 0; i < text.length; i++) {
            hash = this.hashMix(hash, BigInt(text.charCodeAt(i)));
        }
        return hash;
    },

    hashTurnSeed: function(previousHash, turnNumber) {
        let hash = this.hashMix(previousHash, turnNumber);
        hash = this.hashMix(hash, 0x94d049bb133111ebn);
        return hash;
    },

    setupPlayers: function() {
        const aiPlayers = this.aiConfig?.aiPlayers || [2];
        this.players = [
            { id: 1, type: "human", status: "active", eliminatedAtTurn: null },
            ...aiPlayers.map(id => ({ id, type: "ai", status: "active", eliminatedAtTurn: null }))
        ];

        const humanStart = this.rules?.startingResources?.human || { credits: 1000, mineralStock: { i: 2000, b: 1500, g: 1500 } };
        const aiStart = this.rules?.startingResources?.ai || { credits: 800, mineralStock: { i: 1500, b: 1000, g: 1000 } };

        this.economy = {};
        this.players.forEach(player => {
            const template = player.type === "human" ? humanStart : aiStart;
            this.economy[player.id] = {
                credits: template.credits,
                mineralStock: { ...template.mineralStock },
                minerals: template.mineralStock.i + template.mineralStock.b + template.mineralStock.g
            };
        });
        const humanEconomy = this.economy[1];
        if (humanEconomy) {
            this.credits = humanEconomy.credits;
            this.mineralStock = { ...humanEconomy.mineralStock };
            this.minerals = humanEconomy.minerals;
        }
    },

    startTurnLog: function() {
        this.currentTurnLog = {
            turn: this.year,
            events: [],
            rngRolls: [],
            checksum: 0n
        };
    },

    finalizeTurnLog: function() {
        if (!this.currentTurnLog) {
            return;
        }
        let checksum = this.hashMix(0x100000001b3n, BigInt(this.year));
        this.currentTurnLog.events.forEach(event => {
            checksum = this.hashMix(checksum, this.hashString(event));
        });
        this.currentTurnLog.rngRolls.forEach(roll => {
            checksum = this.hashMix(checksum, BigInt(roll));
        });
        this.currentTurnLog.checksum = checksum;
        this.logs.unshift(this.currentTurnLog);
        this.turnHash = checksum;
        this.currentTurnLog = null;
    },

    addEvent: function(text) {
        if (this.currentTurnLog) {
            this.currentTurnLog.events.push(text);
        }
    },

    roll: function(max) {
        const value = this.rng.nextInt(max);
        if (this.currentTurnLog) {
            this.currentTurnLog.rngRolls.push(value);
        }
        return value;
    },

    generateGalaxy: function(count) {
        for (let i = 0; i < count; i++) {
            this.stars.push(new Star({
                id: i,
                x: this.roll(3200),
                y: this.roll(3200),
                name: `S-${120 + i}`,
                owner: null,
                rng: this.rng
            }));
        }
    },

    seedHomeworld: function() {
        const h = this.stars[0];
        h.x = 1600;
        h.y = 1600;
        h.owner = 1;
        h.name = "HOMEWORLD";
        h.pop = 62000;
        h.def.mines = 120;
        h.def.facts = 140;
        h.def.base = { name: "Starbase I", hp: 1000 };

        this.fleets.push(new Fleet({
            id: this.nextFleetId++,
            owner: 1,
            x: h.x,
            y: h.y,
            name: "Scout 1",
            design: this.designs[0]
        }));
        this.fleets.push(new Fleet({
            id: this.nextFleetId++,
            owner: 1,
            x: h.x,
            y: h.y,
            name: "Colony 1",
            design: this.designs[1]
        }));
    },

    seedRivals: function() {
        const aiPlayers = this.players.filter(player => player.type === "ai");
        if (!aiPlayers.length) {
            return;
        }
        const enemyDesign = new ShipDesign({
            name: "Raider",
            hull: DB.hulls[0],
            engine: DB.engines[1],
            weapon: DB.weapons[1],
            shield: DB.weapons[0],
            special: DB.specials[0]
        });
        const enemyColony = new ShipDesign({
            name: "Seeder",
            hull: DB.hulls[1],
            engine: DB.engines[1],
            weapon: DB.weapons[0],
            shield: DB.weapons[0],
            special: DB.specials[1]
        });
        this.aiDesigns = [enemyDesign, enemyColony];

        const availableStars = this.stars.filter(star => !star.owner && star.id !== 0);
        aiPlayers.forEach((player, index) => {
            const rival = availableStars[index] || this.stars[10 + index];
            if (!rival) {
                return;
            }
            rival.owner = player.id;
            rival.name = index === 0 ? "CRIMSON NODE" : `DIRECTORATE-${player.id}`;
            rival.pop = 40000;
            rival.def.mines = 80;
            rival.def.facts = 90;
            rival.def.base = { name: "Ravager Hub", hp: 900 };

            this.fleets.push(new Fleet({
                id: this.nextFleetId++,
                owner: player.id,
                x: rival.x,
                y: rival.y,
                name: `Raider Wing ${player.id}`,
                design: enemyDesign
            }));
        });
    },

    turn: function() {
        if (this.isGameOver) {
            this.logMsg("Victory declared. No further turns possible.", "System", "high");
            return;
        }
        const nextTurn = this.turnCount + 1;
        const seeded = this.hashTurnSeed(this.turnHash, BigInt(nextTurn));
        this.rngSeed = seeded;
        this.rng = new PCG32(seeded, 54n);
        this.startTurnLog();
        this.turnEvents = [];
        this.processAITurns();
        const nextState = TurnEngine.processTurn(this);
        this.applyState(nextState);
        this.resolveEndOfTurn();
        this.updateVisibility();
        if (renderer) {
            renderer.cam.dirty = true;
        }
        if (ui) {
            ui.updateHeader();
            ui.updateSide();
            ui.updateEmpire();
            ui.updateFleets();
            ui.updateResearch();
            ui.updateComms();
        }
        this.playSound(140, 0.08);
        this.finalizeTurnLog();
    },

    applyState: function(nextState) {
        this.turnCount = nextState.turnCount;
        this.year = nextState.year;
        this.credits = nextState.credits;
        this.minerals = nextState.minerals;
        this.mineralStock = nextState.mineralStock;
        this.economy = nextState.economy || this.economy;
        this.stars = nextState.stars;
        this.fleets = nextState.fleets;
        this.packets = nextState.packets;
        this.minefields = nextState.minefields;
        this.messages = nextState.messages;
        this.battles = nextState.battles;
        this.sectorScans = nextState.sectorScans;
        this.logs = nextState.logs;
        this.empireCache = nextState.empireCache;
        this.research = nextState.research;
        this.nextFleetId = nextState.nextFleetId;
        this.nextPacketId = nextState.nextPacketId;
        this.orders = nextState.orders;
        this.combatReports = nextState.combatReports;
        this.turnHistory = nextState.turnHistory;
        this.turnEvents = nextState.turnEvents;
        this.players = nextState.players || this.players;
        const humanEconomy = this.economy?.[1];
        if (humanEconomy) {
            this.credits = humanEconomy.credits;
            this.mineralStock = { ...humanEconomy.mineralStock };
            this.minerals = humanEconomy.minerals;
        }
    },

    validateOrders: function() {
        this.addEvent("Orders validated.");
    },

    processPackets: function() {
        this.packets = this.packets
            .sort((a, b) => a.id - b.id)
            .filter(packet => {
                const speed = 80;
                if (this.stepToward(packet, packet.destX, packet.destY, speed)) {
                const economy = this.economy?.[packet.owner];
                if (economy) {
                    economy.mineralStock.i += Math.floor(packet.payload * 0.4);
                    economy.mineralStock.b += Math.floor(packet.payload * 0.3);
                    economy.mineralStock.g += Math.floor(packet.payload * 0.3);
                    economy.minerals = economy.mineralStock.i + economy.mineralStock.b + economy.mineralStock.g;
                    if (packet.owner === 1) {
                        this.mineralStock = { ...economy.mineralStock };
                        this.minerals = economy.minerals;
                        this.logMsg(`Resource packet delivered to ${this.stars[packet.destId]?.name || 'target'}.`, "Industry");
                    }
                }
                return false;
                }
                return true;
            });
    },

    stepToward: function(entity, destX, destY, speed) {
        const dx = destX - entity.x;
        const dy = destY - entity.y;
        const distance = intSqrt(dx * dx + dy * dy);
        if (distance <= speed) {
            entity.x = destX;
            entity.y = destY;
            return true;
        }
        const scale = Math.floor((speed * 1000) / distance);
        entity.x += Math.floor((dx * scale) / 1000);
        entity.y += Math.floor((dy * scale) / 1000);
        return false;
    },

    processFleets: function() {
        this.fleets
            .slice()
            .sort((a, b) => a.id - b.id)
            .forEach(fleet => {
            if (!fleet.dest) {
                return;
            }
            const speed = fleet.speed;
            const fuelUse = Math.max(1, Math.floor(speed / 60));

            if (fleet.fuel <= 0) {
                fleet.dest = null;
                this.logMsg(`${fleet.name} has exhausted fuel reserves.`, "Command");
                return;
            }

            if (this.stepToward(fleet, fleet.dest.x, fleet.dest.y, speed)) {
                fleet.dest = null;
                fleet.fuel = Math.max(0, fleet.fuel - fuelUse * 2);
                this.handleArrival(fleet);
            } else {
                fleet.fuel = Math.max(0, fleet.fuel - fuelUse);
            }
        });
    },

    processBombing: function() {
        this.addEvent("Bombing resolution complete.");
    },

    processPopulationGrowth: function() {
        const growthPermille = 1020 + (this.research.levels[5] * 5);
        this.stars
            .filter(s => s.owner)
            .sort((a, b) => a.id - b.id)
            .forEach(star => {
                const grown = Math.floor((star.pop * growthPermille) / 1000);
                star.pop = Math.min(1500000, grown);
            });
        this.addEvent("Population growth resolved.");
    },

    processProduction: function() {
        let taxTotal = 0;
        let industrialOutput = 0;
        this.stars
            .filter(s => s.owner)
            .sort((a, b) => a.id - b.id)
            .forEach(star => {
                const income = Math.floor(star.pop / 900);
                const iGain = Math.floor((star.def.mines * star.mins.i) / 120);
                const bGain = Math.floor((star.def.mines * star.mins.b) / 120);
                const gGain = Math.floor((star.def.mines * star.mins.g) / 120);

                const economy = this.economy?.[star.owner];
                if (!economy) {
                    return;
                }
                if (star.owner === 1) {
                    taxTotal += income;
                    industrialOutput += star.def.facts;
                }
                economy.credits += income;
                economy.mineralStock.i += iGain;
                economy.mineralStock.b += bGain;
                economy.mineralStock.g += gGain;

                if (star.queue) {
                    star.queue.done += star.def.facts;
                    if (star.queue.done >= star.queue.cost) {
                        if (star.queue.type === 'ship') {
                            this.buildComplete(star, star.queue.bp, star.queue.owner);
                        } else if (star.queue.type === 'structure') {
                            this.completeStructure(star, star.queue);
                        }
                    }
                }
            });

        Object.values(this.economy || {}).forEach(entry => {
            entry.minerals = entry.mineralStock.i + entry.mineralStock.b + entry.mineralStock.g;
        });
        const humanEconomy = this.economy?.[1];
        if (humanEconomy) {
            this.credits = humanEconomy.credits;
            this.mineralStock = { ...humanEconomy.mineralStock };
            this.minerals = humanEconomy.minerals;
        }
        this.empireCache = { taxTotal, industrialOutput };
        this.addEvent("Production resolved.");
    },

    processResearch: function() {
        const budget = Math.floor((this.credits * this.research.budget) / 1000);
        this.research.progress += budget;
        const cost = this.researchCost(this.research.field);

        if (this.research.progress >= cost) {
            this.research.levels[this.research.field]++;
            this.research.progress = 0;
            this.logMsg(`${DB.techs[this.research.field].name} Tech Advanced to Level ${this.research.levels[this.research.field]}`, "Research");
        }
        this.addEvent("Research resolved.");
    },

    processIntelligence: function() {
        this.addEvent("Intelligence updates resolved.");
    },

    processAITurns: function() {
        const aiPlayers = this.players.filter(player => player.type === "ai" && player.status === "active");
        if (!aiPlayers.length) {
            return;
        }
        aiPlayers.forEach(player => {
            const difficulty = this.aiConfig?.difficulty?.[this.aiDifficulty] || this.aiConfig?.difficulty?.normal;
            const maxTimeMs = this.aiConfig?.maxTurnTimeMs ?? 100;
            this.turnEvents.push({ type: "AI_TURN_STARTED", playerId: player.id, turn: this.turnCount + 1 });
            const result = AIController.runTurn(this, player.id, difficulty, { roll: (max) => this.roll(max), maxTimeMs });
            result.orders.forEach(order => {
                this.orders.push(order);
                this.turnEvents.push({ type: "AI_ACTION_TAKEN", playerId: player.id, orderType: order.type, turn: this.turnCount + 1 });
            });
            this.turnEvents.push({ type: "AI_TURN_ENDED", playerId: player.id, turn: this.turnCount + 1, intent: result.intent });
        });

        const playerNear = this.stars
            .filter(star => star.owner && star.owner !== 1)
            .some(star => this.fleets.some(f => f.owner === 1 && dist(f, star) < 200));
        if (playerNear && this.turnCount - this.diplomacy.lastWarning > 4) {
            this.diplomacy.lastWarning = this.turnCount;
            aiPlayers.forEach(player => {
                this.diplomacy.status[player.id] = "Tense";
            });
            this.logMsg("Your fleets are encroaching on Directorate territory. Withdraw or face consequences.", "Crimson Directorate", "high", "Ashen Arc");
        }
    },

    handleArrival: function(fleet) {
        const star = this.stars.find(st => dist(st, fleet) < 12);
        if (!star) {
            return;
        }

        if (star.owner && star.owner !== fleet.owner) {
            this.generateCombat(fleet, star);
            return;
        }

        if (!star.owner && fleet.design.flags.includes('colonize')) {
            star.owner = fleet.owner;
            star.pop = 2500;
            star.def.mines = 20;
            star.def.facts = 20;
            this.logMsg(`${star.name} Colonized!`, "Expansion");
            this.fleets = this.fleets.filter(x => x.id !== fleet.id);
            return;
        }

        this.logMsg(`${fleet.name} arrived at ${star.name}`, "Fleet");
    },

    buildComplete: function(star, blueprint, ownerId = 1) {
        this.spawnShip(star, blueprint, ownerId);
        if (ownerId === 1) {
            this.logMsg(`Production of ${blueprint.name} complete at ${star.name}`, "Industry");
        }
        star.queue = null;
    },

    completeStructure: function(star, queue) {
        if (queue.kind === 'mine') {
            star.def.mines += queue.count;
        } else if (queue.kind === 'factory') {
            star.def.facts += queue.count;
        } else if (queue.kind === 'base') {
            star.def.base = { name: "Starbase I", hp: 1000 };
        }
        if (queue.owner === 1) {
            this.logMsg(`${DB.structures[queue.kind].name} construction complete at ${star.name}.`, "Industry");
        }
        star.queue = null;
    },

    saveDesign: function() {
        const hull = DB.hulls.find(h => h.id === document.getElementById('des-hull').value);
        const engine = DB.engines.find(e => e.id === document.getElementById('des-eng').value);
        const weapon = DB.weapons.find(w => w.id === document.getElementById('des-wep').value);
        const shield = DB.weapons.find(w => w.id === document.getElementById('des-shi').value);
        const special = DB.specials.find(s => s.id === document.getElementById('des-spec').value);
        const name = document.getElementById('des-name').value || `Design-${this.roll(99)}`;

        const design = new ShipDesign({ name, hull, engine, weapon, shield, special });
        this.designs.push(design);
        this.logMsg(`New Ship Design "${design.name}" saved.`, "Engineering");
    },

    queueBuild: function(star, designIndex, ownerId = 1) {
        const blueprint = ownerId === 1 ? this.designs[designIndex] : this.aiDesigns[designIndex];
        if (!blueprint) {
            return;
        }
        const economy = this.economy?.[ownerId];
        if (!economy || economy.credits < blueprint.cost) {
            if (ownerId === 1) {
                this.logMsg(`Insufficient credits to build ${blueprint.name}.`, "Industry");
            }
            return;
        }
        economy.credits -= blueprint.cost;
        if (ownerId === 1) {
            this.credits = economy.credits;
        }
        star.queue = { type: 'ship', bp: blueprint, cost: blueprint.cost, done: 0, owner: ownerId };
        if (ownerId === 1) {
            this.logMsg(`Construction of ${blueprint.name} started at ${star.name}.`, "Industry");
        }
    },

    queueStructure: function(star, kind, count = 1, ownerId = 1) {
        const structure = DB.structures[kind];
        if (!structure) {
            return;
        }
        if (kind === 'base' && star.def.base) {
            if (ownerId === 1) {
                this.logMsg(`${star.name} already has a starbase.`, "Industry");
            }
            return;
        }
        const cost = structure.cost * count;
        const economy = this.economy?.[ownerId];
        if (!economy || economy.credits < cost) {
            if (ownerId === 1) {
                this.logMsg(`Insufficient credits to build ${structure.name}.`, "Industry");
            }
            return;
        }
        economy.credits -= cost;
        if (ownerId === 1) {
            this.credits = economy.credits;
        }
        star.queue = { type: 'structure', kind, count, cost, done: 0, owner: ownerId };
        if (ownerId === 1) {
            this.logMsg(`Construction of ${structure.name} queued at ${star.name}.`, "Industry");
        }
    },

    spawnShip: function(star, blueprint, ownerId = 1) {
        this.fleets.push(new Fleet({
            id: this.nextFleetId++,
            owner: ownerId,
            x: star.x,
            y: star.y,
            name: `${blueprint.name} ${this.roll(99)}`,
            design: blueprint
        }));
    },

    logMsg: function(text, sender, priority = 'normal', recipient = 'All') {
        this.messages.unshift(new Message({ turn: this.year, sender, recipient, text, priority }));
        this.addEvent(`${sender}: ${text}`);
    },

    sendMessage: function(recipientId, text) {
        const recipient = recipientId === 2 ? "Crimson Directorate" : "Unknown";
        this.logMsg(text, "Ashen Arc", "normal", recipient);
        if (recipientId === 2) {
            this.respondDiplomacy(text);
        }
    },

    respondDiplomacy: function(playerText) {
        const lower = playerText.toLowerCase();
        if (lower.includes("peace") || lower.includes("truce")) {
            this.diplomacy.status[2] = "Cautious";
            this.logMsg("We will consider a ceasefire. Keep your fleets at distance.", "Crimson Directorate", "normal", "Ashen Arc");
        } else if (lower.includes("war") || lower.includes("attack")) {
            this.diplomacy.status[2] = "Hostile";
            this.logMsg("Your threats are noted. We will respond in kind.", "Crimson Directorate", "high", "Ashen Arc");
        } else {
            this.logMsg("Message received. The Directorate remains vigilant.", "Crimson Directorate", "normal", "Ashen Arc");
        }
    },

    resolveEndOfTurn: function() {
        resolveDefeats(this);
        this.scores = calculateScores(this, this.rules);
        const outcome = evaluateVictory(this, this.rules);
        if (!outcome.isGameOver) {
            return;
        }
        this.isGameOver = true;
        this.gameResult = outcome.gameResult;
        this.turnEvents.push({ type: "GAME_OVER", turn: this.turnCount });
        this.turnEvents.push({ type: "VICTORY_DECLARED", winnerId: outcome.gameResult.winnerId, reason: outcome.reason });
        if (outcome.gameResult.winnerId === 1) {
            this.logMsg("All systems unified under your banner. Victory achieved.", "System", "high");
        } else {
            this.logMsg("The Crimson Directorate has seized the galaxy. Defeat.", "System", "high");
        }
    },

    generateCombat: function(attacker, defenderStar) {
        const attackPower = attacker.design.bv + this.roll(30);
        const defensePower = (defenderStar.def.base ? 120 : 40) + defenderStar.def.mines;
        const rounds = [];
        let attackerHP = attacker.hp;
        let defenderHP = defensePower * 2;

        for (let round = 1; round <= 3; round++) {
            const atk = attacker.design.weapon.dmg + this.roll(10);
            const def = Math.floor(defensePower / 4) + this.roll(8);
            defenderHP -= atk;
            attackerHP -= def;
            rounds.push(`Round ${round}: ${attacker.name} hits for ${atk}. Defenses reply for ${def}.`);
        }

        const result = attackerHP > defenderHP ? 'attacker' : 'defender';
        const battleLog = `Combat at ${defenderStar.name}: ${attacker.name} engaged defenses. Outcome: ${result.toUpperCase()}.`;
        this.addEvent(`Combat roll ${attackPower} at ${defenderStar.name}.`);
        this.battles.unshift({
            id: `${this.year}-${defenderStar.id}-${attacker.id}`,
            turn: this.year,
            location: defenderStar.name,
            attacker: attacker.name,
            defender: defenderStar.def.base ? defenderStar.def.base.name : "Orbital Defenses",
            result,
            details: rounds.join('\n') + `\nFinal: ${result.toUpperCase()}`
        });
        this.logMsg(battleLog, "Combat", "high");
        this.playSound(240, 0.2);

        if (result === 'attacker') {
            defenderStar.owner = attacker.owner;
            defenderStar.pop = Math.floor(defenderStar.pop * 0.4);
            defenderStar.def.base = null;
        } else {
            this.fleets = this.fleets.filter(f => f.id !== attacker.id);
        }
    },

    scanSector: function(star) {
        const range = 200 + this.research.levels[4] * 20;
        this.sectorScans.push({ x: star.x, y: star.y, r: range, owner: 1, expires: this.turnCount + 1 });
        this.updateVisibility();
        renderer.cam.dirty = true;
    },

    placeMinefield: function(fleet, range) {
        if (!fleet.design.flags.includes('minelayer')) {
            this.logMsg("This fleet lacks a mine-laying module.", "Command");
            return;
        }
        const effectiveRange = range || (160 + this.research.levels[4] * 15);
        this.minefields.push(new Minefield({ x: fleet.x, y: fleet.y, radius: effectiveRange, owner: fleet.owner }));
        this.logMsg(`${fleet.name} deployed a minefield.`, "Command");
    },

    withdrawMinerals: function(amount, ownerId = 1) {
        const economy = this.economy?.[ownerId];
        if (!economy) {
            return false;
        }
        const stock = economy.mineralStock;
        let remaining = amount;
        const take = (key) => {
            const used = Math.min(stock[key], remaining);
            stock[key] -= used;
            remaining -= used;
        };
        take('i');
        take('b');
        take('g');
        economy.minerals = stock.i + stock.b + stock.g;
        if (ownerId === 1) {
            this.mineralStock = { ...stock };
            this.minerals = economy.minerals;
        }
        return remaining <= 0;
    },

    launchPacket: function(originId) {
        const origin = this.stars[originId];
        const targetId = parseInt(document.getElementById('driver-target').value, 10);
        const amount = parseInt(document.getElementById('driver-amount').value, 10);
        if (!origin || origin.owner !== 1) {
            return;
        }
        if (Number.isNaN(targetId) || !this.stars[targetId]) {
            this.logMsg("Select a valid target for the packet.", "Industry");
            return;
        }
        if (!amount || amount <= 0) {
            this.logMsg("Specify a transfer amount.", "Industry");
            return;
        }
        if (!this.withdrawMinerals(amount, 1)) {
            this.logMsg("Insufficient minerals for packet launch.", "Industry");
            return;
        }
        const target = this.stars[targetId];
        this.packets.push(new ResourcePacket({
            id: this.nextPacketId++,
            x: origin.x,
            y: origin.y,
            destX: target.x,
            destY: target.y,
            destId: targetId,
            payload: amount,
            owner: 1
        }));
        this.logMsg(`Mass driver packet launched to ${target.name}.`, "Industry");
    },

    updateVisibility: function() {
        this.activeScanners = [];
        this.sectorScans = this.sectorScans.filter(scan => scan.expires >= this.turnCount);
        this.stars
            .slice()
            .sort((a, b) => a.id - b.id)
            .forEach(star => {
            if (star.owner === 1) {
                this.activeScanners.push({ x: star.x, y: star.y, r: 260, owner: 1 });
            }
        });
        this.fleets
            .slice()
            .sort((a, b) => a.id - b.id)
            .forEach(fleet => {
            if (fleet.owner === 1) {
                this.activeScanners.push({ x: fleet.x, y: fleet.y, r: fleet.scan, owner: 1 });
            }
        });
        this.sectorScans.forEach(scan => this.activeScanners.push(scan));

        this.stars
            .slice()
            .sort((a, b) => a.id - b.id)
            .forEach(star => {
            const visible = this.activeScanners.some(scan => dist(scan, star) <= scan.r);
            if (visible) {
                star.visible = true;
                star.known = true;
                star.updateSnapshot();
            } else if (star.known) {
                star.visible = false;
            }
        });
    },

    playSound: function(freq, duration) {
        try {
            if (!this.audio.ctx) {
                this.audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = this.audio.ctx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.value = 0.06;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) {
            // Audio not supported or blocked.
        }
    },

    researchCost: function(field) {
        return DB.techs[field].baseCost + this.research.levels[field] * 200;
    }
};
