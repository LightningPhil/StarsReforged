import { DB } from "../data/db.js";
import { Fleet, Message, Minefield, Race, ResourcePacket, ShipDesign, Star } from "../models/entities.js";
import { dist, r } from "./utils.js";

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
    aiCredits: 800,
    aiMinerals: 3500,
    aiMineralStock: { i: 1500, b: 1000, g: 1000 },
    stars: [],
    fleets: [],
    packets: [],
    minefields: [],
    designs: [],
    aiDesigns: [],
    messages: [],
    battles: [],
    sectorScans: [],
    research: {
        field: 0,
        levels: [0, 0, 0, 0, 0, 0],
        progress: 0,
        budget: 15
    },
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

    init: function() {
        this.minerals = this.mineralStock.i + this.mineralStock.b + this.mineralStock.g;
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
        this.seedRival();

        this.logMsg("Welcome, Emperor. The sector is uncharted.", "System");

        renderer.init();
        ui.init();
        this.updateVisibility();
    },

    generateGalaxy: function(count) {
        for (let i = 0; i < count; i++) {
            this.stars.push(new Star({
                id: i,
                x: Math.random() * 3200,
                y: Math.random() * 3200,
                name: `S-${120 + i}`,
                owner: null
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
            id: 1,
            owner: 1,
            x: h.x,
            y: h.y,
            name: "Scout 1",
            design: this.designs[0]
        }));
        this.fleets.push(new Fleet({
            id: 2,
            owner: 1,
            x: h.x,
            y: h.y,
            name: "Colony 1",
            design: this.designs[1]
        }));
    },

    seedRival: function() {
        const rival = this.stars[10];
        rival.owner = 2;
        rival.name = "CRIMSON NODE";
        rival.pop = 40000;
        rival.def.mines = 80;
        rival.def.facts = 90;
        rival.def.base = { name: "Ravager Hub", hp: 900 };

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

        this.fleets.push(new Fleet({
            id: 3,
            owner: 2,
            x: rival.x,
            y: rival.y,
            name: "Raider Wing",
            design: enemyDesign
        }));
    },

    turn: function() {
        if (this.isGameOver) {
            this.logMsg("Victory declared. No further turns possible.", "System", "high");
            return;
        }
        this.year++;
        this.turnCount++;

        this.processPackets();
        this.processFleets();
        this.processPlanets();
        this.processResearch();
        this.processAI();

        this.updateVisibility();
        renderer.cam.dirty = true;
        ui.updateHeader();
        ui.updateSide();
        ui.updateEmpire();
        ui.updateFleets();
        this.playSound(140, 0.08);

        this.checkVictory();
    },

    processPackets: function() {
        this.packets = this.packets.filter(packet => {
            const dx = packet.destX - packet.x;
            const dy = packet.destY - packet.y;
            const dist = Math.hypot(dx, dy);
            const speed = 80;
            if (dist <= speed) {
                packet.x = packet.destX;
                packet.y = packet.destY;
                if (packet.owner === 1) {
                    this.mineralStock.i += Math.floor(packet.payload * 0.4);
                    this.mineralStock.b += Math.floor(packet.payload * 0.3);
                    this.mineralStock.g += Math.floor(packet.payload * 0.3);
                    this.minerals = this.mineralStock.i + this.mineralStock.b + this.mineralStock.g;
                    ui.updateHeader();
                    this.logMsg(`Resource packet delivered to ${this.stars[packet.destId]?.name || 'target'}.`, "Industry");
                } else if (packet.owner === 2) {
                    this.aiMineralStock.i += Math.floor(packet.payload * 0.4);
                    this.aiMineralStock.b += Math.floor(packet.payload * 0.3);
                    this.aiMineralStock.g += Math.floor(packet.payload * 0.3);
                    this.aiMinerals = this.aiMineralStock.i + this.aiMineralStock.b + this.aiMineralStock.g;
                }
                return false;
            } else {
                const angle = Math.atan2(dy, dx);
                packet.x += Math.cos(angle) * speed;
                packet.y += Math.sin(angle) * speed;
                return true;
            }
        });
    },

    processFleets: function() {
        this.fleets.forEach(fleet => {
            if (!fleet.dest) {
                return;
            }
            const dx = fleet.dest.x - fleet.x;
            const dy = fleet.dest.y - fleet.y;
            const dist = Math.hypot(dx, dy);
            const speed = fleet.speed;
            const fuelUse = Math.max(1, speed / 60);

            if (fleet.fuel <= 0) {
                fleet.dest = null;
                this.logMsg(`${fleet.name} has exhausted fuel reserves.`, "Command");
                return;
            }

            if (dist <= speed) {
                fleet.x = fleet.dest.x;
                fleet.y = fleet.dest.y;
                fleet.dest = null;
                fleet.fuel = Math.max(0, fleet.fuel - fuelUse * 2);
                this.handleArrival(fleet);
            } else {
                const angle = Math.atan2(dy, dx);
                fleet.x += Math.cos(angle) * speed;
                fleet.y += Math.sin(angle) * speed;
                fleet.fuel = Math.max(0, fleet.fuel - fuelUse);
            }
        });
    },

    processPlanets: function() {
        let taxTotal = 0;
        let industrialOutput = 0;
        this.stars.filter(s => s.owner).forEach(star => {
            const growthRate = 1 + 0.02 + (this.research.levels[5] * 0.005);
            star.pop = Math.min(1500000, Math.floor(star.pop * growthRate));
            const income = Math.floor(star.pop / 900);
            const iGain = Math.floor((star.def.mines * star.mins.i) / 120);
            const bGain = Math.floor((star.def.mines * star.mins.b) / 120);
            const gGain = Math.floor((star.def.mines * star.mins.g) / 120);

            if (star.owner === 1) {
                taxTotal += income;
                industrialOutput += star.def.facts;
                this.mineralStock.i += iGain;
                this.mineralStock.b += bGain;
                this.mineralStock.g += gGain;
            } else if (star.owner === 2) {
                this.aiCredits += income;
                this.aiMineralStock.i += iGain;
                this.aiMineralStock.b += bGain;
                this.aiMineralStock.g += gGain;
            }

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

        this.minerals = this.mineralStock.i + this.mineralStock.b + this.mineralStock.g;
        this.aiMinerals = this.aiMineralStock.i + this.aiMineralStock.b + this.aiMineralStock.g;

        this.credits += taxTotal;
        ui.empireCache = { taxTotal, industrialOutput };
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
        ui.updateResearch();
    },

    processAI: function() {
        const aiStars = this.stars.filter(s => s.owner === 2);
        if (!aiStars.length) {
            return;
        }

        const colonyFleet = this.fleets.find(f => f.owner === 2 && f.design.flags.includes('colonize'));
        const colonyDesign = this.aiDesigns[1];
        if (!colonyFleet && colonyDesign) {
            const buildStar = aiStars.find(s => !s.queue);
            if (buildStar) {
                this.queueBuild(buildStar, 1, 2);
            }
        }

        const raiderDesign = this.aiDesigns[0];
        aiStars.filter(s => !s.queue).forEach(star => {
            if (this.aiCredits > (raiderDesign?.cost || 0) && Math.random() < 0.25) {
                this.queueBuild(star, 0, 2);
            }
        });

        this.fleets.filter(f => f.owner === 2 && !f.dest).forEach(f => {
            const unowned = this.stars.filter(s => !s.owner);
            const enemy = this.stars.filter(s => s.owner === 1);
            const pool = unowned.length ? unowned : enemy;
            if (!pool.length) {
                return;
            }
            const target = pool.reduce((best, star) => {
                const d = dist(f, star);
                if (!best || d < best.dist) {
                    return { star, dist: d };
                }
                return best;
            }, null);
            f.dest = { x: target.star.x, y: target.star.y };
        });

        const playerNear = aiStars.some(star => this.fleets.some(f => f.owner === 1 && dist(f, star) < 200));
        if (playerNear && this.turnCount - this.diplomacy.lastWarning > 4) {
            this.diplomacy.lastWarning = this.turnCount;
            this.diplomacy.status[2] = "Tense";
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
        const name = document.getElementById('des-name').value || `Design-${r(99)}`;

        const design = new ShipDesign({ name, hull, engine, weapon, shield, special });
        this.designs.push(design);
        ui.updateDesignList();
        ui.updateSide();
        this.logMsg(`New Ship Design "${design.name}" saved.`, "Engineering");
    },

    queueBuild: function(star, designIndex, ownerId = 1) {
        const blueprint = ownerId === 1 ? this.designs[designIndex] : this.aiDesigns[designIndex];
        if (!blueprint) {
            return;
        }
        const bank = ownerId === 1 ? this.credits : this.aiCredits;
        if (bank < blueprint.cost) {
            if (ownerId === 1) {
                this.logMsg(`Insufficient credits to build ${blueprint.name}.`, "Industry");
            }
            return;
        }
        if (ownerId === 1) {
            this.credits -= blueprint.cost;
        } else {
            this.aiCredits -= blueprint.cost;
        }
        star.queue = { type: 'ship', bp: blueprint, cost: blueprint.cost, done: 0, owner: ownerId };
        if (ownerId === 1) {
            ui.updateHeader();
            ui.updateSide();
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
        const bank = ownerId === 1 ? this.credits : this.aiCredits;
        if (bank < cost) {
            if (ownerId === 1) {
                this.logMsg(`Insufficient credits to build ${structure.name}.`, "Industry");
            }
            return;
        }
        if (ownerId === 1) {
            this.credits -= cost;
        } else {
            this.aiCredits -= cost;
        }
        star.queue = { type: 'structure', kind, count, cost, done: 0, owner: ownerId };
        if (ownerId === 1) {
            ui.updateHeader();
            ui.updateSide();
            this.logMsg(`Construction of ${structure.name} queued at ${star.name}.`, "Industry");
        }
    },

    spawnShip: function(star, blueprint, ownerId = 1) {
        this.fleets.push(new Fleet({
            id: Date.now(),
            owner: ownerId,
            x: star.x,
            y: star.y,
            name: `${blueprint.name} ${r(99)}`,
            design: blueprint
        }));
    },

    logMsg: function(text, sender, priority = 'normal', recipient = 'All') {
        this.messages.unshift(new Message({ turn: this.year, sender, recipient, text, priority }));
        ui.updateComms();
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
        ui.updateEmpire();
    },

    checkVictory: function() {
        const owners = new Set(this.stars.filter(s => s.owner).map(s => s.owner));
        if (owners.size === 1 && owners.has(1)) {
            this.isGameOver = true;
            this.logMsg("All systems unified under your banner. Victory achieved.", "System", "high");
            return;
        }
        if (owners.size === 1 && owners.has(2)) {
            this.isGameOver = true;
            this.logMsg("The Crimson Directorate has seized the galaxy. Defeat.", "System", "high");
        }
    },

    generateCombat: function(attacker, defenderStar) {
        const attackPower = attacker.design.bv + r(30);
        const defensePower = (defenderStar.def.base ? 120 : 40) + defenderStar.def.mines;
        const rounds = [];
        let attackerHP = attacker.hp;
        let defenderHP = defensePower * 2;

        for (let round = 1; round <= 3; round++) {
            const atk = attacker.design.weapon.dmg + r(10);
            const def = Math.floor(defensePower / 4) + r(8);
            defenderHP -= atk;
            attackerHP -= def;
            rounds.push(`Round ${round}: ${attacker.name} hits for ${atk}. Defenses reply for ${def}.`);
        }

        const result = attackerHP > defenderHP ? 'attacker' : 'defender';
        const battleLog = `Combat at ${defenderStar.name}: ${attacker.name} engaged defenses. Outcome: ${result.toUpperCase()}.`;
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
        const stock = ownerId === 1 ? this.mineralStock : this.aiMineralStock;
        let remaining = amount;
        const take = (key) => {
            const used = Math.min(stock[key], remaining);
            stock[key] -= used;
            remaining -= used;
        };
        take('i');
        take('b');
        take('g');
        if (ownerId === 1) {
            this.minerals = stock.i + stock.b + stock.g;
        } else {
            this.aiMinerals = stock.i + stock.b + stock.g;
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
            x: origin.x,
            y: origin.y,
            destX: target.x,
            destY: target.y,
            destId: targetId,
            payload: amount,
            owner: 1
        }));
        ui.updateHeader();
        this.logMsg(`Mass driver packet launched to ${target.name}.`, "Industry");
    },

    updateVisibility: function() {
        this.activeScanners = [];
        this.sectorScans = this.sectorScans.filter(scan => scan.expires >= this.turnCount);
        this.stars.forEach(star => {
            if (star.owner === 1) {
                this.activeScanners.push({ x: star.x, y: star.y, r: 260, owner: 1 });
            }
        });
        this.fleets.forEach(fleet => {
            if (fleet.owner === 1) {
                this.activeScanners.push({ x: fleet.x, y: fleet.y, r: fleet.scan, owner: 1 });
            }
        });
        this.sectorScans.forEach(scan => this.activeScanners.push(scan));

        this.stars.forEach(star => {
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
