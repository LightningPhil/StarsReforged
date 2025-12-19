# Project Requirements Document: "STARS // OMEGA FRAMEWORK" - The Full Game

**Version:** 1.0 (Alpha)  
**Date:** October 26, 2023  
**Author:** AI (via Codex)  
**Project Lead:** User

This document outlines the complete feature set, technical architecture, and implementation plan for a full-fledged implementation of the "STARS // OMEGA FRAMEWORK" 4X strategy game, built as a web application using HTML, CSS, and JavaScript. This PRD will be the guide for iterative development, with each phase building upon the last to deliver a fully functional game.

## 1. Project Goals

- Deliver a faithful digital adaptation of the core Stars! gameplay loop within a modern, intuitive user interface.
- Implement a visually compelling and consistent "Grungy Tron" aesthetic, reflecting the provided artistic direction.
- Create a modular, extensible codebase to support future expansions and gameplay additions.
- Utilize best practices for web development to ensure performance, maintainability, and accessibility.
- Operate as a standalone, fully functional web application without external dependencies (beyond those already provided).

## 2. Target Audience

- Fans of the original Stars! game and the 4X genre.
- Players interested in a challenging and strategic gameplay experience.
- Web developers and enthusiasts looking to learn and explore game development using web technologies.

## 3. Technical Design

### 3.1. Architecture

The game will be built using a modular, object-oriented approach, leveraging JavaScript's capabilities to organize code into logical components.

**Data Layer**

- **Game Object:** The central hub, holding the entire game state (turn count, resources, star systems, fleets, etc.).
- **Data Structures:** Classes to define game objects and their properties:
  - **Star:** Stores star properties (name, coordinates, owner, minerals, defenses).
  - **Fleet:** Represents a fleet of ships, including their design, fuel, and movement.
  - **ShipDesign:** Defines ship characteristics (hull, engines, weapons, special modules).
  - **Minefield:** Stores the position and extent of minefields.
  - **ResourcePacket:** Represents a unit of minerals in transit.
  - **Message:** Holds text messages for communications.
  - **Race:** Defines the unique traits of the player.
- **Data Lists:** Arrays and objects to efficiently manage collections of game objects (e.g., `Game.stars`, `Game.fleets`).

**Logic Layer**

- **Game Methods:** Core game logic methods to handle:
  - `init()`: Initializes the game state.
  - `turn()`: Advances the game turn. This is the heart of the game and handles all turn-based events.
  - `handleArrival(fleet)`: Manages events when fleets arrive.
  - `buildComplete(star, shipDesign)`: Handles ship completion.
  - `saveDesign(design)`: Saves a new ship blueprint.
  - `logMsg(text, sender)`: Logs messages to the communication system.
  - `generateCombat(attacker, defender)`: Triggers combat simulation, generates and stores the battle log.
  - `scanSector(star)`: Conducts a sector scan with the range based on tech level.
  - `placeMinefield(fleet, range)`: Places a minefield at current location, with a range based on tech level.
- **Input Handlers:** Methods that respond to user input (e.g., clicks, right-clicks, and keyboard inputs).
- **AI (Placeholder/Future):** Functions to implement AI behavior for enemy races (expansion, ship building, combat).

**Presentation Layer**

- **Renderer Object:** Responsible for rendering the game elements to the `<canvas>`.
  - `init()`: Sets up the canvas and event listeners.
  - `draw()`: The main rendering loop that draws stars, fleets, minefields, and other visual elements.
  - `resize()`: Handles screen resizing.
  - `worldToScreen(x, y)` & `screenToWorld(x,y)`: Converts between world coordinates and screen coordinates for camera controls and interaction.
- **UI Object:** Manages the user interface elements and displays game information.
  - `init()`: Initializes the UI elements (setting up menus, buttons, and panels).
  - `setScreen(screenId)`: Switches between the different screens (Empire, Map, Research, Design, Comms).
  - `updateHeader()`: Updates the header with current resources, year etc.
  - `updateEmpire()`: Updates the empire panel with data like the population.
  - `updateComms()`: Refreshes the communication log.
  - `renderTech()`: Dynamically renders tech tree panel.
  - `popDropdowns()`: Fill the dropdowns in the ship design screen.
  - `updateSide()`: Renders the context panel with data about selected elements.
- **Camera Object:** For Camera functionality:
  - `x`: Camera X-coordinate.
  - `y`: Camera Y-coordinate.
  - `zoom`: Zoom Level.
  - `dirty`: Flag to tell render loop to update the scene.

### 3.2. Technologies

- **HTML:** For the game's structure and markup.
- **CSS:** For styling and the "Grungy Tron" visual effects (gradients, animations, etc.)
- **JavaScript:** For game logic, interactivity, and canvas rendering.

### 3.3. Assets

- No external image assets are required initially. All graphics will be generated through CSS and JavaScript (vector graphics).
- Sound effects (Placeholder; future expansion): Minimal sound effects can be included in future phases.

### 3.4. Source Control

- The project will be stored in a public GitHub repository.
- Each phase will be implemented as a separate commit, with detailed commit messages documenting the changes.

## 4. Feature Breakdown and Implementation Plan

This project will be developed in distinct phases, with each phase building upon the previous one to incrementally add functionality and complexity.

### Phase 1: Core Gameplay Loop and Basic Rendering (Completed)

**Objective:** Establish the foundational game loop and basic rendering infrastructure.

**Tasks:**

- **Game Object Setup:** Define the Game, Star, and Fleet objects.
- **Galaxy Generation:** Implement a procedural galaxy generation algorithm to create stars with random positions and properties.
- **Basic Rendering:** Render the star map using `<canvas>`. Display stars as basic shapes.
- **UI Initialization:** Create basic UI elements (header, sidebar, and footer) and structure the layout.
- **Turn Generation:** Implement a basic turn-based system.
- **Input Handling:** Handle user clicks for star selection and fleet movement.
- **Message Logging:** Basic logging implemented.

**Deliverables:**

- Functional game with basic map rendering, star selection, fleet movement, and turn progression.

### Phase 2: Fog of War, Visibility, and Enhanced Rendering

**Objective:** Improve the visual fidelity of the game and implement the Fog of War system.

**Tasks:**

- **Visibility System:** Implement the Fog of War, using a scanning radius, based on ships and/or starbases.
- **Dynamic Rendering:** Refactor the Renderer to draw only visible stars and fleets.
- **Scanner Visualization:** Draw the scanner ranges.
- **UI Improvements:** Implement the UI for the selected star.
- **More Realistic Fleet Movement:** Implement movement with fuel consumption and ship design.
- **Parallax Background:** implement an animated background.

**Deliverables:**

- Functional Fog of War.
- Improved map rendering.
- Implemented ship movement with fuel management and movement with speed.

### Phase 3: Tech Tree and Ship Design

**Objective:** Introduce the research system and the ship design system.

**Tasks:**

- **Tech Tree Implementation:**
  - Create a TECH data structure defining technology levels and costs.
  - Implement the UI for the tech tree.
  - Implement the research system, allowing the player to spend credits to advance technologies.
- **Ship Design Implementation:**
  - Create the data structures for ship blueprints (Hulls, Engines, Weapons, Special Modules).
  - Implement the ship design UI (hull selection, engine selection, weapon selection).
  - Allow the player to save custom ship designs.
  - Update the ship creation logic to create ships based on saved designs.

**Deliverables:**

- Functional research screen.
- Functional ship design system.

### Phase 4: Combat and Planetary Management

**Objective:** Implement planetary management, building queues and basic combat.

**Tasks:**

- **Planetary Management:**
  - Implement building queues.
  - Planetary income calculations and resource allocation.
- **Combat Placeholder:**
  - Create basic battle log.
  - Include weapons and damage calculation.

**Deliverables:**

- Planetary resource management.
- Building construction and queues.
- Placeholder combat system.

### Phase 5: Refinement and Polish

**Objective:** Improve the game's usability, visual appeal, and balance.

**Tasks:**

- **UI Polish:** Refine the UI layout and elements.
- **Balance:** Adjust game parameters.
- **Bug fixes:** Fix any bugs.
- **Performance Optimization:** Address performance bottlenecks.

**Deliverables:**

- Polished game.
- Improved visual effects.
- Balanced gameplay.
- Optimized performance.

### Phase 6: Further Extensions

**Objective:** Further Expand on the current game.

**Tasks:**

- **Diplomacy:** Implement basic diplomacy system.
- **AI:** Create the rudimentary AI system.

**Deliverables:**

- Diplomacy system.
- AI System.

## 5. Detailed Implementation - Code-Level Breakdown

This section provides a detailed breakdown of the core functionality to be implemented within each phase.

### Phase 1: Core Gameplay Loop and Basic Rendering

**Data Layer**

**Star Class:**

- `id`: Unique star identifier (integer).
- `x`, `y`: Star coordinates (float).
- `name`: Star name (string, e.g., "S-123").
- `owner`: Player ID (integer) or null if unclaimed.
- `pop`: Population on the planet (integer).
- `mins`: An object containing mineral percentages (`i`: Ironium, `b`: Boranium, `g`: Germanium; all integers 0-100).
- `def`: Object to contain planet defense: mines, factories, and a starbase.
- `queue`: Object to store the currently built ships.

**Fleet Class:**

- `id`: Unique fleet identifier.
- `owner`: Player ID.
- `x`, `y`: Fleet coordinates (float).
- `name`: Fleet name.
- `design`: A ship design object.
- `fuel`: Fleet fuel.
- `dest`: Destination (object with `x`, `y` coordinates).

**ShipDesign Class:**

- `name`: name of the ship.
- `hull`: Defines the hull class.
- `engine`: Defines the engine.
- `wep`: Defines the weapon.
- `spec`: Defines the special.

**Game Object:**

- `year`: Current game year (float).
- `credits`: Player's credits (integer).
- `minerals`: Player's total minerals (integer).
- `stars`: Array of Star objects.
- `fleets`: Array of Fleet objects.
- `designs`: Array of ship designs.
- `selection`: Currently selected object (object: `{type: 'star'|'fleet', id: index}` or null).
- `messages`: Array of message strings.
- `research`: Object containing research states.
- `activeScanners`: array of scanners.
- `init()`:
  - Initializes the game state, generating a galaxy.
  - Create a homeworld, populate with resources and population.
  - Create one or more starting fleets.
  - Call UI to initialize.
- `turn()`:
  - Increments year.
  - Iterates through fleets to handle movement.
  - Handles planet resource production (placeholder for now).
  - Handles fleet arrivals by calling `handleArrival()`.
  - Random events can be triggered here.
  - Call UI to refresh.
- `handleArrival(fleet)`:
  - Checks if a fleet has arrived at a Star.
  - If so, and the star is not owned, attempts to colonize it.
  - If there's a battle, initiate a combat cycle.
- `saveDesign()`:
  - Saves the ship's current design.
- `logMsg(text, sender)`:
  - Logs the messages to the communication system.

**Galaxy Generation**

- Implement a function to generate stars with random positions and properties (name, mins).

**Fleet Initialisation**

- Implement Fleet Initialisation logic.

**UI.setScreen()**

- Make active screen visible and inactive screen hide.

**UI.updateHeader()**

- Update g-year, g-cred, g-metal properties

**UI.updateComms()**

- Update the Comms logs.

**Logic Layer**

**Fleet Movement**

- Implement basic fleet movement logic: fleet moves to the destination.
- Handle fleet arrivals using the `handleArrival()` method.
- Implement a basic minefield.

**Input Handling**

- Handle mouse clicks (left and right) to select stars and order fleet movement.
- Handle scroll to zoom.
- Handle drag to pan.

**Presentation Layer**

**Renderer Object**

- `init()`:
  - Gets the canvas context.
  - Sets up event listeners for input (clicks, zoom, and panning).
- `draw()`:
  - Clears the canvas.
  - Draws the star map (basic shapes for stars).
  - Draws the fleets (basic shapes for fleets).
  - Draws the scanner circles.
- `resize()`:
  - Resizes the canvas to match the container's dimensions.
  - Updates the camera parameters as needed.

**UI Object**

- `init()`:
  - Gets references to the UI elements.
  - Sets up event listeners for the buttons.
  - Initializes the game's UI.
- `updateSide()`:
  - Set the context for the selected element (Star or Fleet).
- `log(message)`:
  - Logs the message in the system log.
  - Append all messages with a `>` prefix.

### Phase 2: Fog of War, Visibility, and Enhanced Rendering

**Data Layer**

**Star Class (Enhanced):**

- `visible`: Boolean, indicates if the star is currently visible.
- `known`: Boolean, indicates if the star has ever been seen.
- `snapshot`: Object containing the last known data about the star (owner, population, etc.) when it was last visible (for displaying ghost data).

**Game Object (Enhanced):**

- `activeScanners`: An array storing the active scanners (stars, fleets) and their ranges.
- `updateVisibility()`:
  - Iterates over all stars and sets their visible status based on scanner range.
  - Update the snapshot.

**Logic Layer**

**Fog of War Implementation**

- Implement the logic to determine if a star is visible based on scanner range. Scanner range is a property of the ship's design.

**Fleet Movement (Fuel)**

- Implement basic fuel consumption.

**Presentation Layer**

**Renderer Object (Enhanced)**

- Modify `draw()` to:
  - Draw only visible stars.
  - Implement a "ghost" rendering effect for known but not currently visible stars (using the snapshot data and a faded color).
  - Draw the scanner range.
  - Draw vector-based ships.
  - Implement background rendering with the animated Hex-Grid effect.

### Phase 3: Tech Tree and Ship Design

**Data Layer**

**TECH Structure**

- An object containing tech data:
  - `name`: Name of the tech.
  - `lvl`: Current Level.
  - `desc`: Description.

**DB.techs Structure**

- A list of all tech's.

**DB.hulls, DB.engines, DB.weapons, DB.specials Structure**

- A list of all components.

**Game.blueprints Structure**

- A list of all ship blueprints.

**Game.researchField**

- To keep track of what technology is active.

**Game.research.progress**

- To keep track of the research.

**Game Object (Enhanced)**

- `research`: Object to hold research progress and current level.
- `blueprints`: An array to store ship blueprints (objects with hull, engine, weapon, special module properties).
- `saveDesign(design)`: Saves a new ship design to the designs array.
- `queueBuild(bpIndex)`: Adds the unit in the queue.
- `spawnShip(star, blueprint)`: Adds a ship to the game, when a ship is built.

**ShipDesign Class (Example)**

- `hull`: The hull ID.
- `engine`: The engine ID.
- `weapon`: The weapon ID.
- `special`: The special module.
- `cost`: Total cost.
- `range`: Calculated range (Engine + Scanner).
- `speed`: Calculated speed (Engine, Hull, Mass).

**Logic Layer**

**Research Implementation**

- Implement research costs for different technology levels.

**Fleet Movement (Fuel)**

- Implement basic fuel consumption.

**Ship Design and Building**

- Implement the ship design UI.
- Implement a building queue.

**Presentation Layer**

**UI Object (Enhanced)**

- Implement the UI for tech screen.
- Implement the UI for ship design screen.
- Implement a UI for build queues.

### Phase 4: Combat and Planetary Management

**Data Layer**

**Game Object (Enhanced)**

- `buildComplete(star, blueprint)`: Adds ship to fleet.
- `handleArrival(fleet)`: Adds colonization logic.
- `generateCombat()`: Generates battle log.

**Star (Enhanced)**

- `def`: Planetary Defenses.

**Fleet (Enhanced)**

- `hp`: HP.

**Logic Layer**

- Implement building queues.
- Implement planetary income and resource allocation.
- Placeholder combat.
- Create basic battle log.
- Include weapons and damage calculation.
- Create weapon system and calculations.
- Deploy minefields.

**Presentation Layer**

**UI (Enhanced)**

- Implement a planetary management UI.
- Display construction queues.
- Implement a UI for the battle log.

### Phase 5: Refinement and Polish

**Tasks**

- **UI Polish:** Refine the UI layout and elements.
- **Balance:** Adjust game parameters.
- **Bug fixes:** Fix any bugs.
- **Performance Optimization:** Address performance bottlenecks.

**Deliverables**

- Polished game.
- Improved visual effects.
- Balanced gameplay.
- Optimized performance.

### Phase 6: Further Extensions

**Data Layer**

**Game Object (Enhanced)**

- Diplomacy status.
- Race traits.

**Message Object**

- Sender.
- Recipient.
- Text.
- Turn.
- Priority.

**Logic Layer**

- Diplomacy:
  - Implement basic diplomacy.
  - Create a way to send and receive messages.
  - Create the rudamentary AI system.

**Presentation Layer**

**UI (Enhanced)**

- Add a comms tab to handle incoming and outgoing messages.
- Implement the battle VCR.

## 6. GitHub Repository and Development Process

- **Repository Setup:** Create a public GitHub repository named "stars-reforged".
- **Initial Commit:** Commit the initial `index.html` file with the basic framework (skeleton).
- **Branching Strategy:** Use feature branches for each phase to keep the main branch stable. Create branches for each major feature implementation (e.g., `feature/fog-of-war`, `feature/tech-tree`).
- **Code Comments:** Add detailed comments to the code to explain the logic and purpose of each function and data structure.
- **Commit Messages:** Write descriptive commit messages that summarize the changes made in each commit.
- **Pull Requests:** Create pull requests for each completed phase to merge the feature branches into the main branch.
- **Testing:** Test each phase of development thoroughly to ensure the functionality works as expected.

## 7. Open-Source License

This project will be released under the MIT License or similar permissive license.

## 8. Further Considerations and Future Enhancements

- Multiplayer: Expand the code for multiplayer support.
- AI Improvements: Improve AI to make the game more engaging.
- Sound Effects: Add sound effects and music.
- More Ship Designs: Implement a full ship design system.
- More Game Mechanics: More mineral and resource management.
- Victory Conditions: Implement victory conditions to end the game.
