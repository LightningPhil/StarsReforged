export class TechnologyField {
    constructor(id, level = 1, storedRP = 0) {
        this.id = id;
        this.level = level;
        this.storedRP = storedRP;
    }
}

export const COMPONENTS = {
    engines: [
        {
            id: "ion_drive",
            name: "Ion Drive",
            slotType: "engine",
            mass: 18,
            cost: 40,
            powerOutput: 8,
            powerUsage: 0,
            effects: { speed: 9, range: 180, fuel: 20 }
        },
        {
            id: "fusion_burn",
            name: "Fusion Burner",
            slotType: "engine",
            mass: 32,
            cost: 120,
            powerOutput: 14,
            powerUsage: 0,
            effects: { speed: 14, range: 240, fuel: 40, initiative: 1 }
        },
        {
            id: "quantum_surge",
            name: "Quantum Surge",
            slotType: "engine",
            mass: 46,
            cost: 240,
            powerOutput: 20,
            powerUsage: 0,
            effects: { speed: 20, range: 320, fuel: 80, initiative: 2 }
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
            effects: { attack: 18 }
        },
        {
            id: "plasma_lance",
            name: "Plasma Lance",
            slotType: "weapon",
            mass: 24,
            cost: 90,
            powerUsage: 7,
            effects: { attack: 40 }
        },
        {
            id: "nova_driver",
            name: "Nova Driver",
            slotType: "weapon",
            mass: 36,
            cost: 160,
            powerUsage: 10,
            effects: { attack: 75 }
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
            effects: { defense: 12 }
        },
        {
            id: "scanner_array",
            name: "Scanner Array",
            slotType: "utility",
            mass: 10,
            cost: 40,
            powerUsage: 3,
            effects: { range: 80 }
        },
        {
            id: "reactor_core",
            name: "Reactor Core",
            slotType: "utility",
            mass: 16,
            cost: 70,
            powerOutput: 12,
            powerUsage: 0,
            effects: {}
        },
        {
            id: "colony_pod",
            name: "Colony Pod",
            slotType: "utility",
            mass: 24,
            cost: 120,
            powerUsage: 2,
            effects: { flags: ["colonize"] }
        },
        {
            id: "minelayer_rig",
            name: "Minelayer Rig",
            slotType: "utility",
            mass: 22,
            cost: 110,
            powerUsage: 4,
            effects: { mineUnits: 80, flags: ["minelayer"] }
        },
        {
            id: "armor_plating",
            name: "Armor Plating",
            slotType: "utility",
            mass: 20,
            cost: 55,
            powerUsage: 0,
            effects: { armor: 30, structure: 10 }
        }
    ]
};

const ALL_COMPONENTS = [
    ...COMPONENTS.engines,
    ...COMPONENTS.weapons,
    ...COMPONENTS.utilities
];

export const getComponentById = (id) => ALL_COMPONENTS.find(component => component.id === id);

export const getComponentsBySlot = (slotType) => ALL_COMPONENTS.filter(component => component.slotType === slotType);

export const listAllComponents = () => ALL_COMPONENTS.slice();
