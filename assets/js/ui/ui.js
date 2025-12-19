import { DB } from "../data/db.js";
import { Game } from "../core/game.js";
import { ShipDesign } from "../models/entities.js";

let renderer = null;

export const bindRenderer = (rendererRef) => {
    renderer = rendererRef;
};

export const UI = {
    empireCache: { taxTotal: 0, industrialOutput: 0 },

    init: function() {
        this.renderTech();
        this.popDropdowns();
        this.updateDesignStats();
        this.updateHeader();
        this.updateComms();
        this.updateDesignList();
        this.updateEmpire();
        this.updateFleets();
        this.updateResearch();

        document.getElementById('rd-slider').addEventListener('input', e => {
            Game.research.budget = parseInt(e.target.value, 10);
            document.getElementById('rd-budget').innerText = Game.research.budget;
        });

        ['des-hull', 'des-eng', 'des-wep', 'des-shi', 'des-spec'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.updateDesignStats());
        });

        document.getElementById('msg-send').addEventListener('click', () => {
            const recipientId = parseInt(document.getElementById('msg-recipient').value, 10);
            const text = document.getElementById('msg-text').value.trim();
            if (!text) {
                return;
            }
            Game.sendMessage(recipientId, text);
            document.getElementById('msg-text').value = '';
            this.updateComms();
        });
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
        document.getElementById('g-rd').innerText = `${Game.research.progress}`;
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
        document.getElementById('emp-ind').innerText = `${this.empireCache.industrialOutput}`;
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
        DB.techs.forEach((t, i) => {
            const d = document.createElement('div');
            d.className = 'card';
            d.innerHTML = `
                <h3>${t.name}</h3>
                <div style="font-size:12px; margin-bottom:8px;">${t.desc}</div>
                <div class="val">Level: <span id="tech-lvl-${i}">0</span></div>
                <div class="bar-wrap"><div class="bar-fill" style="width:0%" id="tech-bar-${i}"></div></div>
                <button class="action" data-tech="${i}">Focus Research</button>
            `;
            d.querySelector('button').addEventListener('click', e => {
                Game.research.field = parseInt(e.target.dataset.tech, 10);
                this.updateResearch();
            });
            g.appendChild(d);
        });
    },

    updateResearch: function() {
        document.getElementById('tech-focus').innerText = DB.techs[Game.research.field].name;
        document.getElementById('rd-budget').innerText = Game.research.budget;

        DB.techs.forEach((t, i) => {
            const lvl = Game.research.levels[i];
            const cost = Game.researchCost(i);
            const fill = i === Game.research.field ? Math.min(100, Math.floor((Game.research.progress / cost) * 100)) : 0;
            document.getElementById(`tech-lvl-${i}`).innerText = lvl;
            document.getElementById(`tech-bar-${i}`).style.width = `${fill}%`;
        });
    },

    popDropdowns: function() {
        const fill = (id, list) => {
            const sel = document.getElementById(id);
            sel.innerHTML = '';
            list.forEach(item => {
                const o = document.createElement('option');
                o.value = item.id;
                o.text = `${item.name} (${item.cost}cr)`;
                sel.add(o);
            });
        };
        fill('des-hull', DB.hulls);
        fill('des-eng', DB.engines);
        fill('des-wep', DB.weapons);
        fill('des-shi', DB.weapons);
        fill('des-spec', DB.specials);
    },

    updateDesignStats: function() {
        const hull = DB.hulls.find(h => h.id === document.getElementById('des-hull').value);
        const engine = DB.engines.find(e => e.id === document.getElementById('des-eng').value);
        const weapon = DB.weapons.find(w => w.id === document.getElementById('des-wep').value);
        const shield = DB.weapons.find(w => w.id === document.getElementById('des-shi').value);
        const special = DB.specials.find(s => s.id === document.getElementById('des-spec').value);

        const design = new ShipDesign({
            name: "TEMP",
            hull,
            engine,
            weapon,
            shield,
            special
        });

        document.getElementById('sim-cost').innerText = design.cost;
        document.getElementById('sim-mass').innerText = design.mass;
        document.getElementById('sim-fuel').innerText = design.fuel;
        document.getElementById('sim-range').innerText = design.range;
        document.getElementById('sim-speed').innerText = design.speed;
        document.getElementById('sim-bv').innerText = design.bv;
    },

    updateDesignList: function() {
        const list = document.getElementById('design-list');
        list.innerHTML = '';
        Game.designs.forEach((design, index) => {
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
                    return;
                }
                const star = Game.stars[Game.selection.id];
                if (star.owner !== 1) {
                    Game.logMsg('Star not under your control.', 'Industry');
                    return;
                }
                Game.queueBuild(star, index);
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
            const info = star.visible ? star : star.snapshot;
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

            if (star.queue) {
                    const label = star.queue.type === 'ship'
                        ? star.queue.bp.name
                        : `${DB.structures[star.queue.kind].name} x${star.queue.count}`;
                    h += `<div style="color:var(--c-warn); font-size:12px; margin-top:5px;">Building: ${label}<br>${Math.floor(star.queue.done)} / ${star.queue.cost}</div>`;
                } else {
                    h += `<div style="font-size:12px; margin-top:6px;">Queue a blueprint from the Design screen.</div>`;
                }
            h += `</div>`;

            h += `<div class="panel-block"><h3>Planetary Build</h3>`;
            if (!star.queue) {
                h += `<button class="action" onclick="Game.queueStructure(Game.stars[${star.id}], 'mine', 10)">Add 10 Mines (${DB.structures.mine.cost * 10}cr)</button>`;
                h += `<button class="action" onclick="Game.queueStructure(Game.stars[${star.id}], 'factory', 10)">Add 10 Factories (${DB.structures.factory.cost * 10}cr)</button>`;
                if (!star.def.base) {
                    h += `<button class="action" onclick="Game.queueStructure(Game.stars[${star.id}], 'base', 1)">Construct Starbase (${DB.structures.base.cost}cr)</button>`;
                }
            } else {
                h += `<div style="font-size:12px; color:#667;">Construction queue active.</div>`;
            }
            h += `</div>`;

            h += `<div class="panel-block"><h3>Sector Scan</h3>`;
            h += `<button class="action" onclick="Game.scanSector(Game.stars[${star.id}])">RUN SECTOR SCAN</button>`;
            h += `</div>`;

            const targets = Game.stars.filter(s => s.owner === 1 && s.id !== star.id);
            const targetOptions = targets.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            h += `<div class="panel-block"><h3>Mass Driver</h3>`;
            h += `<div class="stat-row"><span>Target</span> <select id="driver-target"><option value="">Select</option>${targetOptions}</select></div>`;
                h += `<div class="stat-row"><span>Amount</span> <span class="val"><input id="driver-amount" type="range" min="0" max="500" value="0" style="width:140px;"></span></div>`;
                h += `<button class="action" onclick="Game.launchPacket(${star.id})">LAUNCH PACKET</button>`;
                h += `</div>`;
            }

        } else {
            const fleet = Game.fleets[Game.selection.id];
            h += `<h3>${fleet.name}</h3>`;
            h += `<div class="stat-row"><span>Class</span> <span class="val">${fleet.design.name}</span></div>`;
            h += `<div class="stat-row"><span>Fuel</span> <span class="val ${fleet.fuel < 20 ? 'alert' : ''}">${fleet.fuel.toFixed(0)}</span></div>`;
            h += `<div class="stat-row"><span>Range</span> <span class="val">${fleet.design.range}</span></div>`;
            h += `<div class="stat-row"><span>Mission</span> <span class="val">${fleet.dest ? 'Transit' : 'Orbit'}</span></div>`;
            if (fleet.design.flags.includes('minelayer')) {
                h += `<button class="action" onclick="Game.placeMinefield(Game.fleets[${Game.selection.id}])">DEPLOY MINEFIELD</button>`;
            }
            h += `<button class="action" style="border-color:var(--c-alert); color:var(--c-alert)">SCRAP FLEET</button>`;
        }

        p.innerHTML = h;
    }
};
