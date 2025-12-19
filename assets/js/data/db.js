export const DB = {
    techs: [
        { id: 0, name: 'Energy', desc: 'Power generation, shields, and scanners.', baseCost: 400 },
        { id: 1, name: 'Weapons', desc: 'Offensive systems and targeting.', baseCost: 500 },
        { id: 2, name: 'Propulsion', desc: 'Engines, fuel, and range.', baseCost: 450 },
        { id: 3, name: 'Construction', desc: 'Factories, hulls, and industry.', baseCost: 420 },
        { id: 4, name: 'Electronics', desc: 'Sensors, automation, AI.', baseCost: 380 },
        { id: 5, name: 'Biotech', desc: 'Population growth and terraforming.', baseCost: 460 }
    ],
    hulls: [
        { id: 'scout', name: 'Scout', cost: 20, mass: 10, slots: 2, baseFuel: 80 },
        { id: 'frig', name: 'Frigate', cost: 120, mass: 60, slots: 4, baseFuel: 200 },
        { id: 'dest', name: 'Destroyer', cost: 250, mass: 120, slots: 6, baseFuel: 350 },
        { id: 'cru', name: 'Cruiser', cost: 600, mass: 300, slots: 8, baseFuel: 600 },
        { id: 'bb', name: 'Battleship', cost: 1500, mass: 900, slots: 12, baseFuel: 1200 }
    ],
    engines: [
        { id: 'std', name: 'Std. Drive', cost: 10, power: 5, fuelUse: 1.0, scan: 180 },
        { id: 'hydro', name: 'Hydro-Ram', cost: 50, power: 8, fuelUse: 1.2, scan: 230 },
        { id: 'fusion', name: 'Fusion Pulse', cost: 150, power: 12, fuelUse: 0.8, scan: 280 }
    ],
    weapons: [
        { id: 'none', name: 'None', cost: 0, dmg: 0 },
        { id: 'laser', name: 'X-Ray Laser', cost: 20, dmg: 15 },
        { id: 'torp', name: 'Alpha Torp', cost: 40, dmg: 40 },
        { id: 'plas', name: 'Plasma Bolt', cost: 120, dmg: 100 }
    ],
    specials: [
        { id: 'none', name: 'None', cost: 0, mass: 0 },
        { id: 'col', name: 'Colony Module', cost: 200, mass: 50, flags: ['colonize'] },
        { id: 'mine', name: 'Mine Layer', cost: 100, mass: 20, flags: ['minelayer'] },
        { id: 'driver', name: 'Mass Driver', cost: 300, mass: 100, flags: ['driver'] }
    ],
    structures: {
        mine: { name: 'Mine', cost: 6 },
        factory: { name: 'Factory', cost: 8 },
        base: { name: 'Starbase', cost: 600 }
    }
};
