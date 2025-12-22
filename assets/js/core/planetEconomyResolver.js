import { DB } from "../data/db.js";
import { Fleet } from "../models/entities.js";
import { getHabitabilityScore } from "./economyResolver.js";
import { resolveRaceModifiers } from "./raceTraits.js";
import { getTechnologyModifiers, getTechnologyStateForEmpire } from "./technologyResolver.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const BASE_MAX_POP = 1500000;
const BASE_POP_GROWTH = 1.02;
const POP_OUTPUT_DIVISOR = 1000;
const MINE_OUTPUT_DIVISOR = 120;
const MINERAL_ALCHEMY_RATE = 2;
const DEFAULT_MINERAL_RATIO = { i: 0.4, b: 0.3, g: 0.3 };

const normalizeStarEconomy = (star) => {
    if (!star.concentration) {
        star.concentration = { ...star.mins };
    }
    if (!Number.isFinite(star.factories)) {
        star.factories = star.def?.facts ?? 0;
    }
    if (!Number.isFinite(star.mines)) {
        star.mines = star.def?.mines ?? 0;
    }
    if (!star.terraforming) {
        star.terraforming = { active: false, target: null, progress: 0 };
    }
    if (!star.autoBuild) {
        star.autoBuild = null;
    }
};

const getPlanetSizeValue = (star) => {
    if (Number.isFinite(star.size)) {
        return star.size;
    }
    return 100;
};

const getMaxPopulationMultiplier = (race, raceModifiers) => {
    const baseMultiplier = raceModifiers?.maxPopulationMultiplier || 1;
    const primaryTrait = race?.primaryTrait;
    if (primaryTrait === "HE") {
        return (baseMultiplier / 1.15) * 0.5;
    }
    if (primaryTrait === "JOAT") {
        return baseMultiplier * 1.2;
    }
    return baseMultiplier;
};

const getMaxPopulation = (star, race, raceModifiers, alternateReality) => {
    if (alternateReality) {
        if (!star.def?.base) {
            return 0;
        }
        const baseHp = Number.isFinite(star.def.base?.hp) ? star.def.base.hp : 1000;
        return Math.max(0, Math.floor(baseHp * 100));
    }
    const planetSize = getPlanetSizeValue(star);
    const sizeScale = clamp(planetSize / 100, 0.1, 2);
    const traitMultiplier = getMaxPopulationMultiplier(race, raceModifiers);
    return Math.max(2500, Math.floor(BASE_MAX_POP * sizeScale * traitMultiplier));
};

const isAlternateReality = (race, raceModifiers) => {
    if (raceModifiers?.alternateReality) {
        return true;
    }
    const label = race?.type?.toLowerCase?.() || "";
    return label.includes("alternate reality") || label === "ar";
};

const getMineralRatios = (queue) => {
    if (queue?.mineralCost) {
        const total = (queue.mineralCost.i || 0) + (queue.mineralCost.b || 0) + (queue.mineralCost.g || 0);
        if (total > 0) {
            return {
                i: (queue.mineralCost.i || 0) / total,
                b: (queue.mineralCost.b || 0) / total,
                g: (queue.mineralCost.g || 0) / total
            };
        }
    }
    return { ...DEFAULT_MINERAL_RATIO };
};

const ensureMineralsForProgress = (stock, ratios, progress, alchemyRate = 0) => {
    const required = {
        i: Math.ceil(progress * ratios.i),
        b: Math.ceil(progress * ratios.b),
        g: Math.ceil(progress * ratios.g)
    };
    const adjusted = { ...stock };
    const types = ["i", "b", "g"];
    types.forEach(type => {
        let deficit = required[type] - adjusted[type];
        if (deficit <= 0) {
            return;
        }
        const donors = types.filter(entry => entry !== type);
        donors.forEach(donor => {
            if (deficit <= 0) {
                return;
            }
            if (adjusted[donor] <= 0) {
                return;
            }
            if (alchemyRate <= 0) {
                return;
            }
            const convertible = Math.min(adjusted[donor], deficit * alchemyRate);
            const gained = Math.floor(convertible / alchemyRate);
            if (gained <= 0) {
                return;
            }
            adjusted[donor] -= gained * alchemyRate;
            adjusted[type] += gained;
            deficit -= gained;
        });
    });
    const hasEnough = types.every(type => adjusted[type] >= required[type]);
    return { hasEnough, required, adjusted };
};

const applyTerraforming = (star, techModifiers, raceModifiers) => {
    if (!star.terraforming?.active || !star.terraforming?.target) {
        return;
    }
    const baseRate = Math.max(1, Math.floor((techModifiers?.habitabilityTolerance || 0) * 10) + 1);
    const rate = Math.max(1, Math.round(baseRate * (raceModifiers?.terraformingRateMultiplier || 1)));
    ["grav", "temp", "rad"].forEach(axis => {
        const target = star.terraforming.target?.[axis];
        if (!Number.isFinite(target)) {
            return;
        }
        const current = star.environment?.[axis] ?? 50;
        const delta = Math.sign(target - current) * Math.min(Math.abs(target - current), rate);
        star.environment[axis] = clamp(current + delta, 0, 100);
    });
    star.terraforming.progress = Math.min(100, (star.terraforming.progress || 0) + rate);
    if (star.terraforming.progress >= 100) {
        star.terraforming.active = false;
    }
};

const resolveQueue = ({ state, star, productionPoints, raceModifiers }) => {
    const economy = state.economy?.[star.owner];
    if (!economy) {
        return;
    }
    if (!star.queue && star.autoBuild) {
        const buildKind = star.autoBuild.kind;
        const count = Math.max(1, star.autoBuild.count || 1);
        const structure = DB.structures?.[buildKind];
        if (structure) {
            const cost = structure.cost * count;
            if (economy.credits >= cost) {
                economy.credits -= cost;
                star.queue = {
                    type: "structure",
                    kind: buildKind,
                    count,
                    cost,
                    done: 0,
                    owner: star.owner,
                    mineralCost: {
                        i: Math.ceil(cost * DEFAULT_MINERAL_RATIO.i),
                        b: Math.ceil(cost * DEFAULT_MINERAL_RATIO.b),
                        g: Math.ceil(cost * DEFAULT_MINERAL_RATIO.g)
                    }
                };
            }
        }
    }
    if (!star.queue) {
        return;
    }
    if (!star.queue.mineralCost && Number.isFinite(star.queue.cost)) {
        star.queue.mineralCost = {
            i: Math.ceil(star.queue.cost * DEFAULT_MINERAL_RATIO.i),
            b: Math.ceil(star.queue.cost * DEFAULT_MINERAL_RATIO.b),
            g: Math.ceil(star.queue.cost * DEFAULT_MINERAL_RATIO.g)
        };
    }
    const remaining = Math.max(0, star.queue.cost - star.queue.done);
    const desiredProgress = Math.min(productionPoints, remaining);
    if (desiredProgress <= 0) {
        return;
    }
    const ratios = getMineralRatios(star.queue);
    let progress = desiredProgress;
    let result = null;
    while (progress > 0) {
        result = ensureMineralsForProgress(economy.mineralStock, ratios, progress, raceModifiers?.mineralAlchemyRate || 0);
        if (result.hasEnough) {
            break;
        }
        progress -= 1;
    }
    if (!result || progress <= 0 || !result.hasEnough) {
        return;
    }
    economy.mineralStock = {
        i: result.adjusted.i - result.required.i,
        b: result.adjusted.b - result.required.b,
        g: result.adjusted.g - result.required.g
    };
    star.queue.done += progress;
    if (star.queue.done >= star.queue.cost) {
        if (star.queue.type === "ship") {
            const fleetId = state.nextFleetId++;
            state.fleets.push(new Fleet({
                id: fleetId,
                owner: star.queue.owner,
                x: star.x,
                y: star.y,
                name: `${star.queue.bp.name} ${fleetId}`,
                design: star.queue.bp
            }));
        } else if (star.queue.type === "structure") {
            if (star.queue.kind === "mine") {
                star.mines += star.queue.count;
            } else if (star.queue.kind === "factory") {
                star.factories += star.queue.count;
            } else if (star.queue.kind === "base") {
                star.def.base = { name: "Starbase I", hp: 1000 };
            }
        }
        star.queue = null;
    }
};

export const resolvePlanetEconomy = (state) => {
    let taxTotal = 0;
    let industrialOutput = 0;
    const raceModifiers = resolveRaceModifiers(state.race).modifiers;
    const alternateReality = isAlternateReality(state.race, raceModifiers);
    state.stars
        .filter(star => star.owner)
        .sort((a, b) => a.id - b.id)
        .forEach(star => {
            normalizeStarEconomy(star);
            const techModifiers = getTechnologyModifiers(getTechnologyStateForEmpire(state, star.owner));
            applyTerraforming(star, techModifiers, raceModifiers);
            const habitabilityValue = getHabitabilityScore({ star, race: state.race, techModifiers });
            star.habitability = Math.round(habitabilityValue);
            star.deathRate = habitabilityValue < 0 ? Math.round(Math.abs(habitabilityValue / 10) * 100) : 0;
            const maxPopulation = getMaxPopulation(star, state.race, raceModifiers, alternateReality);
            if (habitabilityValue < 0) {
                const losses = Math.floor(star.pop * (habitabilityValue / 10));
                star.pop = Math.max(0, Math.floor(star.pop + losses));
            } else if (star.pop < maxPopulation) {
                const growthMultiplier = (techModifiers?.populationGrowth || 1) * (raceModifiers.populationGrowth || 1);
                const habitabilityMultiplier = Math.max(0, habitabilityValue / 100);
                const grown = Math.floor(star.pop * BASE_POP_GROWTH * growthMultiplier * habitabilityMultiplier);
                star.pop = Math.min(maxPopulation, grown);
            }

            const crowdingRatio = maxPopulation > 0 ? star.pop / maxPopulation : (star.pop > 0 ? Infinity : 0);
            if (crowdingRatio >= 4) {
                const overcrowdingLoss = Math.floor(star.pop * 0.12);
                star.pop = Math.max(0, star.pop - overcrowdingLoss);
                star.deathRate = Math.max(star.deathRate, 12);
            }

            const popIncome = Math.floor(star.pop / POP_OUTPUT_DIVISOR);
            let productionMultiplier = 1;
            if (crowdingRatio >= 1 && crowdingRatio <= 3) {
                productionMultiplier = 0.5;
            } else if (crowdingRatio > 3) {
                productionMultiplier = 0;
            }
            const adjustedPopIncome = Math.floor(popIncome * productionMultiplier);
            const productionPoints = Math.max(0, (alternateReality ? 0 : adjustedPopIncome) + star.factories);

            const economy = state.economy?.[star.owner];
            if (!economy) {
                return;
            }

            const resources = (alternateReality ? star.factories : adjustedPopIncome + star.factories);
            if (star.owner === 1) {
                taxTotal += popIncome;
                industrialOutput += productionPoints;
            }
            economy.credits += resources;

            const miningMultiplier = raceModifiers.miningRateMultiplier || 1;
            const iGain = Math.floor((star.mines * star.concentration.i * miningMultiplier) / MINE_OUTPUT_DIVISOR);
            const bGain = Math.floor((star.mines * star.concentration.b * miningMultiplier) / MINE_OUTPUT_DIVISOR);
            const gGain = Math.floor((star.mines * star.concentration.g * miningMultiplier) / MINE_OUTPUT_DIVISOR);

            economy.mineralStock.i += iGain;
            economy.mineralStock.b += bGain;
            economy.mineralStock.g += gGain;

            const depletionScale = 0.05;
            star.concentration.i = Math.max(0, star.concentration.i - Math.ceil(iGain * depletionScale));
            star.concentration.b = Math.max(0, star.concentration.b - Math.ceil(bGain * depletionScale));
            star.concentration.g = Math.max(0, star.concentration.g - Math.ceil(gGain * depletionScale));

            resolveQueue({ state, star, productionPoints, raceModifiers });

            star.def.mines = star.mines;
            star.def.facts = star.factories;
        });

    Object.values(state.economy || {}).forEach(entry => {
        entry.minerals = entry.mineralStock.i + entry.mineralStock.b + entry.mineralStock.g;
    });
    const playerEconomy = state.economy?.[1];
    if (playerEconomy) {
        state.credits = playerEconomy.credits;
        state.mineralStock = { ...playerEconomy.mineralStock };
        state.minerals = playerEconomy.minerals;
    }
    state.empireCache = { taxTotal, industrialOutput };
};
