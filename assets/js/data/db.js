export const DB = {
    techs: [
        { id: "WEAP", name: "Weapons", desc: "Offensive systems and targeting.", baseCost: 500 },
        { id: "PROP", name: "Propulsion", desc: "Engines, fuel, and range.", baseCost: 450 },
        { id: "CONST", name: "Construction", desc: "Hull materials and industry.", baseCost: 420 },
        { id: "ELEC", name: "Electronics", desc: "Sensors, automation, and computers.", baseCost: 380 },
        { id: "ENER", name: "Energy", desc: "Reactors, shields, and power systems.", baseCost: 400 },
        { id: "BIOT", name: "Biotechnology", desc: "Life support and terraforming.", baseCost: 460 },
        { id: "TERR", name: "Terraforming", desc: "Planetary engineering.", baseCost: 440 }
    ],
    hulls: [
        {
            id: "scout",
            name: "Scout",
            baseMass: 40,
            maxMass: 90,
            armor: 25,
            structure: 60,
            baseFuel: 70,
            baseCargo: 10,
            baseInitiative: 6,
            baseSpeed: 6,
            baseRange: 120,
            speedMassFactor: 140,
            fuelRangeFactor: 12,
            signature: 4,
            scanner: 120,
            camo: 12,
            cost: 50,
            tech: { CONST: 1 },
            slotLayout: { engine: 1, weapon: 1, utility: 1 }
        },
        {
            id: "frigate",
            name: "Frigate",
            baseMass: 80,
            maxMass: 160,
            armor: 60,
            structure: 110,
            baseFuel: 110,
            baseCargo: 20,
            baseInitiative: 5,
            baseSpeed: 5,
            baseRange: 130,
            speedMassFactor: 150,
            fuelRangeFactor: 12,
            signature: 6,
            scanner: 130,
            camo: 10,
            cost: 140,
            tech: { CONST: 1 },
            slotLayout: { engine: 1, weapon: 1, utility: 2 }
        },
        {
            id: "destroyer",
            name: "Destroyer",
            baseMass: 140,
            maxMass: 260,
            armor: 110,
            structure: 200,
            baseFuel: 160,
            baseCargo: 30,
            baseInitiative: 4,
            baseSpeed: 4,
            baseRange: 140,
            speedMassFactor: 165,
            fuelRangeFactor: 14,
            signature: 8,
            scanner: 140,
            camo: 8,
            cost: 280,
            tech: { CONST: 2 },
            slotLayout: { engine: 1, weapon: 2, utility: 2 }
        },
        {
            id: "cruiser",
            name: "Cruiser",
            baseMass: 220,
            maxMass: 400,
            armor: 180,
            structure: 320,
            baseFuel: 220,
            baseCargo: 45,
            baseInitiative: 3,
            baseSpeed: 3,
            baseRange: 150,
            speedMassFactor: 180,
            fuelRangeFactor: 15,
            signature: 10,
            scanner: 150,
            camo: 6,
            cost: 520,
            tech: { CONST: 3 },
            slotLayout: { engine: 1, weapon: 3, utility: 2 }
        },
        {
            id: "battleship",
            name: "Battleship",
            baseMass: 360,
            maxMass: 680,
            armor: 320,
            structure: 520,
            baseFuel: 300,
            baseCargo: 70,
            baseInitiative: 2,
            baseSpeed: 2,
            baseRange: 160,
            speedMassFactor: 200,
            fuelRangeFactor: 16,
            signature: 14,
            scanner: 160,
            camo: 4,
            cost: 980,
            tech: { CONST: 4 },
            slotLayout: { engine: 1, weapon: 4, utility: 3 }
        }
    ],
    components: {
        engines: [
            {
                id: "ion_drive",
                name: "Ion Drive",
                slotType: "engine",
                mass: 18,
                cost: 40,
                powerOutput: 8,
                powerUsage: 0,
                stats: { speed: 9, range: 180, fuel: 20 },
                tech: { PROP: 1 }
            },
            {
                id: "fusion_burn",
                name: "Fusion Burner",
                slotType: "engine",
                mass: 32,
                cost: 120,
                powerOutput: 14,
                powerUsage: 0,
                stats: { speed: 14, range: 240, fuel: 40, initiative: 1 },
                tech: { PROP: 3 }
            },
            {
                id: "quantum_surge",
                name: "Quantum Surge",
                slotType: "engine",
                mass: 46,
                cost: 240,
                powerOutput: 20,
                powerUsage: 0,
                stats: { speed: 20, range: 320, fuel: 60, initiative: 2 },
                tech: { PROP: 5 }
            },
            {
                id: "warp_shear",
                name: "Warp Shear",
                slotType: "engine",
                mass: 58,
                cost: 360,
                powerOutput: 26,
                powerUsage: 0,
                stats: { speed: 26, range: 400, fuel: 90, initiative: 3 },
                tech: { PROP: 7 }
            }
        ],
        weapons: [
            {
                id: "laser_array",
                name: "X-Ray Laser",
                slotType: "weapon",
                mass: 12,
                cost: 30,
                powerUsage: 4,
                stats: { beamDamage: 18, beamRange: 1, gattling: 1 },
                tech: { WEAP: 1 }
            },
            {
                id: "mass_driver",
                name: "Mass Driver",
                slotType: "weapon",
                mass: 18,
                cost: 55,
                powerUsage: 5,
                stats: { torpedoDamage: 28, torpedoRange: 2, gattling: 2, bombing: 3 },
                tech: { WEAP: 2 }
            },
            {
                id: "plasma_lance",
                name: "Plasma Lance",
                slotType: "weapon",
                mass: 24,
                cost: 90,
                powerUsage: 7,
                stats: { beamDamage: 40, beamRange: 1, sapper: 0.1 },
                tech: { WEAP: 3 }
            },
            {
                id: "nova_driver",
                name: "Nova Driver",
                slotType: "weapon",
                mass: 36,
                cost: 160,
                powerUsage: 10,
                stats: { torpedoDamage: 75, torpedoRange: 3, bombing: 8 },
                tech: { WEAP: 5 }
            },
            {
                id: "singularity_cannon",
                name: "Singularity Cannon",
                slotType: "weapon",
                mass: 48,
                cost: 260,
                powerUsage: 14,
                stats: { beamDamage: 110, beamRange: 2, sapper: 0.25, initiative: -1 },
                tech: { WEAP: 7 }
            }
        ],
        utilities: [
            {
                id: "shield_array",
                name: "Shield Array",
                slotType: "utility",
                mass: 14,
                cost: 60,
                powerUsage: 6,
                stats: { defense: 12, shields: 18 },
                tech: { ENER: 2 }
            },
            {
                id: "deflector_screen",
                name: "Deflector Screen",
                slotType: "utility",
                mass: 20,
                cost: 110,
                powerUsage: 8,
                stats: { defense: 20, shields: 30 },
                tech: { ENER: 4 }
            },
            {
                id: "scanner_array",
                name: "Scanner Array",
                slotType: "utility",
                mass: 10,
                cost: 40,
                powerUsage: 3,
                stats: { range: 80, scanner: 80, initiative: 1 },
                tech: { ELEC: 1 }
            },
            {
                id: "battle_computer",
                name: "Battle Computer",
                slotType: "utility",
                mass: 12,
                cost: 70,
                powerUsage: 4,
                stats: { targeting: 8, initiative: 1 },
                tech: { ELEC: 3 }
            },
            {
                id: "reactor_core",
                name: "Reactor Core",
                slotType: "utility",
                mass: 16,
                cost: 70,
                powerOutput: 12,
                powerUsage: 0,
                stats: {},
                tech: { ENER: 1 }
            },
            {
                id: "colony_pod",
                name: "Colony Pod",
                slotType: "utility",
                mass: 24,
                cost: 120,
                powerUsage: 2,
                stats: { cargo: 60 },
                flags: ["colonize"],
                tech: { BIOT: 1 }
            },
            {
                id: "minelayer_rig",
                name: "Minelayer Rig",
                slotType: "utility",
                mass: 22,
                cost: 110,
                powerUsage: 4,
                stats: { mineCapacity: 80 },
                flags: ["minelayer"],
                tech: { WEAP: 3 }
            },
            {
                id: "armor_plating",
                name: "Armor Plating",
                slotType: "utility",
                mass: 20,
                cost: 55,
                powerUsage: 0,
                stats: { armor: 30, structure: 10, defense: 4 },
                tech: { CONST: 1 }
            },
            {
                id: "reinforced_bulkhead",
                name: "Reinforced Bulkhead",
                slotType: "utility",
                mass: 28,
                cost: 90,
                powerUsage: 0,
                stats: { armor: 45, structure: 20, defense: 6 },
                tech: { CONST: 4 }
            },
            {
                id: "cargo_bay",
                name: "Cargo Bay",
                slotType: "utility",
                mass: 16,
                cost: 35,
                powerUsage: 0,
                stats: { cargo: 40 },
                tech: { CONST: 1 }
            },
            {
                id: "fuel_pod",
                name: "Fuel Pod",
                slotType: "utility",
                mass: 18,
                cost: 45,
                powerUsage: 0,
                stats: { fuel: 60 },
                tech: { PROP: 2 }
            },
            {
                id: "psionic_shield",
                name: "Psionic Shield",
                slotType: "utility",
                mass: 18,
                cost: 140,
                powerUsage: 6,
                stats: { defense: 18, shields: 26, initiative: 2, camo: 12 },
                tech: { ENER: 5, ELEC: 4 },
                requiresTraits: ["psionic_innovators"]
            }
        ]
    },
    structures: {
        mine: { name: "Mine", cost: 6 },
        factory: { name: "Factory", cost: 8 },
        base: { name: "Starbase", cost: 600 }
    }
};
