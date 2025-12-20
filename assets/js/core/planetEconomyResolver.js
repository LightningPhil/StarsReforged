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

const isAlternateReality = (race) => {
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

const ensureMineralsForProgress = (stock, ratios, progress) => {
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
            const convertible = Math.min(adjusted[donor], deficit * MINERAL_ALCHEMY_RATE);
            const gained = Math.floor(convertible / MINERAL_ALCHEMY_RATE);
            if (gained <= 0) {
                return;
            }
            adjusted[donor] -= gained * MINERAL_ALCHEMY_RATE;
            adjusted[type] += gained;
            deficit -= gained;
        });
    });
    const hasEnough = types.every(type => adjusted[type] >= required[type]);
    return { hasEnough, required, adjusted };
};

const applyTerraforming = (star, techModifiers) => {
    if (!star.terraforming?.active || !star.terraforming?.target) {
        return;
    }
    const rate = Math.max(1, Math.floor((techModifiers?.habitabilityTolerance || 0) * 10) + 1);
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

const resolveQueue = ({ state, star, productionPoints }) => {
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
        result = ensureMineralsForProgress(economy.mineralStock, ratios, progress);
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
    const alternateReality = isAlternateReality(state.race);
    state.stars
        .filter(star => star.owner)
        .sort((a, b) => a.id - b.id)
        .forEach(star => {
            normalizeStarEconomy(star);
            const techModifiers = getTechnologyModifiers(getTechnologyStateForEmpire(state, star.owner));
            applyTerraforming(star, techModifiers);
            const habitabilityScore = getHabitabilityScore({ star, race: state.race, techModifiers });
            star.habitability = Math.round(habitabilityScore * 100);
            star.deathRate = habitabilityScore >= 0.5 ? 0 : Math.round((0.5 - habitabilityScore) * 200);
            const maxPopulation = Math.max(2500, Math.floor(BASE_MAX_POP * (0.2 + habitabilityScore * 0.8)));
            if (habitabilityScore < 0.5) {
                const loss = Math.ceil(star.pop * (star.deathRate / 100));
                star.pop = Math.max(0, star.pop - loss);
            } else {
                const growthMultiplier = (techModifiers?.populationGrowth || 1) * (raceModifiers.populationGrowth || 1);
                const grown = Math.floor(star.pop * BASE_POP_GROWTH * growthMultiplier);
                star.pop = Math.min(maxPopulation, grown);
            }

            const popIncome = Math.floor(star.pop / POP_OUTPUT_DIVISOR);
            const productionPoints = Math.max(0, (alternateReality ? 0 : popIncome) + star.factories);

            const economy = state.economy?.[star.owner];
            if (!economy) {
                return;
            }

            const resources = (alternateReality ? star.factories : popIncome + star.factories);
            if (star.owner === 1) {
                taxTotal += popIncome;
                industrialOutput += productionPoints;
            }
            economy.credits += resources;

            const iGain = Math.floor((star.mines * star.concentration.i) / MINE_OUTPUT_DIVISOR);
            const bGain = Math.floor((star.mines * star.concentration.b) / MINE_OUTPUT_DIVISOR);
            const gGain = Math.floor((star.mines * star.concentration.g) / MINE_OUTPUT_DIVISOR);

            economy.mineralStock.i += iGain;
            economy.mineralStock.b += bGain;
            economy.mineralStock.g += gGain;

            const depletionScale = 0.05;
            star.concentration.i = Math.max(0, star.concentration.i - Math.ceil(iGain * depletionScale));
            star.concentration.b = Math.max(0, star.concentration.b - Math.ceil(bGain * depletionScale));
            star.concentration.g = Math.max(0, star.concentration.g - Math.ceil(gGain * depletionScale));

            resolveQueue({ state, star, productionPoints });

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
