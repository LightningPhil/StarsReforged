import { DB } from "../data/db.js";
import { Game } from "../core/game.js";
import { dist } from "../core/utils.js";
import { getComponentById, getComponentsBySlot } from "../models/technology.js";
import { validateDesign } from "../core/shipDesign.js";
import { Order, ORDER_TYPES, WAYPOINT_TASK_PAYLOADS, WAYPOINT_TASKS } from "../models/orders.js";

let renderer = null;

export const bindRenderer = (rendererRef) => {
    renderer = rendererRef;
};

export const UI = {
    audio: {
        ctx: null
    },
    aiWorker: null,
    aiWorkerRequests: new Map(),
    aiWorkerRequestId: 0,
    turnPending: false,
    init: function() {
        this.renderTech();
        this.setupDesignWorkshop();
        this.updateHeader();
        this.updateComms();
        this.updateDesignList();
        this.updateEmpire();
        this.updateFleets();
        this.updateResearch();
        this.setupAIWorker();

        document.getElementById('rd-slider').addEventListener('input', e => {
            const value = parseInt(e.target.value, 10);
            const share = value / 100;
            if (Game.researchFocus) {
                Game.setResearchAllocationForField(Game.researchFocus, share, 1);
            }
            document.getElementById('rd-budget').innerText = value;
        });

        document.getElementById('design-hull')?.addEventListener('change', () => {
            this.renderDesignSlots();
            this.updateDesignStats();
        });
        document.getElementById('design-name')?.addEventListener('input', () => this.updateDesignStats());

        document.getElementById('msg-send').addEventListener('click', () => {
            const recipientId = parseInt(document.getElementById('msg-recipient').value, 10);
            const text = document.getElementById('msg-text').value.trim();
            if (!text) {
                return;
            }
            Game.sendMessage(recipientId, text);
            document.getElementById('msg-text').value = '';
            this.updateComms();
            this.updateEmpire();
        });
    },

    setupAIWorker: function() {
        if (typeof Worker === "undefined") {
            return;
        }
        try {
            this.aiWorker = new Worker(new URL("../ai/aiWorker.js", import.meta.url), { type: "module" });
            this.aiWorker.addEventListener("message", event => {
                const { type, payload } = event.data || {};
                if (type !== "AI_TURN_RESULTS") {
                    return;
                }
                const requestId = payload?.requestId;
                const resolver = this.aiWorkerRequests.get(requestId);
                if (resolver) {
                    this.aiWorkerRequests.delete(requestId);
                    resolver(payload);
                }
            });
        } catch (error) {
            this.aiWorker = null;
        }
    },

    submitTurn: async function() {
        if (this.turnPending) {
            return;
        }
        const aiPlayers = Game.players.filter(player => player.type === "ai" && player.status === "active");
        if (!aiPlayers.length || !this.aiWorker) {
            Game.turn();
            this.refreshAfterTurn();
            return;
        }
        this.turnPending = true;
        const difficulty = Game.aiConfig?.difficulty?.[Game.aiDifficulty] || Game.aiConfig?.difficulty?.normal;
        const maxTimeMs = Game.aiConfig?.maxTurnTimeMs ?? 100;
        const seed = Game.hashTurnSeed(Game.turnHash, BigInt(Game.turnCount + 1));
        const tasks = aiPlayers.map(player => ({
            playerId: player.id,
            difficulty,
            maxTimeMs,
            state: Game.buildAIVisibleState(player.id)
        }));
        const requestId = ++this.aiWorkerRequestId;
        const response = new Promise(resolve => {
            this.aiWorkerRequests.set(requestId, resolve);
        });
        this.aiWorker.postMessage({
            type: "RUN_AI_TURNS",
            payload: { requestId, seed, tasks }
        });
        try {
            const payload = await response;
            if (payload?.error) {
                Game.turn();
                this.refreshAfterTurn();
            } else {
                Game.turn({ skipAITurns: true, aiResults: payload.results, aiRolls: payload.rollCalls });
                this.refreshAfterTurn();
            }
        } finally {
            this.turnPending = false;
        }
    },

    refreshAfterTurn: function() {
        this.updateHeader();
        this.updateSide();
        this.updateEmpire();
        this.updateFleets();
        this.updateResearch();
        this.updateComms();
    },

    saveDesign: function() {
        const hullId = document.getElementById('design-hull')?.value;
        const nameInput = document.getElementById('design-name')?.value;
        const randomSuffix = Game.roll ? Game.roll(99) : Math.floor(Math.random() * 99);
        const name = nameInput || `Design-${randomSuffix}`;
        const selects = Array.from(document.querySelectorAll('#design-slots select'));
        const componentIds = selects.map(select => select.value);
        const result = Game.saveDesign({ name, hullId, componentIds });
        if (!result.success) {
            const errorList = document.getElementById('design-errors');
            if (errorList) {
                errorList.innerHTML = '';
                errorList.classList.add('error');
                result.errors.forEach(err => {
                    const row = document.createElement('div');
                    row.textContent = err;
                    errorList.appendChild(row);
                });
            }
            return;
        }
        const list = document.getElementById('design-list');
        if (list) {
            list.classList.add('design-locked');
            setTimeout(() => list.classList.remove('design-locked'), 600);
        }
        this.updateDesignList();
        this.updateSide();
        this.updateComms();
    },

    queueBuild: function(star, index) {
        Game.queueBuild(star, index);
        this.updateHeader();
        this.updateSide();
        this.updateComms();
    },

    queueStructure: function(star, kind, count) {
        Game.queueStructure(star, kind, count);
        this.updateHeader();
        this.updateSide();
        this.updateComms();
    },

    scanSector: function(star) {
        Game.scanSector(star);
        this.updateSide();
    },

    launchPacket: function(starId) {
        const targetId = parseInt(document.getElementById('driver-target').value, 10);
        const amount = parseInt(document.getElementById('driver-amount').value, 10);
        if (Number.isNaN(targetId)) {
            Game.logMsg("Select a valid target for the packet.", "Industry");
            this.updateComms();
            return;
        }
        if (!amount || amount <= 0) {
            Game.logMsg("Specify a transfer amount.", "Industry");
            this.updateComms();
            return;
        }
        Game.launchPacket(starId, targetId, amount, 1);
        this.updateHeader();
        this.updateSide();
        this.updateComms();
    },

    placeMinefield: function(fleet, mineUnits) {
        Game.placeMinefield(fleet, mineUnits);
        this.updateSide();
        this.updateComms();
    },

    queueWaypointTask: function(fleet, waypoint) {
        if (!fleet || !waypoint) {
            return;
        }
        Game.queueOrder(new Order(ORDER_TYPES.SET_WAYPOINTS, fleet.owner, {
            fleetId: fleet.id,
            waypoints: [waypoint]
        }));
        if (fleet.owner === 1) {
            Game.logMsg(`${fleet.name} waypoint queued: ${waypoint.task || "Transit"}.`, "Command");
        }
        this.updateSide();
        this.updateComms();
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

    findStarAtPosition: function(x, y, threshold = 12) {
        let closest = null;
        let closestDist = Infinity;
        Game.stars
            .filter(star => star.visible || star.known || Boolean(Game.planetKnowledge?.[1]?.[star.id]))
            .forEach(star => {
                const distance = dist({ x, y }, star);
                if (distance <= threshold && distance < closestDist) {
                    closest = star;
                    closestDist = distance;
                }
            });
        return closest;
    },

    getSelectedFleet: function() {
        if (!Game.selection || Game.selection.type !== 'fleet') {
            return null;
        }
        return Game.fleets[Game.selection.id] || null;
    },

    queueStargateJump: function(fleetId, sourcePlanetId, destinationPlanetId) {
        const reject = (reason) => {
            Game.logMsg(`ORDER REJECTED: ${reason}`, "System", "high");
            this.updateComms();
        };
        const fleet = Game.fleets.find(item => item.id === fleetId);
        if (!fleet || fleet.owner !== 1) {
            reject("Fleet not under your command.");
            return;
        }
        const source = Game.stars.find(item => item.id === sourcePlanetId);
        const destination = Game.stars.find(item => item.id === destinationPlanetId);
        if (!source || !destination) {
            reject("Stargate endpoint unavailable.");
            return;
        }
        if (Math.hypot(fleet.x - source.x, fleet.y - source.y) > 12) {
            reject("Fleet not positioned at source stargate.");
            return;
        }
        const sourceIntel = Game.planetKnowledge?.[1]?.[source.id];
        const sourceInfo = source.visible ? source : (source.snapshot ?? sourceIntel?.snapshot);
        const destinationIntel = Game.planetKnowledge?.[1]?.[destination.id];
        const destinationInfo = destination.visible ? destination : (destination.snapshot ?? destinationIntel?.snapshot);
        if (!sourceInfo?.hasStargate) {
            reject("Source stargate offline.");
            return;
        }
        if (!destinationInfo?.hasStargate) {
            reject("Destination stargate offline.");
            return;
        }
        if (!destination.visible && !destination.known && !destinationIntel) {
            reject("Destination not on record.");
            return;
        }
        if (source.id === destination.id) {
            reject("Destination must differ from source.");
            return;
        }
        const distance = Math.hypot(destination.x - source.x, destination.y - source.y);
        if (distance > sourceInfo.stargateRange) {
            reject("Destination out of gate range.");
            return;
        }
        Game.queueOrder(new Order(ORDER_TYPES.STARGATE_JUMP, 1, { fleetId, sourcePlanetId, destinationPlanetId }));
        Game.logMsg(`STARGATE: ${fleet.name} queued jump ${source.name} ➜ ${destination.name}`, "Command");
        this.updateSide();
        this.updateComms();
    },

    queueMineSweep: function(fleetId, minefieldId) {
        const reject = (reason) => {
            Game.logMsg(`ORDER REJECTED: ${reason}`, "System", "high");
            this.updateComms();
        };
        const fleet = Game.fleets.find(item => item.id === fleetId);
        if (!fleet || fleet.owner !== 1) {
            reject("Fleet not under your command.");
            return;
        }
        if (fleet.mineSweepingStrength <= 0) {
            reject("Fleet lacks mine-sweeping capability.");
            return;
        }
        const intelList = Game.minefieldIntel?.[1] || [];
        const target = intelList.find(entry => entry.id === minefieldId);
        if (!target) {
            reject("Minefield target invalid.");
            return;
        }
        Game.queueOrder(new Order(ORDER_TYPES.SWEEP_MINES, 1, { fleetId, minefieldId }));
        Game.logMsg(`SWEEP: ${fleet.name} queued sweep on minefield #${target.id}`, "Command");
        this.updateSide();
        this.updateComms();
    },

    queueBattlePlan: function(fleetId, primary, tactic) {
        const fleet = Game.fleets.find(item => item.id === fleetId);
        if (!fleet || fleet.owner !== 1) {
            return;
        }
        Game.queueOrder(new Order(ORDER_TYPES.UPDATE_BATTLE_PLAN, 1, { fleetId, primary, tactic }));
        Game.logMsg(`BATTLE PLAN: ${fleet.name} set to ${primary} / ${tactic}.`, "Command");
        this.updateSide();
        this.updateComms();
    },

    setScreen: function(id) {
        document.querySelectorAll('.screen-overlay').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.icon-btn').forEach(el => el.classList.remove('active'));

        if (id !== 'map') {
            document.getElementById(`screen-${id}`).classList.add('active');
        }
        document.querySelector(`button[onclick="UI.setScreen('${id}')"]`)?.classList.add('active');

        if (id === 'empire') this.updateEmpire();
        if (id === 'comms') this.updateComms();
        if (id === 'fleets') this.updateFleets();
        if (id === 'research') this.updateResearch();
    },

    updateHeader: function() {
        document.getElementById('g-year').innerText = Game.year;
        document.getElementById('g-cred').innerText = Game.credits;
        document.getElementById('g-metal').innerText = `${(Game.minerals / 1000).toFixed(1)}k`;
        const focus = Game.researchFocus;
        const fieldState = focus ? Game.getResearchFieldState(focus, 1) : null;
        document.getElementById('g-rd').innerText = fieldState ? Math.floor(fieldState.storedRP) : 0;
    },

    updateEmpire: function() {
        let pop = 0;
        let tax = 0;
        Game.stars.filter(s => s.owner === 1).forEach(s => {
            pop += s.pop;
            tax += Math.floor(s.pop / 900);
        });
        document.getElementById('emp-pop').innerText = pop.toLocaleString();
        document.getElementById('emp-tax').innerText = `${tax}cr`;
        document.getElementById('emp-maint').innerText = `-${Game.fleets.filter(f => f.owner === 1).length * 10}cr`;
        document.getElementById('emp-ind').innerText = `${Game.empireCache.industrialOutput}`;
        document.getElementById('emp-vis').innerText = Game.stars.filter(s => s.visible).length;
        document.getElementById('emp-known').innerText = Game.stars.filter(s => s.known).length;
        document.getElementById('emp-fleets').innerText = Game.fleets.filter(f => f.owner === 1).length;

        document.getElementById('race-type').innerText = Game.race.type;
        document.getElementById('race-grav').innerText = Game.race.grav;
        document.getElementById('race-temp').innerText = Game.race.temp;
        document.getElementById('race-growth').innerText = Game.race.growth;
        document.getElementById('race-mining').innerText = Game.race.mining;

        const diplo = document.getElementById('emp-diplomacy');
        diplo.innerHTML = '';
        Object.entries(Game.diplomacy.status).forEach(([id, status]) => {
            const row = document.createElement('div');
            row.className = 'stat-row';
            row.innerHTML = `<span>Crimson Directorate</span> <span class="val">${status}</span>`;
            diplo.appendChild(row);
        });
    },

    updateComms: function() {
        const list = document.getElementById('msg-list');
        list.innerHTML = "";
        Game.messages.forEach(m => {
            const div = document.createElement('div');
            div.style.padding = "5px";
            div.style.borderBottom = "1px solid #223";
            div.style.cursor = "pointer";
            div.innerHTML = `<span style="color:#0ff">> ${m.turn}</span> <span style="color:#aa0">[${m.sender} ➜ ${m.recipient}]</span> ${m.text.substring(0, 24)}...`;
            div.onclick = () => {
                document.getElementById('msg-body').innerText = `FROM: ${m.sender}\nTO: ${m.recipient}\nYEAR: ${m.turn}\n\n${m.text}`;
            };
            list.appendChild(div);
        });
        document.getElementById('footer-log').innerText = Game.messages[0]?.text || 'READY.';

        const battleList = document.getElementById('battle-list');
        const battleBody = document.getElementById('battle-body');
        battleList.innerHTML = '';
        if (!Game.battles.length) {
            battleBody.innerText = 'No engagements logged.';
        }
        Game.battles.forEach(b => {
            const row = document.createElement('div');
            row.style.padding = '5px';
            row.style.borderBottom = '1px solid #223';
            row.style.cursor = 'pointer';
            row.innerHTML = `<span style="color:#0ff">> ${b.turn}</span> <span style="color:#aa0">[${b.location}]</span> ${b.attacker}`;
            row.onclick = () => {
                battleBody.innerText = `BATTLE: ${b.location}\nATTACKER: ${b.attacker}\nDEFENDER: ${b.defender}\nRESULT: ${b.result.toUpperCase()}\n\n${b.details}`;
            };
            battleList.appendChild(row);
        });

        const logList = document.getElementById('turn-log-list');
        const logBody = document.getElementById('turn-log-body');
        logList.innerHTML = '';
        if (!Game.logs.length) {
            logBody.innerText = 'No logs recorded.';
        }
        Game.logs.slice(0, 12).forEach(log => {
            const row = document.createElement('div');
            row.style.padding = '5px';
            row.style.borderBottom = '1px solid #223';
            row.style.cursor = 'pointer';
            row.innerHTML = `<span style="color:#0ff">> ${log.turn}</span> <span style="color:#aa0">[${log.events.length} events]</span> RNG ${log.rngRolls.length}`;
            row.onclick = () => {
                const checksum = log.checksum ? log.checksum.toString(16) : '0';
                logBody.innerText = `TURN ${log.turn}\nCHECKSUM: ${checksum}\nRNG ROLLS: ${log.rngRolls.length}\nEVENTS:\n- ${log.events.join('\n- ') || 'None'}`;
            };
            logList.appendChild(row);
        });

        const recip = document.getElementById('msg-recipient');
        recip.innerHTML = '';
        [{ id: 2, name: 'Crimson Directorate' }].forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.text = emp.name;
            recip.add(opt);
        });
    },

    renderTech: function() {
        const g = document.getElementById('tech-grid');
        g.innerHTML = '';
        Game.getTechnologyFields().forEach(field => {
            const d = document.createElement('div');
            d.className = 'card';
            d.innerHTML = `
                <h3>${field.name}</h3>
                <div style="font-size:12px; margin-bottom:8px;">${field.description}</div>
                <div class="val">Level: <span id="tech-lvl-${field.id}">1</span></div>
                <div class="bar-wrap"><div class="bar-fill" style="width:0%" id="tech-bar-${field.id}"></div></div>
                <button class="action" data-tech="${field.id}">Focus Research</button>
            `;
            d.querySelector('button').addEventListener('click', e => {
                Game.researchFocus = e.target.dataset.tech;
                this.updateResearch();
            });
            g.appendChild(d);
        });
    },

    updateResearch: function() {
        const fields = Game.getTechnologyFields();
        if (!Game.researchFocus && fields.length) {
            Game.researchFocus = fields[0].id;
        }
        const focusField = fields.find(field => field.id === Game.researchFocus);
        document.getElementById('tech-focus').innerText = focusField?.name || "Unknown";

        const allocation = Game.getResearchAllocation(1);
        const focusAllocation = allocation?.[Game.researchFocus] ?? 0;
        document.getElementById('rd-budget').innerText = Math.round(focusAllocation * 100);
        document.getElementById('rd-slider').value = Math.round(focusAllocation * 100);

        fields.forEach(field => {
            const fieldState = Game.getResearchFieldState(field.id, 1);
            if (!fieldState) {
                return;
            }
            const fill = Math.min(100, Math.floor((fieldState.storedRP / fieldState.rpToNextLevel) * 100));
            document.getElementById(`tech-lvl-${field.id}`).innerText = fieldState.level;
            document.getElementById(`tech-bar-${field.id}`).style.width = `${fill}%`;
        });
    },

    setupDesignWorkshop: function() {
        const hullSelect = document.getElementById('design-hull');
        const raceTraits = new Set([Game.race?.primaryTrait, ...(Game.race?.lesserTraits || [])].filter(Boolean));
        const hulls = Game.getHulls().filter(hull => {
            const required = [
                ...(hull.requiresTraits || []),
                ...(hull.reqTrait ? [hull.reqTrait] : [])
            ];
            if (!required.length) {
                return true;
            }
            return required.every(trait => raceTraits.has(trait));
        });
        if (!hullSelect) {
            return;
        }
        hullSelect.innerHTML = '';
        hulls.forEach(hull => {
            const opt = document.createElement('option');
            opt.value = hull.id;
            opt.text = `${hull.name} (${hull.cost}cr)`;
            hullSelect.add(opt);
        });
        if (!hullSelect.value && hulls.length) {
            hullSelect.value = hulls[0].id;
        }
        this.renderDesignSlots();
        this.updateDesignStats();
    },

    renderDesignSlots: function() {
        const hullId = document.getElementById('design-hull')?.value;
        const hull = Game.getHullById(hullId);
        const grid = document.getElementById('design-slots');
        if (!grid || !hull) {
            return;
        }
        const techState = Game.getTechnologyState(1);
        const raceTraits = new Set([Game.race?.primaryTrait, ...(Game.race?.lesserTraits || [])].filter(Boolean));
        grid.innerHTML = '';
        Object.entries(hull.slotLayout || {}).forEach(([slotType, count]) => {
            for (let i = 0; i < count; i++) {
                const slot = document.createElement('div');
                slot.className = 'slot-card';
                const label = document.createElement('div');
                label.className = 'slot-label';
                label.textContent = `${slotType.toUpperCase()} SLOT ${i + 1}`;
                const select = document.createElement('select');
                select.dataset.slotType = slotType;
                const detail = document.createElement('div');
                detail.className = 'slot-detail';
                const components = getComponentsBySlot(slotType, Game.race);
                components.forEach(component => {
                    const opt = document.createElement('option');
                    opt.value = component.id;
                    const missingTech = Object.entries(component.tech || {}).filter(([fieldId, level]) => {
                        const current = techState?.fields?.[fieldId]?.level ?? 0;
                        return current < level;
                    });
                    const requiredTraits = [
                        ...(component.requiresTraits || []),
                        ...(component.reqTrait ? [component.reqTrait] : [])
                    ];
                    const missingTraits = requiredTraits.filter(trait => !raceTraits.has(trait));
                    if (missingTech.length || missingTraits.length) {
                        opt.disabled = true;
                    }
                    const techTag = missingTech.length
                        ? ` | Req ${missingTech.map(([fieldId, level]) => `${fieldId} ${level}`).join(', ')}`
                        : '';
                    const traitTag = missingTraits.length ? ` | Req ${missingTraits.join(', ')}` : '';
                    const raceTag = requiredTraits.length ? ` | Trait ${requiredTraits.join(', ')}` : '';
                    opt.text = `${component.name} (${component.cost}cr)${techTag}${raceTag}${traitTag}`;
                    select.add(opt);
                });
                select.addEventListener('change', () => {
                    this.updateDesignStats();
                    this.updateSlotDetail(select, detail, components);
                });
                if (select.options.length) {
                    const enabledOption = Array.from(select.options).find(option => !option.disabled);
                    if (enabledOption) {
                        select.value = enabledOption.value;
                    }
                }
                this.updateSlotDetail(select, detail, components);
                slot.appendChild(label);
                slot.appendChild(select);
                slot.appendChild(detail);
                grid.appendChild(slot);
            }
        });
    },

    updateSlotDetail: function(select, detail, components) {
        const component = components.find(entry => entry.id === select.value);
        if (!component || !detail) {
            return;
        }
        const stats = component.stats || {};
        const parts = [];
        if (component.mass) {
            parts.push(`${component.mass}kt`);
        }
        if (component.powerUsage) {
            parts.push(`P-${component.powerUsage}`);
        }
        if (component.powerOutput) {
            parts.push(`P+${component.powerOutput}`);
        }
        Object.entries(stats).forEach(([key, value]) => {
            if (!value) {
                return;
            }
            const label = key === "mineCapacity" ? "MineCap" : key.charAt(0).toUpperCase() + key.slice(1);
            parts.push(`${label} ${value}`);
        });
        detail.textContent = parts.join(' | ');
    },

    updateDesignStats: function() {
        const hullId = document.getElementById('design-hull')?.value;
        const hull = Game.getHullById(hullId);
        if (!hull) {
            return;
        }
        const techState = Game.getTechnologyState(1);
        const selects = Array.from(document.querySelectorAll('#design-slots select'));
        const componentIds = selects.map(select => select.value);
        const components = componentIds.map(id => getComponentById(id)).filter(Boolean);
        const validation = validateDesign(hull, components, techState, Game.race);
        const stats = validation.stats;
        const errors = validation.errors;

        document.getElementById('sim-cost').innerText = stats?.baseCost ?? 0;
        document.getElementById('sim-mass').innerText = stats?.mass ?? 0;
        document.getElementById('sim-armor').innerText = stats?.armor ?? 0;
        document.getElementById('sim-structure').innerText = stats?.structure ?? 0;
        document.getElementById('sim-range').innerText = stats?.range ?? 0;
        document.getElementById('sim-speed').innerText = stats?.speed ?? 0;
        document.getElementById('sim-attack').innerText = stats?.attack ?? 0;
        document.getElementById('sim-defense').innerText = stats?.defense ?? 0;
        document.getElementById('sim-power').innerText = stats ? `${stats.powerOutput}/${stats.powerUsage}` : '0/0';
        document.getElementById('sim-mine').innerText = stats?.mineCapacity ?? 0;
        document.getElementById('sim-fuel').innerText = stats?.fuel ?? 0;
        document.getElementById('sim-cargo').innerText = stats?.cargo ?? 0;
        document.getElementById('sim-initiative').innerText = stats?.initiative ?? 0;

        const clamp = (value, max = 100) => Math.min(max, Math.max(0, value));
        const speedBar = document.getElementById('sim-speed-bar');
        const attackBar = document.getElementById('sim-attack-bar');
        const defenseBar = document.getElementById('sim-defense-bar');
        if (speedBar) {
            speedBar.style.width = `${clamp((stats?.speed || 0) * 4)}%`;
        }
        if (attackBar) {
            attackBar.style.width = `${clamp((stats?.attack || 0) * 1.2)}%`;
        }
        if (defenseBar) {
            defenseBar.style.width = `${clamp((stats?.defense || 0) * 2)}%`;
        }

        const errorList = document.getElementById('design-errors');
        if (errorList) {
            errorList.innerHTML = '';
            if (!validation.valid) {
                errorList.classList.add('error');
                errors.forEach(err => {
                    const row = document.createElement('div');
                    row.textContent = err;
                    errorList.appendChild(row);
                });
            } else {
                errorList.classList.remove('error');
                errorList.innerHTML = '<div>Design valid. Ready to lock.</div>';
            }
        }

        const saveButton = document.getElementById('design-save');
        if (saveButton) {
            saveButton.disabled = !validation.valid;
        }
    },

    updateDesignList: function() {
        const list = document.getElementById('design-list');
        list.innerHTML = '';
        const designs = Game.shipDesigns?.[1] || [];
        designs.forEach((design) => {
            const row = document.createElement('div');
            row.style.borderBottom = '1px solid #223';
            row.style.padding = '6px 0';
            row.innerHTML = `<strong>${design.name}</strong><br><span style="color:#889">Cost ${design.cost} | Range ${design.range} | Speed ${design.speed}</span>`;
            const btn = document.createElement('button');
            btn.className = 'action';
            btn.style.marginTop = '6px';
            btn.textContent = 'Queue Build';
            btn.addEventListener('click', () => {
                if (!Game.selection || Game.selection.type !== 'star') {
                    Game.logMsg('Select a star to queue production.', 'Industry');
                    this.updateComms();
                    return;
                }
                const star = Game.stars[Game.selection.id];
                if (star.owner !== 1) {
                    Game.logMsg('Star not under your control.', 'Industry');
                    this.updateComms();
                    return;
                }
                this.queueBuild(star, design.designId);
            });
            row.appendChild(btn);
            list.appendChild(row);
        });
    },

    updateFleets: function() {
        const grid = document.getElementById('fleet-grid');
        grid.innerHTML = '';
        Game.fleets.filter(f => f.owner === 1).forEach((fleet, idx) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h3>${fleet.name}</h3>
                <div class="stat-row"><span>Class</span> <span class="val">${fleet.design.name}</span></div>
                <div class="stat-row"><span>Fuel</span> <span class="val">${fleet.fuel.toFixed(0)}</span></div>
                <div class="stat-row"><span>Speed</span> <span class="val">${fleet.design.speed}</span></div>
                <div class="stat-row"><span>Status</span> <span class="val">${fleet.dest ? 'In Transit' : 'Holding'}</span></div>
                <button class="action">Select</button>
            `;
            card.querySelector('button').addEventListener('click', () => {
                Game.selection = { type: 'fleet', id: Game.fleets.indexOf(fleet) };
                renderer.cam.x = fleet.x;
                renderer.cam.y = fleet.y;
                renderer.cam.dirty = true;
                UI.updateSide();
                UI.setScreen('map');
            });
            grid.appendChild(card);
        });
    },

    updateSide: function() {
        const p = document.getElementById('ctx-content');
        const none = document.getElementById('ctx-none');

        if (!Game.selection) {
            p.style.display = 'none';
            none.style.display = 'block';
            return;
        }

        p.style.display = 'block';
        none.style.display = 'none';
        let h = "";

        if (Game.selection.type === 'star') {
            const star = Game.stars[Game.selection.id];
            const intelEntry = Game.planetKnowledge?.[1]?.[star.id];
            const info = star.visible ? star : (star.snapshot ?? intelEntry?.snapshot);
            if (!info) {
                h = `<div style="color:#666;">Signal lost.</div>`;
                p.innerHTML = h;
                return;
            }
            h += `<h3>${star.name} ${star.visible ? '' : '<span style="color:#666">(last known)</span>'}</h3>`;
            h += `<div class="panel-block"><div class="stat-row"><span>Owner</span> <span class="val">${info.owner === 1 ? 'YOU' : (info.owner ? 'ALIEN' : 'NONE')}</span></div>`;
            h += `<div class="stat-row"><span>Pop</span> <span class="val">${info.pop.toLocaleString()}</span></div></div>`;

            h += `<h3>Resources</h3>`;
            h += `<div class="stat-row"><span>Iron</span> <span class="val">${info.mins.i}%</span></div><div class="bar-wrap"><div class="bar-fill res-i" style="width:${info.mins.i}%"></div></div>`;
            h += `<div class="stat-row"><span>Bor</span> <span class="val">${info.mins.b}%</span></div><div class="bar-wrap"><div class="bar-fill res-b" style="width:${info.mins.b}%"></div></div>`;
            h += `<div class="stat-row"><span>Germ</span> <span class="val">${info.mins.g}%</span></div><div class="bar-wrap"><div class="bar-fill res-g" style="width:${info.mins.g}%"></div></div>`;

            if (star.owner === 1 && star.visible) {
            h += `<div class="panel-block" style="margin-top:15px;"><h3>Production</h3>`;
            h += `<div class="stat-row"><span>Mines</span> <span class="val">${star.def.mines}</span></div>`;
            h += `<div class="stat-row"><span>Factories</span> <span class="val">${star.def.facts}</span></div>`;
            h += `<div class="stat-row"><span>Starbase</span> <span class="val">${star.def.base ? star.def.base.name : 'None'}</span></div>`;

            if (Array.isArray(star.queue) && star.queue.length) {
                    const current = star.queue[0];
                    const label = current.type === 'ship'
                        ? current.bp.name
                        : `${DB.structures[current.kind].name} x${current.count}`;
                    h += `<div style="color:var(--c-warn); font-size:12px; margin-top:5px;">Building: ${label}<br>${Math.floor(current.done)} / ${current.cost}</div>`;
                    if (star.queue.length > 1) {
                        h += `<div style="font-size:11px; color:#667;">Queue: ${star.queue.length - 1} item(s) pending</div>`;
                    }
                } else {
                    h += `<div style="font-size:12px; margin-top:6px;">Queue a blueprint from the Design screen.</div>`;
                }
            h += `</div>`;

            h += `<div class="panel-block"><h3>Planetary Build</h3>`;
            if (!Array.isArray(star.queue) || !star.queue.length) {
                h += `<button class="action" onclick="UI.queueStructure(Game.stars[${star.id}], 'mine', 10)">Add 10 Mines (${DB.structures.mine.cost * 10}cr)</button>`;
                h += `<button class="action" onclick="UI.queueStructure(Game.stars[${star.id}], 'factory', 10)">Add 10 Factories (${DB.structures.factory.cost * 10}cr)</button>`;
                if (!star.def.base) {
                    h += `<button class="action" onclick="UI.queueStructure(Game.stars[${star.id}], 'base', 1)">Construct Starbase (${DB.structures.base.cost}cr)</button>`;
                }
            } else {
                h += `<div style="font-size:12px; color:#667;">Construction queue active.</div>`;
            }
            h += `</div>`;

            h += `<div class="panel-block"><h3>Sector Scan</h3>`;
            h += `<button class="action" onclick="UI.scanSector(Game.stars[${star.id}])">RUN SECTOR SCAN</button>`;
            h += `</div>`;

            const targets = Game.stars.filter(s => s.owner === 1 && s.id !== star.id);
            const targetOptions = targets.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            h += `<div class="panel-block"><h3>Mass Driver</h3>`;
            h += `<div class="stat-row"><span>Target</span> <select id="driver-target"><option value="">Select</option>${targetOptions}</select></div>`;
                h += `<div class="stat-row"><span>Amount</span> <span class="val"><input id="driver-amount" type="range" min="0" max="500" value="0" style="width:140px;"></span></div>`;
                h += `<button class="action" onclick="UI.launchPacket(${star.id})">LAUNCH PACKET</button>`;
                h += `</div>`;
            }

        } else {
            const fleet = Game.fleets[Game.selection.id];
            h += `<h3>${fleet.name}</h3>`;
            h += `<div class="stat-row"><span>Class</span> <span class="val">${fleet.design.name}</span></div>`;
            h += `<div class="stat-row"><span>Fuel</span> <span class="val ${fleet.fuel < 20 ? 'alert' : ''}">${fleet.fuel.toFixed(0)}</span></div>`;
            h += `<div class="stat-row"><span>Range</span> <span class="val">${fleet.design.range}</span></div>`;
            h += `<div class="stat-row"><span>Mission</span> <span class="val">${fleet.dest ? 'Transit' : 'Orbit'}</span></div>`;
            const battlePlan = fleet.battlePlan || {};
            const planPrimary = battlePlan.primary || "closest";
            const planTactic = battlePlan.tactic || "engage";
            h += `<div class="panel-block"><h3>Battle Settings</h3>`;
            h += `<div class="stat-row"><span>Primary</span> <select id="battle-primary">
                <option value="closest" ${planPrimary === "closest" ? "selected" : ""}>Closest</option>
                <option value="weakest" ${planPrimary === "weakest" ? "selected" : ""}>Weakest</option>
                <option value="value" ${planPrimary === "value" ? "selected" : ""}>Value</option>
                <option value="starbase" ${planPrimary === "starbase" ? "selected" : ""}>Starbase</option>
                <option value="capital" ${planPrimary === "capital" ? "selected" : ""}>Capital</option>
            </select></div>`;
            h += `<div class="stat-row"><span>Tactic</span> <select id="battle-tactic">
                <option value="engage" ${planTactic === "engage" ? "selected" : ""}>Engage</option>
                <option value="disengage" ${planTactic === "disengage" ? "selected" : ""}>Disengage</option>
                <option value="maximize_damage" ${planTactic === "maximize_damage" ? "selected" : ""}>Maximize Damage</option>
                <option value="hold" ${planTactic === "hold" ? "selected" : ""}>Hold</option>
            </select></div>`;
            h += `<button class="action" id="queue-battle-plan" data-fleet-id="${fleet.id}">SET BATTLE PLAN</button>`;
            h += `</div>`;
            if (fleet.design.flags.includes('minelayer')) {
                h += `<div class="panel-block"><h3>Minefield</h3>`;
                h += `<div class="stat-row"><span>Mine Units</span> <span class="val">${fleet.mineUnits}</span></div>`;
                h += `<input id="mine-units" type="range" min="0" max="${fleet.mineUnits}" value="${fleet.mineUnits}" style="width:100%;">`;
                h += `<button class="action" onclick="UI.placeMinefield(Game.fleets[${Game.selection.id}], document.getElementById('mine-units').value)">DEPLOY MINEFIELD</button>`;
                h += `</div>`;
            }
            if (fleet.mineSweepingStrength > 0) {
                const intelList = Game.minefieldIntel?.[1] || [];
                const existingSweep = Game.getOrderQueue(1).some(order => order.type === ORDER_TYPES.SWEEP_MINES && order.payload?.fleetId === fleet.id);
                const sweepOptions = intelList.map(entry => {
                    const relation = entry.ownerEmpireId === 1 ? "Friendly" : "Hostile";
                    return `<option value="${entry.id}">#${entry.id} • ${relation} • R=${Math.round(entry.radius)} • S≈${Math.round(entry.estimatedStrength)} • Seen T=${entry.lastSeenTurn}</option>`;
                }).join("");
                h += `<div class="panel-block"><h3>MINE SWEEP</h3>`;
                h += `<div class="stat-row"><span>Sweep Str</span> <span class="val">${fleet.mineSweepingStrength}</span></div>`;
                if (!intelList.length) {
                    h += `<div style="font-size:12px; color:#667;">NO MINEFIELD SIGNALS IN DATABASE.</div>`;
                } else {
                    h += `<div class="stat-row"><span>Target</span> <select id="sweep-target"><option value="">Select</option>${sweepOptions}</select></div>`;
                }
                if (existingSweep) {
                    h += `<div style="font-size:12px; color:var(--c-warn);">WARNING: EXISTING QUEUED ORDER FOR THIS UNIT</div>`;
                }
                h += `<button class="action" id="queue-sweep" data-fleet-id="${fleet.id}" ${intelList.length ? "" : "disabled"}>QUEUE SWEEP</button>`;
                h += `</div>`;
            }
            const sourceStar = this.findStarAtPosition(fleet.x, fleet.y, 12);
            const sourceInfo = sourceStar ? (sourceStar.visible ? sourceStar : sourceStar.snapshot) : null;
            if (sourceStar && sourceInfo?.hasStargate) {
                const destinations = Game.stars.filter(star => {
                    if (!(star.visible || star.known || Game.planetKnowledge?.[1]?.[star.id])) {
                        return false;
                    }
                    if (star.id === sourceStar.id) {
                        return false;
                    }
                    const info = star.visible ? star : star.snapshot;
                    if (!info?.hasStargate) {
                        return false;
                    }
                    const distance = Math.hypot(star.x - sourceStar.x, star.y - sourceStar.y);
                    return distance <= sourceInfo.stargateRange;
                });
                const existingJump = Game.getOrderQueue(1).some(order => order.type === ORDER_TYPES.STARGATE_JUMP && order.payload?.fleetId === fleet.id);
                const destinationOptions = destinations.map(star => `<option value="${star.id}">${star.name}</option>`).join("");
                const massWarning = fleet.mass > sourceInfo.stargateMassLimit
                    ? `<div style="font-size:12px; color:var(--c-warn);">MASS EXCEEDS LIMIT — MISJUMP RISK ↑</div>`
                    : "";
                h += `<div class="panel-block"><h3>STARGATE TRANSIT</h3>`;
                h += `<div class="stat-row"><span>Source</span> <span class="val">${sourceStar.name}</span></div>`;
                h += `<div class="stat-row"><span>Range</span> <span class="val">${sourceInfo.stargateRange} ly</span></div>`;
                h += `<div class="stat-row"><span>Mass Limit</span> <span class="val">${sourceInfo.stargateMassLimit} kt</span></div>`;
                h += `<div class="stat-row"><span>Fleet Mass</span> <span class="val ${fleet.mass > sourceInfo.stargateMassLimit ? 'alert' : ''}">${fleet.mass} kt</span></div>`;
                if (destinations.length) {
                    h += `<div class="stat-row"><span>Destination</span> <select id="stargate-destination"><option value="">Select</option>${destinationOptions}</select></div>`;
                } else {
                    h += `<div style="font-size:12px; color:#667;">NO VALID DESTINATIONS IN RANGE.</div>`;
                }
                if (existingJump) {
                    h += `<div style="font-size:12px; color:var(--c-warn);">WARNING: EXISTING QUEUED ORDER FOR THIS UNIT</div>`;
                }
                h += `${massWarning}`;
                h += `<div style="font-size:11px; color:#667; margin-top:4px;">Executes on turn resolution. Misjump risk rises above mass limit.</div>`;
                h += `<button class="action" id="queue-stargate-jump" data-fleet-id="${fleet.id}" data-source-id="${sourceStar.id}" ${destinations.length ? "" : "disabled"}>QUEUE JUMP</button>`;
                h += `</div>`;
            }
            const waypointX = Math.round(fleet.dest?.x ?? fleet.x);
            const waypointY = Math.round(fleet.dest?.y ?? fleet.y);
            const taskOptions = Object.values(WAYPOINT_TASKS)
                .map(task => `<option value="${task}">${task.replace("_", " ")}</option>`)
                .join("");
            const transportDefaults = WAYPOINT_TASK_PAYLOADS.TRANSPORT;
            const colonizeDefaults = WAYPOINT_TASK_PAYLOADS.COLONIZE;
            const remoteMineDefaults = WAYPOINT_TASK_PAYLOADS.REMOTE_MINE;
            const layMineDefaults = WAYPOINT_TASK_PAYLOADS.LAY_MINES;
            const patrolDefaults = WAYPOINT_TASK_PAYLOADS.PATROL;
            const scrapDefaults = WAYPOINT_TASK_PAYLOADS.SCRAP;
            h += `<div class="panel-block"><h3>WAYPOINT TASK</h3>`;
            h += `<div class="stat-row"><span>X</span> <span class="val"><input id="waypoint-x" type="number" value="${waypointX}" style="width:90px;"></span></div>`;
            h += `<div class="stat-row"><span>Y</span> <span class="val"><input id="waypoint-y" type="number" value="${waypointY}" style="width:90px;"></span></div>`;
            h += `<div class="stat-row"><span>Task</span> <select id="waypoint-task"><option value="">None</option>${taskOptions}</select></div>`;
            h += `<div class="waypoint-task-fields" data-task="TRANSPORT" style="display:none;">`;
            h += `<div class="stat-row"><span>Mode</span> <select id="waypoint-transport-mode"><option value="LOAD">Load</option><option value="UNLOAD" selected>Unload</option></select></div>`;
            h += `<div class="stat-row"><span>Iron</span> <span class="val"><input id="waypoint-transport-i" type="number" min="0" value="${transportDefaults.cargo.i}" style="width:80px;"></span></div>`;
            h += `<div class="stat-row"><span>Bor</span> <span class="val"><input id="waypoint-transport-b" type="number" min="0" value="${transportDefaults.cargo.b}" style="width:80px;"></span></div>`;
            h += `<div class="stat-row"><span>Germ</span> <span class="val"><input id="waypoint-transport-g" type="number" min="0" value="${transportDefaults.cargo.g}" style="width:80px;"></span></div>`;
            h += `<div class="stat-row"><span>Pop</span> <span class="val"><input id="waypoint-transport-pop" type="number" min="0" value="${transportDefaults.cargo.pop}" style="width:80px;"></span></div>`;
            h += `</div>`;
            h += `<div class="waypoint-task-fields" data-task="COLONIZE" style="display:none;">`;
            h += `<div class="stat-row"><span>Seed Pop</span> <span class="val"><input id="waypoint-colonize-pop" type="number" min="0" value="${colonizeDefaults.seedPopulation}" style="width:90px;"></span></div>`;
            h += `<div class="stat-row"><span>Iron</span> <span class="val"><input id="waypoint-colonize-i" type="number" min="0" value="${colonizeDefaults.minerals.i}" style="width:80px;"></span></div>`;
            h += `<div class="stat-row"><span>Bor</span> <span class="val"><input id="waypoint-colonize-b" type="number" min="0" value="${colonizeDefaults.minerals.b}" style="width:80px;"></span></div>`;
            h += `<div class="stat-row"><span>Germ</span> <span class="val"><input id="waypoint-colonize-g" type="number" min="0" value="${colonizeDefaults.minerals.g}" style="width:80px;"></span></div>`;
            h += `</div>`;
            h += `<div class="waypoint-task-fields" data-task="REMOTE_MINE" style="display:none;">`;
            h += `<div class="stat-row"><span>Iron</span> <span class="val"><input id="waypoint-remote-i" type="number" min="0" value="${remoteMineDefaults.minerals.i}" style="width:80px;"></span></div>`;
            h += `<div class="stat-row"><span>Bor</span> <span class="val"><input id="waypoint-remote-b" type="number" min="0" value="${remoteMineDefaults.minerals.b}" style="width:80px;"></span></div>`;
            h += `<div class="stat-row"><span>Germ</span> <span class="val"><input id="waypoint-remote-g" type="number" min="0" value="${remoteMineDefaults.minerals.g}" style="width:80px;"></span></div>`;
            h += `</div>`;
            h += `<div class="waypoint-task-fields" data-task="LAY_MINES" style="display:none;">`;
            h += `<div class="stat-row"><span>Units</span> <span class="val"><input id="waypoint-mines-units" type="number" min="0" value="${layMineDefaults.mineUnitsToDeploy}" style="width:80px;"></span></div>`;
            h += `<div class="stat-row"><span>Type</span> <select id="waypoint-mines-type"><option value="standard">Standard</option><option value="heavy">Heavy</option><option value="smart">Smart</option></select></div>`;
            h += `</div>`;
            h += `<div class="waypoint-task-fields" data-task="PATROL" style="display:none;">`;
            h += `<div class="stat-row"><span>Radius</span> <span class="val"><input id="waypoint-patrol-radius" type="number" min="0" value="${patrolDefaults.radius}" style="width:80px;"></span></div>`;
            h += `</div>`;
            h += `<div class="waypoint-task-fields" data-task="SCRAP" style="display:none;">`;
            h += `<div class="stat-row"><span>Recovery</span> <span class="val"><input id="waypoint-scrap-rate" type="number" min="0" max="1" step="0.05" value="${scrapDefaults.recoveryRate}" style="width:80px;"></span></div>`;
            h += `</div>`;
            h += `<button class="action" id="queue-waypoint-task" data-fleet-id="${fleet.id}">QUEUE WAYPOINT</button>`;
            h += `</div>`;
            h += `<button class="action" style="border-color:var(--c-alert); color:var(--c-alert)">SCRAP FLEET</button>`;
        }

        p.innerHTML = h;

        const sweepButton = document.getElementById('queue-sweep');
        if (sweepButton) {
            sweepButton.addEventListener('click', () => {
                const fleetId = parseInt(sweepButton.dataset.fleetId, 10);
                const targetId = parseInt(document.getElementById('sweep-target')?.value, 10);
                if (!Number.isFinite(targetId)) {
                    Game.logMsg("ORDER REJECTED: Minefield target invalid.", "System", "high");
                    this.updateComms();
                    return;
                }
                this.queueMineSweep(fleetId, targetId);
            });
        }

        const stargateButton = document.getElementById('queue-stargate-jump');
        if (stargateButton) {
            stargateButton.addEventListener('click', () => {
                const fleetId = parseInt(stargateButton.dataset.fleetId, 10);
                const sourceId = parseInt(stargateButton.dataset.sourceId, 10);
                const destinationId = parseInt(document.getElementById('stargate-destination')?.value, 10);
                if (!Number.isFinite(destinationId)) {
                    Game.logMsg("ORDER REJECTED: Destination not selected.", "System", "high");
                    this.updateComms();
                    return;
                }
                this.queueStargateJump(fleetId, sourceId, destinationId);
            });
        }

        const battlePlanButton = document.getElementById('queue-battle-plan');
        if (battlePlanButton) {
            battlePlanButton.addEventListener('click', () => {
                const fleetId = parseInt(battlePlanButton.dataset.fleetId, 10);
                const primary = document.getElementById('battle-primary')?.value;
                const tactic = document.getElementById('battle-tactic')?.value;
                if (!primary || !tactic) {
                    Game.logMsg("ORDER REJECTED: Battle plan incomplete.", "System", "high");
                    this.updateComms();
                    return;
                }
                this.queueBattlePlan(fleetId, primary, tactic);
            });
        }

        const waypointTaskSelect = document.getElementById('waypoint-task');
        if (waypointTaskSelect) {
            const taskFields = Array.from(document.querySelectorAll('.waypoint-task-fields'));
            const updateWaypointFields = () => {
                const task = waypointTaskSelect.value;
                taskFields.forEach(field => {
                    field.style.display = field.dataset.task === task ? 'block' : 'none';
                });
            };
            waypointTaskSelect.addEventListener('change', updateWaypointFields);
            updateWaypointFields();
        }

        const waypointButton = document.getElementById('queue-waypoint-task');
        if (waypointButton) {
            waypointButton.addEventListener('click', () => {
                const fleetId = parseInt(waypointButton.dataset.fleetId, 10);
                const fleet = Game.fleets.find(item => item.id === fleetId);
                if (!fleet) {
                    return;
                }
                const x = parseInt(document.getElementById('waypoint-x')?.value, 10);
                const y = parseInt(document.getElementById('waypoint-y')?.value, 10);
                if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    Game.logMsg("ORDER REJECTED: Waypoint coordinates invalid.", "System", "high");
                    this.updateComms();
                    return;
                }
                const task = document.getElementById('waypoint-task')?.value || null;
                let data = null;
                switch (task) {
                    case WAYPOINT_TASKS.TRANSPORT:
                        data = {
                            mode: document.getElementById('waypoint-transport-mode')?.value || "UNLOAD",
                            cargo: {
                                i: Math.max(0, parseInt(document.getElementById('waypoint-transport-i')?.value, 10) || 0),
                                b: Math.max(0, parseInt(document.getElementById('waypoint-transport-b')?.value, 10) || 0),
                                g: Math.max(0, parseInt(document.getElementById('waypoint-transport-g')?.value, 10) || 0),
                                pop: Math.max(0, parseInt(document.getElementById('waypoint-transport-pop')?.value, 10) || 0)
                            }
                        };
                        break;
                    case WAYPOINT_TASKS.COLONIZE:
                        data = {
                            seedPopulation: Math.max(0, parseInt(document.getElementById('waypoint-colonize-pop')?.value, 10) || 0),
                            minerals: {
                                i: Math.max(0, parseInt(document.getElementById('waypoint-colonize-i')?.value, 10) || 0),
                                b: Math.max(0, parseInt(document.getElementById('waypoint-colonize-b')?.value, 10) || 0),
                                g: Math.max(0, parseInt(document.getElementById('waypoint-colonize-g')?.value, 10) || 0)
                            }
                        };
                        break;
                    case WAYPOINT_TASKS.REMOTE_MINE:
                        data = {
                            minerals: {
                                i: Math.max(0, parseInt(document.getElementById('waypoint-remote-i')?.value, 10) || 0),
                                b: Math.max(0, parseInt(document.getElementById('waypoint-remote-b')?.value, 10) || 0),
                                g: Math.max(0, parseInt(document.getElementById('waypoint-remote-g')?.value, 10) || 0)
                            }
                        };
                        break;
                    case WAYPOINT_TASKS.LAY_MINES:
                        data = {
                            mineUnitsToDeploy: Math.max(0, parseInt(document.getElementById('waypoint-mines-units')?.value, 10) || 0),
                            type: document.getElementById('waypoint-mines-type')?.value || "standard"
                        };
                        break;
                    case WAYPOINT_TASKS.PATROL:
                        data = {
                            radius: Math.max(0, parseInt(document.getElementById('waypoint-patrol-radius')?.value, 10) || 0)
                        };
                        break;
                    case WAYPOINT_TASKS.SCRAP:
                        data = {
                            recoveryRate: Math.max(0, parseFloat(document.getElementById('waypoint-scrap-rate')?.value) || 0)
                        };
                        break;
                    default:
                        data = null;
                        break;
                }
                const waypoint = { x, y, task, data };
                this.queueWaypointTask(fleet, waypoint);
            });
        }
    }
};
