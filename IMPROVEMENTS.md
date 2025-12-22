# STARS // REFORGED - Playability Update Instructions

The following steps outline exactly how to modify your files to implement a Main Menu, Race Configuration, customizable AI opponents, and fix the immediate victory bug.

## 1. Fix the Victory Condition Bug
The game currently checks for victory on Turn 0 before any ships have moved or AI has settled, leading to immediate "Total Annihilation" victories.

**File:** `assets/js/core/victoryResolver.js`
**Action:** Update the `check` method to ignore victory conditions during the first 10 turns.

Find the `VictoryResolver` object export and modify the `check` function:

```javascript
// ... existing imports

export const VictoryResolver = {
    check(state) {
        // --- ADD THIS BLOCK ---
        // Prevent instant victory on game start
        if (state.turnCount < 10) {
            return null;
        }
        // ----------------------

        if (!state?.players?.length) {
            return null;
        }
        // ... rest of the function remains the same
```

## 2. Update HTML Structure for Menus
We need overlay screens for the Main Menu and Race Setup. We also need to hide the in-game UI (Nav/Footer) until the game actually starts.

**File:** `index.html`
**Action:** Replace the `<body>` content with the following structure. Note the new `screen-menu` and `screen-setup` divs, and the `ui-hidden` class on game elements.

```html
<body class="crt">

    <!-- HEADER (Visible in Game) -->
    <header id="game-header" class="ui-hidden">
        <div style="font-size: 20px; color: var(--c-cyan); letter-spacing: 2px; text-shadow: 0 0 10px var(--c-cyan-dim);">STARS <span style="font-size:10px; opacity:0.7">REFORGED</span></div>
        <div style="display:flex;">
            <div class="res-ticker">Y: <span id="g-year" style="color:#fff">2400</span></div>
            <div class="res-ticker">CR: <span id="g-cred">500</span></div>
            <div class="res-ticker">MET: <span id="g-metal">20k</span></div>
            <div class="res-ticker">R&D: <span id="g-rd">0</span></div>
        </div>
    </header>

    <!-- NAV (Visible in Game) -->
    <nav id="game-nav" class="ui-hidden">
        <button class="icon-btn active" onclick="UI.setScreen('map')" title="Galaxy Map">M</button>
        <button class="icon-btn" onclick="UI.setScreen('empire')" title="Empire Overview">E</button>
        <button class="icon-btn" onclick="UI.setScreen('research')" title="Research Lab">R</button>
        <button class="icon-btn" onclick="UI.setScreen('design')" title="Ship Design">D</button>
        <button class="icon-btn" onclick="UI.setScreen('fleets')" title="Fleet Manager">F</button>
        <button class="icon-btn" onclick="UI.setScreen('comms')" title="Diplomacy/Logs">C</button>
    </nav>

    <!-- MAIN VIEWPORT -->
    <div id="main-view" class="crt">
        <!-- CANVAS (Visible in Game) -->
        <canvas id="galaxy-canvas" class="ui-hidden"></canvas>
        <div class="grain"></div>
        <div id="minefield-tooltip" class="minefield-tooltip"></div>

        <!-- === NEW: MAIN MENU === -->
        <div id="screen-menu" class="screen-overlay active" style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <h1 style="font-size: 48px; color:var(--c-cyan); text-shadow: 0 0 20px var(--c-cyan);">STARS // REFORGED</h1>
            <div style="width: 300px; margin-top: 40px;">
                <button class="action" onclick="UI.showRaceSetup()" style="font-size: 18px; padding: 15px;">NEW GAME</button>
                <button class="action" onclick="UI.loadGame()" style="margin-top: 20px; font-size: 18px; padding: 15px;">LOAD GAME</button>
            </div>
        </div>

        <!-- === NEW: RACE SETUP === -->
        <div id="screen-setup" class="screen-overlay">
            <h1 style="color:var(--c-cyan)">FACTION CONFIGURATION</h1>
            <div class="grid-layout design-grid">
                <div class="card">
                    <h3>Identity</h3>
                    <div class="stat-row"><span>Race Name:</span> <input type="text" id="setup-name" value="The Ashen Arc" style="width: 150px;"></div>
                    <div class="stat-row" style="margin-top:10px;"><span>AI Opponents:</span> <input type="number" id="setup-ai-count" min="1" max="5" value="1" style="width: 60px;"></div>
                    <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 10px;">
                        <h3>Points Budget: <span id="setup-points" style="color:var(--c-good)">10</span>/10</h3>
                        <p style="font-size: 12px; color: #889;">Select 1 Primary Trait and up to 3 Lesser Traits.</p>
                    </div>
                    <button class="action" onclick="UI.startGame()" style="margin-top: 30px; border-color: var(--c-good); color: var(--c-good);">INITIALIZE SIMULATION</button>
                    <button class="action" onclick="UI.showMainMenu()" style="margin-top: 10px;">BACK</button>
                </div>
                <div class="card">
                    <h3>Primary Trait (Cost: 4)</h3>
                    <div id="setup-primary-traits" style="max-height: 400px; overflow-y: auto;"></div>
                </div>
                <div class="card">
                    <h3>Lesser Traits (Cost: 2)</h3>
                    <div id="setup-lesser-traits" style="max-height: 400px; overflow-y: auto;"></div>
                </div>
            </div>
        </div>

        <!-- GAME SCREENS (Existing) -->
        <div id="screen-empire" class="screen-overlay">
            <!-- (Keep existing content) -->
            <h1 style="color:var(--c-cyan)">IMPERIAL DASHBOARD</h1>
            <div class="grid-layout">
                <div class="card">
                    <h3>Race Traits</h3>
                    <div class="stat-row"><span>Type:</span> <span class="val" id="race-type">Synthetic Nomads</span></div>
                    <div class="stat-row"><span>Primary:</span> <span class="val" id="race-primary">-</span></div>
                    <div class="stat-row"><span>Bonuses:</span> <span class="val" id="race-bonuses">-</span></div>
                </div>
                <!-- Keep Economy/Known/Diplomacy Cards -->
                <div class="card">
                    <h3>Economy</h3>
                    <div class="stat-row"><span>Total Pop:</span> <span class="val" id="emp-pop">0</span></div>
                    <div class="stat-row"><span>Tax Income:</span> <span class="val" id="emp-tax">0</span></div>
                    <div class="stat-row"><span>Maint. Cost:</span> <span class="val alert" id="emp-maint">0</span></div>
                    <div class="stat-row"><span>Industrial Output:</span> <span class="val" id="emp-ind">0</span></div>
                </div>
                <div class="card">
                    <h3>Known Sectors</h3>
                    <div class="stat-row"><span>Visible Stars:</span> <span class="val" id="emp-vis">0</span></div>
                    <div class="stat-row"><span>Known Stars:</span> <span class="val" id="emp-known">0</span></div>
                    <div class="stat-row"><span>Active Fleets:</span> <span class="val" id="emp-fleets">0</span></div>
                </div>
                <div class="card">
                    <h3>Diplomacy</h3>
                    <div id="emp-diplomacy" style="font-size:12px;"></div>
                </div>
            </div>
        </div>

        <div id="screen-research" class="screen-overlay">
            <!-- (Keep existing content) -->
            <h1 style="color:var(--c-cyan)">R&D LABS</h1>
            <div class="card" style="margin-bottom:20px;">
                <div class="stat-row"><span>Current Focus:</span> <span class="val" id="tech-focus">Energy</span></div>
                <div class="stat-row"><span>Allocation Focus:</span> <span class="val"><span id="rd-budget">25</span>%</span></div>
                <input id="rd-slider" type="range" min="0" max="100" value="25" style="width:100%;">
            </div>
            <div class="grid-layout" id="tech-grid"></div>
        </div>

        <div id="screen-fleets" class="screen-overlay">
            <!-- (Keep existing content) -->
            <h1 style="color:var(--c-cyan)">FLEET MANIFEST</h1>
            <div class="grid-layout" id="fleet-grid"></div>
        </div>

        <div id="screen-comms" class="screen-overlay">
            <!-- (Keep existing content) -->
            <h1 style="color:var(--c-cyan)">COMMS & LOGS</h1>
            <div class="grid-layout comms-grid">
                <div class="card">
                    <h3>Inbox</h3>
                    <div id="msg-list" style="font-size:12px; height: 300px; overflow-y:auto;"></div>
                </div>
                <div class="card">
                    <h3>Message Content</h3>
                    <div id="msg-body" style="font-size:14px; color:#fff; white-space:pre-line;">Select a message...</div>
                </div>
                <div class="card">
                    <h3>Battle VCR</h3>
                    <div id="battle-list" style="font-size:12px; height: 150px; overflow-y:auto;"></div>
                    <div id="battle-body" style="font-size:12px; color:#fff; white-space:pre-line; margin-top:10px;">No engagements logged.</div>
                </div>
                <div class="card">
                    <h3>Turn Log</h3>
                    <div id="turn-log-list" style="font-size:12px; height: 150px; overflow-y:auto;"></div>
                    <div id="turn-log-body" style="font-size:12px; color:#fff; white-space:pre-line; margin-top:10px;">No logs recorded.</div>
                </div>
                <div class="card">
                    <h3>Transmit</h3>
                    <div class="stat-row"><span>To:</span> <select id="msg-recipient"></select></div>
                    <textarea id="msg-text" placeholder="Compose transmission..."></textarea>
                    <button class="action" id="msg-send">SEND</button>
                </div>
            </div>
        </div>

        <div id="screen-design" class="screen-overlay">
            <!-- (Keep existing content) -->
            <h1 style="color:var(--c-cyan)">SHIP DESIGN WORKSHOP</h1>
            <div class="grid-layout design-grid">
                <div class="card">
                    <h3>Hull & Slots</h3>
                    <div class="stat-row">Hull: <select id="design-hull"></select></div>
                    <input type="text" id="design-name" value="New Ship Class" style="width:100%; margin-top:10px;">
                    <div id="design-slots" class="slot-grid"></div>
                    <button class="action" id="design-save" onclick="UI.saveDesign()">LOCK DESIGN</button>
                    <div id="design-errors" class="design-errors"></div>
                </div>
                <div class="card">
                    <h3>Simulated Specs</h3>
                    <div class="stat-row"><span>Cost:</span> <span class="val" id="sim-cost">0</span></div>
                    <div class="stat-row"><span>Mass:</span> <span class="val" id="sim-mass">0</span>kt</div>
                    <div class="stat-row"><span>Armor:</span> <span class="val" id="sim-armor">0</span></div>
                    <div class="stat-row"><span>Structure:</span> <span class="val" id="sim-structure">0</span></div>
                    <div class="stat-row"><span>Fuel:</span> <span class="val" id="sim-fuel">0</span></div>
                    <div class="stat-row"><span>Cargo:</span> <span class="val" id="sim-cargo">0</span></div>
                    <div class="stat-row"><span>Range:</span> <span class="val" id="sim-range">0</span>ly</div>
                    <div class="stat-row"><span>Speed:</span> <span class="val" id="sim-speed">0</span></div>
                    <div class="bar-wrap"><div class="bar-fill" id="sim-speed-bar"></div></div>
                    <div class="stat-row"><span>Attack:</span> <span class="val" id="sim-attack">0</span></div>
                    <div class="bar-wrap"><div class="bar-fill" id="sim-attack-bar"></div></div>
                    <div class="stat-row"><span>Defense:</span> <span class="val" id="sim-defense">0</span></div>
                    <div class="bar-wrap"><div class="bar-fill" id="sim-defense-bar"></div></div>
                    <div class="stat-row"><span>Initiative:</span> <span class="val" id="sim-initiative">0</span></div>
                    <div class="stat-row"><span>Power:</span> <span class="val" id="sim-power">0/0</span></div>
                    <div class="stat-row"><span>Mine Cap:</span> <span class="val" id="sim-mine">0</span></div>
                </div>
                <div class="card">
                    <h3>Saved Blueprints</h3>
                    <div id="design-list" style="font-size:12px; max-height:260px; overflow:auto;"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- CONTEXT SIDEBAR (Visible in Game) -->
    <aside id="ctx-panel" class="ui-hidden">
        <div id="ctx-none" style="text-align:center; margin-top:50px; color:#555;">NO SIGNAL<br>L-Click Select<br>R-Click Move</div>
        <div id="ctx-content" style="display:none"></div>
    </aside>

    <!-- FOOTER (Visible in Game) -->
    <footer id="game-footer" class="ui-hidden">
        <button id="turn-btn" class="action" style="width:auto; padding:0 30px; height:32px;" onclick="UI.submitTurn()">EXECUTE TURN</button>
        <div class="log-strip">
            <div id="footer-log">READY.</div>
            <div>|</div>
            <div>Space: End Turn</div>
            <div>Right Click: Move</div>
        </div>
    </footer>
    <script type="module" src="assets/js/main.js"></script>
</body>
```

## 3. Styles for New Screens
**File:** `assets/css/styles.css`
**Action:** Add the utility class to hide game elements and style the trait selection inputs. Add this to the end of the file:

```css
.ui-hidden {
    display: none !important;
}

.trait-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    border-bottom: 1px solid #223;
    font-size: 13px;
    cursor: pointer;
}
.trait-item:hover {
    background: rgba(255, 255, 255, 0.05);
}
.trait-item input {
    margin-right: 10px;
    cursor: pointer;
}
.trait-cost {
    color: var(--c-warn);
}
.trait-desc {
    font-size: 11px;
    color: #889;
    margin-top: 2px;
}
```

## 4. Refactor Game Logic
We need to change how the game initializes. It should not auto-start.

**File:** `assets/js/core/game.js`
**Action:**
1. Update `init` to *only* load config and then call `UI.showMainMenu()`.
2. Add a `startNewGame` method that accepts the Race and AI Config.
3. Update `setupPlayers` to use the dynamic race config and AI count.

Replace the specific methods in `Game` object (keep the rest):

```javascript
    init: async function() {
        const configs = await loadConfig();
        this.rules = configs.rules;
        this.aiConfig = configs.ai;
        // Don't auto-load state or generate galaxy yet
        UI.showMainMenu();
    },

    // New Method: Starts a fresh game from the UI settings
    startNewGame: function(raceConfig, aiCount) {
        this.turnCount = 0;
        this.year = 2400;
        this.state = "RUNNING";
        this.race = raceConfig; // Apply the custom race
        this.aiConfig.aiPlayers = Array.from({length: aiCount}, (_, i) => i + 2); // IDs 2, 3...
        
        this.setupPlayers();
        this.researchFocus = this.rules.technologyFields?.[0]?.id || null;
        this.minerals = this.mineralStock.i + this.mineralStock.b + this.mineralStock.g;
        this.rngSeed = BigInt(Math.floor(Math.random() * 999999999));
        this.rng = new PCG32(this.rngSeed, 54n);
        this.turnHash = this.hashTurnSeed(this.rngSeed, BigInt(this.turnCount));
        
        this.seedShipDesigns();
        this.generateGalaxy(80);
        this.seedHomeworld();
        this.seedRivals();

        this.updateVisibility();
        this.logMsg("System initialized. Command link established.", "System");
    },

    setupPlayers: function() {
        const aiPlayers = this.aiConfig?.aiPlayers || [2];
        const techFields = this.rules?.technologyFields || [];
        const raceModifiers = resolveRaceModifiers(this.race).modifiers;
        
        // AI Races (For now, simple clones or generic)
        // In a full game, you'd generate random traits for AI here
        const aiRace = new Race({
            name: "Crimson Directorate", 
            type: "Aggressors",
            mining: "Strip",
            economy: { resPerColonist: 1000 }
        });
        const aiModifiers = resolveRaceModifiers(aiRace).modifiers;

        this.players = [
            {
                id: 1,
                type: "human",
                status: "active",
                eliminatedAtTurn: null,
                race: this.race,
                technology: createTechnologyState(techFields, undefined, raceModifiers)
            },
            ...aiPlayers.map(id => ({
                id,
                type: "ai",
                status: "active",
                eliminatedAtTurn: null,
                race: aiRace,
                technology: createTechnologyState(techFields, undefined, aiModifiers)
            }))
        ];

        // ... rest of setupPlayers (economy init) remains the same
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
```

Also, update `seedRivals` in `game.js` to dynamically name rivals based on the new `aiCount`:

```javascript
    seedRivals: function() {
        const aiPlayers = this.players.filter(player => player.type === "ai");
        if (!aiPlayers.length) {
            return;
        }
        // Find stars far from player (ID 0 is usually homeworld)
        const availableStars = this.stars
            .filter(star => !star.owner && star.id !== 0)
            .sort((a, b) => dist(b, this.stars[0]) - dist(a, this.stars[0])); // Furthest first

        aiPlayers.forEach((player, index) => {
            const rival = availableStars[index];
            if (!rival) return;

            AIController.ensureBasicDesigns(this, player.id);
            const designs = this.shipDesigns[player.id] || [];
            const raiderDesign = designs.find(design => !design.flags.includes("colonize")) || designs[0];
            
            rival.owner = player.id;
            rival.name = `RIVAL-${player.id} PRIME`;
            rival.pop = 40000;
            rival.def.mines = 80;
            rival.def.facts = 90;
            rival.def.base = { name: "Orbital Hub", hp: 900 };
            rival.hasStargate = true;
            rival.stargateMassLimit = 360;
            rival.stargateRange = 850;
            rival.stargateTechLevel = 1;

            this.fleets.push(new Fleet({
                id: this.nextFleetId++,
                owner: player.id,
                x: rival.x,
                y: rival.y,
                name: `Defense Wing ${player.id}`,
                design: raiderDesign
            }));
        });
    },
```

## 5. UI Implementation
We need to handle the new screens and the logic for the Trait "Store".

**File:** `assets/js/ui/ui.js`
**Action:** Add/Update the following methods to the `UI` object.

Import `Race` and `getRaceTraitCatalog` at the top of `ui.js`:
```javascript
import { Race } from "../models/entities.js";
import { getRaceTraitCatalog } from "../core/raceTraits.js";
```

Add these methods to the `UI` object:

```javascript
    showMainMenu: function() {
        this.setScreen('menu');
        document.getElementById('game-header').classList.add('ui-hidden');
        document.getElementById('game-nav').classList.add('ui-hidden');
        document.getElementById('game-footer').classList.add('ui-hidden');
        document.getElementById('ctx-panel').classList.add('ui-hidden');
        document.getElementById('galaxy-canvas').classList.add('ui-hidden');
    },

    showRaceSetup: function() {
        this.setScreen('setup');
        this.renderTraitSelection();
    },

    loadGame: function() {
        // Simple load implementation
        const save = localStorage.getItem("stars_save");
        if(save) {
            // Logic to hook into loadState.js would go here
            alert("Save system integration required."); 
        } else {
            alert("No save found.");
        }
    },

    renderTraitSelection: function() {
        const catalog = getRaceTraitCatalog();
        const primaries = document.getElementById('setup-primary-traits');
        const lessers = document.getElementById('setup-lesser-traits');
        primaries.innerHTML = '';
        lessers.innerHTML = '';

        const allTraits = Object.values(catalog);
        
        // Primary Traits (Radio behavior via JS)
        allTraits.filter(t => t.type === 'primary').forEach(t => {
            const div = document.createElement('div');
            div.className = 'trait-item';
            div.innerHTML = `
                <div>
                    <input type="radio" name="trait_primary" value="${t.id}" data-cost="${t.cost}">
                    <strong>${t.name}</strong> <span class="trait-desc">(Cost ${t.cost})</span>
                </div>
            `;
            // Description logic could be expanded here
            div.querySelector('input').addEventListener('change', () => this.updatePoints());
            primaries.appendChild(div);
        });

        // Lesser Traits (Checkbox)
        allTraits.filter(t => t.type === 'lesser').forEach(t => {
            const div = document.createElement('div');
            div.className = 'trait-item';
            div.innerHTML = `
                <div>
                    <input type="checkbox" name="trait_lesser" value="${t.id}" data-cost="${t.cost}">
                    <strong>${t.name}</strong> <span class="trait-desc">(Cost ${t.cost})</span>
                </div>
            `;
            div.querySelector('input').addEventListener('change', () => this.updatePoints());
            lessers.appendChild(div);
        });
        
        // Auto-select first primary to prevent null
        document.querySelector('input[name="trait_primary"]').checked = true;
        this.updatePoints();
    },

    updatePoints: function() {
        const budget = 10;
        let spent = 0;
        
        // Primary
        const p = document.querySelector('input[name="trait_primary"]:checked');
        if(p) spent += parseInt(p.dataset.cost);

        // Lessers
        document.querySelectorAll('input[name="trait_lesser"]:checked').forEach(c => {
            spent += parseInt(c.dataset.cost);
        });

        const display = document.getElementById('setup-points');
        display.innerText = (budget - spent);
        
        const btn = document.querySelector('button[onclick="UI.startGame()"]');
        if(spent > budget) {
            display.style.color = 'var(--c-alert)';
            btn.disabled = true;
            btn.innerText = "OVER BUDGET";
        } else {
            display.style.color = 'var(--c-good)';
            btn.disabled = false;
            btn.innerText = "INITIALIZE SIMULATION";
        }
    },

    startGame: function() {
        const name = document.getElementById('setup-name').value || "The Unknown";
        const aiCount = parseInt(document.getElementById('setup-ai-count').value) || 1;
        
        const p = document.querySelector('input[name="trait_primary"]:checked');
        const primaryTrait = p ? p.value : null;
        
        const lesserTraits = [];
        document.querySelectorAll('input[name="trait_lesser"]:checked').forEach(c => {
            lesserTraits.push(c.value);
        });

        const raceConfig = new Race({
            name: name,
            type: "Custom",
            grav: "Adaptive",
            temp: "Adaptive",
            growth: "Normal",
            mining: "Standard",
            primaryTrait: primaryTrait,
            lesserTraits: lesserTraits
        });

        Game.startNewGame(raceConfig, aiCount);
        
        // Reveal UI
        document.getElementById('game-header').classList.remove('ui-hidden');
        document.getElementById('game-nav').classList.remove('ui-hidden');
        document.getElementById('game-footer').classList.remove('ui-hidden');
        document.getElementById('ctx-panel').classList.remove('ui-hidden');
        document.getElementById('galaxy-canvas').classList.remove('ui-hidden');
        
        // Setup initial UI state
        UI.init(); // Refresh generic listeners
        this.setScreen('map');
        this.updateEmpire(); // Explicitly update empire stats to show race traits
        this.updateComms(); // Clear old messages
        
        // Ensure renderer resizes to new visible canvas
        if(window.Renderer) {
            window.Renderer.resize();
            window.Renderer.cam.x = Game.fleets[0].x;
            window.Renderer.cam.y = Game.fleets[0].y;
        }
    },
```

**Also in `assets/js/ui/ui.js`**: Update `updateEmpire` to properly display the new traits:

```javascript
    updateEmpire: function() {
        // ... (Keep existing pop/tax calculations) ...

        // Update Race Info Section
        document.getElementById('race-type').innerText = Game.race.name; // Use custom name
        
        const catalog = getRaceTraitCatalog();
        const pTrait = catalog[Game.race.primaryTrait];
        document.getElementById('race-primary').innerText = pTrait ? pTrait.name : "None";
        
        const lNames = (Game.race.lesserTraits || []).map(id => catalog[id]?.name).filter(Boolean);
        document.getElementById('race-bonuses').innerText = lNames.length ? lNames.join(", ") : "Standard";

        // ... (Keep the rest of the function) ...
```

## 6. Save State Logic (Optional but Recommended)
To prevent the victory bug from persisting in saved games if they were created with the old logic, ensure `storage.js` clears data on a new game start. The new `Game.startNewGame` handles state reset in memory, but if you implemented auto-save/load, ensure it writes *over* the old keys.

No extra code needed here if following step 4 correctly, as `startNewGame` resets `this` properties.

---

### Summary of Changes flow:
1.  **Browser loads `index.html`**: Sees the new Menu Overlay. Canvas and Header are hidden.
2.  **`main.js` runs**: Calls `Game.init()`.
3.  **`Game.init()`**: Loads config files, then calls `UI.showMainMenu()`.
4.  **User clicks "New Game"**: `UI.showRaceSetup()` reveals the trait selector.
5.  **User picks Traits & AI Count**: Budget logic in `UI.updatePoints()` keeps it valid.
6.  **User clicks "Initialize"**:
    *   `UI.startGame()` creates a `Race` object.
    *   Calls `Game.startNewGame()`.
    *   Galaxy generates, Players setup (with new Race).
    *   UI Elements (`header`, `nav`, `canvas`) are unhidden (`classList.remove('ui-hidden')`).
    *   `setScreen('map')` starts the visual loop.
7.  **Gameplay**: User plays turn 1. `VictoryResolver` returns null because turn < 10.
8.  **Turn Execution**: AI logic runs in the background worker, results applied, new turn starts.

This will make the game fully playable and structured like a proper 4X strategy game.
