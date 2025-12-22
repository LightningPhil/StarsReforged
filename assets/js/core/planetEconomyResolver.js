import { DB } from "../data/db.js";
import { Fleet } from "../models/entities.js";
import { getHabitabilityScore } from "./economyResolver.js";
import { resolveRaceModifiers } from "./raceTraits.js";
import { getTechnologyModifiers, getTechnologyStateForEmpire } from "./technologyResolver.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const BASE_MAX_POP = 1000000;
const BASE_POP_GROWTH_RATE = 0.1;
const POP_OUTPUT_DIVISOR = 1000;
const BASE_MINING_RATE = 1;
const BASE_DEPLETION_YEARS = 12500;
const HOMEWORLD_DEPLETION_FLOOR = 30;
const STANDARD_DEPLETION_FLOOR = 1;
const DEFAULT_MINERAL_RATIO = { i: 0.4, b: 0.3, g: 0.3 };

const getRaceForEmpire = (state, empireId) => {
    const player = state.players?.find(entry => entry.id === empireId);
    return player?.race || state.race;
};

const normalizeStarEconomy = (star) => {
    if (!star.mins) {
        star.mins = { i: 0, b: 0, g: 0 };
    }
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
    if (!Array.isArray(star.queue)) {
        star.queue = star.queue ? [star.queue] : [];
    }
};

const getPlanetSizeValue = (star) => {
    if (Number.isFinite(star.size)) {
        return star.size;
    }
    return 100;
};

const isHomeworld = (star) => star?.id === 0 || star?.name === "HOMEWORLD";

const parseGrowthRate = (race) => {
    if (Number.isFinite(race?.growthRate)) {
        return Math.max(0, race.growthRate);
    }
    const raw = typeof race?.growth === "string" ? race.growth : "";
    const match = raw.match(/([+-]?\d+(?:\.\d+)?)%/);
    if (match) {
        return Math.max(0, parseFloat(match[1]) / 100);
    }
    return BASE_POP_GROWTH_RATE;
};

const getMaxPopulationMultiplier = (race, raceModifiers) => {
    const baseMultiplier = raceModifiers?.maxPopulationMultiplier || 1;
    const primaryTrait = race?.primaryTrait;
    if (primaryTrait === "HE") {
        return baseMultiplier * 0.5;
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

const ensureMineralsForProgress = (stock, ratios, progress, alchemyRate = 0, availableResources = 0) => {
    const required = {
        i: Math.ceil(progress * ratios.i),
        b: Math.ceil(progress * ratios.b),
        g: Math.ceil(progress * ratios.g)
    };
    const deficit = {
        i: Math.max(0, required.i - stock.i),
        b: Math.max(0, required.b - stock.b),
        g: Math.max(0, required.g - stock.g)
    };
    const totalDeficit = deficit.i + deficit.b + deficit.g;
    const alchemyCost = totalDeficit > 0 && alchemyRate > 0 ? totalDeficit * alchemyRate : 0;
    const totalResourceCost = progress + alchemyCost;
    const hasEnough = totalDeficit === 0
        ? progress <= availableResources
        : (alchemyRate > 0 && totalResourceCost <= availableResources);
    return { hasEnough, required, deficit, alchemyCost, totalResourceCost };
};

const getRaceEconomy = (race) => ({
    resPerColonist: race?.economy?.resPerColonist ?? POP_OUTPUT_DIVISOR,
    resPerFactory: race?.economy?.resPerFactory ?? 10,
    factoryCost: race?.economy?.factoryCost ?? 10,
    mineCost: race?.economy?.mineCost ?? 6,
    maxFactoriesPer10k: race?.economy?.maxFactoriesPer10k ?? 10,
    maxMinesPer10k: race?.economy?.maxMinesPer10k ?? 10,
    miningRate: race?.economy?.miningRate ?? BASE_MINING_RATE
});

const getMaxInstallations = (pop, per10k) => {
    if (!Number.isFinite(pop) || pop <= 0) {
        return 0;
    }
    return Math.max(0, Math.floor((pop / 10000) * per10k));
};
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

const shouldAutoBuild = (star, buildKind) => {
    if (!buildKind) {
        return false;
    }
    if (buildKind === "mine" || buildKind === "factory") {
        return star.pop > 0;
    }
    if (buildKind === "terraform") {
        return Boolean(star.terraforming?.active && star.terraforming?.target);
    }
    return false;
};

const applyConcentrationDepletion = (star, type, floorYears) => {
    const concentration = star.concentration?.[type] ?? 0;
    if (concentration <= 0 || star.mines <= 0) {
        return;
    }
    const yearsToDrop = Math.max(floorYears, BASE_DEPLETION_YEARS / concentration / star.mines);
    const depletion = 1 / yearsToDrop;
    star.concentration[type] = Math.max(0, concentration - depletion);
};

const resolveQueue = ({ state, star, productionPoints, raceModifiers, race }) => {
    const economy = state.economy?.[star.owner];
    if (!economy) {
        return 0;
    }
    const queue = Array.isArray(star.queue) ? star.queue : [];
    if (!queue.length) {
        return Math.max(0, Math.min(productionPoints, economy.credits || 0));
    }
    const economyRules = getRaceEconomy(race);
    let availableResources = Math.max(0, Math.min(productionPoints, economy.credits || 0));
    if (availableResources <= 0) {
        return 0;
    }

    const resolveItemCompletion = (item) => {
        if (item.type === "ship") {
            const fleetId = state.nextFleetId++;
            state.fleets.push(new Fleet({
                id: fleetId,
                owner: item.owner,
                x: star.x,
                y: star.y,
                name: `${item.bp.name} ${fleetId}`,
                design: item.bp
            }));
        } else if (item.type === "structure") {
            if (item.kind === "mine") {
                const maxMines = getMaxInstallations(star.pop, economyRules.maxMinesPer10k);
                star.mines = Math.min(maxMines, star.mines + item.count);
            } else if (item.kind === "factory") {
                const maxFactories = getMaxInstallations(star.pop, economyRules.maxFactoriesPer10k);
                star.factories = Math.min(maxFactories, star.factories + item.count);
            } else if (item.kind === "base") {
                star.def.base = { name: "Starbase I", hp: 1000 };
            }
        }
    };

    for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        if (!item) {
            continue;
        }
        if (!item.mineralCost && Number.isFinite(item.cost)) {
            item.mineralCost = {
                i: Math.ceil(item.cost * DEFAULT_MINERAL_RATIO.i),
                b: Math.ceil(item.cost * DEFAULT_MINERAL_RATIO.b),
                g: Math.ceil(item.cost * DEFAULT_MINERAL_RATIO.g)
            };
        }
        const remaining = Math.max(0, item.cost - item.done);
        if (remaining <= 0) {
            resolveItemCompletion(item);
            queue.splice(index, 1);
            index -= 1;
            continue;
        }
        const desiredProgress = Math.min(availableResources, remaining);
        if (desiredProgress <= 0) {
            break;
        }
        const ratios = getMineralRatios(item);
        let low = 0;
        let high = desiredProgress;
        let best = 0;
        let bestResult = null;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const attempt = ensureMineralsForProgress(
                star.mins,
                ratios,
                mid,
                raceModifiers?.mineralAlchemyRate || 0,
                availableResources
            );
            if (attempt.hasEnough) {
                best = mid;
                bestResult = attempt;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        if (best <= 0 || !bestResult) {
            item.blocked = true;
            break;
        }
        item.blocked = false;
        const { required, deficit, totalResourceCost } = bestResult;
        availableResources = Math.max(0, availableResources - totalResourceCost);
        economy.credits = Math.max(0, (economy.credits || 0) - totalResourceCost);
        star.mins = {
            i: Math.max(0, star.mins.i - (required.i - deficit.i)),
            b: Math.max(0, star.mins.b - (required.b - deficit.b)),
            g: Math.max(0, star.mins.g - (required.g - deficit.g))
        };
        item.done += best;
        if (item.done >= item.cost) {
            resolveItemCompletion(item);
            queue.splice(index, 1);
            index -= 1;
        } else {
            break;
        }
        if (availableResources <= 0) {
            break;
        }
    }
    return availableResources;
};

export const resolvePlanetEconomy = (state) => {
    let taxTotal = 0;
    let industrialOutput = 0;
    state.stars
        .filter(star => star.owner)
        .sort((a, b) => a.id - b.id)
        .forEach(star => {
            const race = getRaceForEmpire(state, star.owner);
            const raceModifiers = resolveRaceModifiers(race).modifiers;
            const alternateReality = isAlternateReality(race, raceModifiers);
            const economyRules = getRaceEconomy(race);
            normalizeStarEconomy(star);
            const techState = getTechnologyStateForEmpire(state, star.owner);
            const techModifiers = getTechnologyModifiers(techState);
            applyTerraforming(star, techModifiers, raceModifiers);
            const habitabilityValue = getHabitabilityScore({ star, race, techModifiers });
            star.habitability = Math.round(habitabilityValue);
            star.deathRate = habitabilityValue < 0 ? Math.round(Math.abs(habitabilityValue) / 10) : 0;
            const maxPopulation = getMaxPopulation(star, race, raceModifiers, alternateReality);
            if (raceModifiers.noFactories) {
                star.factories = 0;
            }
            if (raceModifiers.noMines) {
                star.mines = 0;
            }
            if (habitabilityValue < 0) {
                const losses = Math.floor(star.pop * (Math.abs(habitabilityValue) / 1000));
                star.pop = Math.max(0, Math.floor(star.pop - losses));
            } else if (star.pop < maxPopulation) {
                const baseGrowthRate = parseGrowthRate(race);
                const growthMultiplier = (techModifiers?.populationGrowth || 1) * (raceModifiers.populationGrowth || 1);
                const habitabilityMultiplier = Math.max(0, habitabilityValue / 100);
                const growth = Math.floor(star.pop * baseGrowthRate * growthMultiplier * habitabilityMultiplier);
                star.pop = Math.min(maxPopulation, star.pop + growth);
            }

            const crowdingRatio = maxPopulation > 0 ? star.pop / maxPopulation : (star.pop > 0 ? Infinity : 0);
            if (crowdingRatio >= 4) {
                const overcrowdingLoss = Math.floor(star.pop * 0.12);
                star.pop = Math.max(0, star.pop - overcrowdingLoss);
                star.deathRate = Math.max(star.deathRate, 12);
            }

            const popIncome = Math.floor(star.pop / economyRules.resPerColonist);
            let productionMultiplier = 1;
            if (crowdingRatio >= 1 && crowdingRatio <= 3) {
                productionMultiplier = 0.5;
            } else if (crowdingRatio > 3) {
                productionMultiplier = 0;
            }
            const adjustedPopIncome = Math.floor(popIncome * productionMultiplier);
            const maxFactories = getMaxInstallations(star.pop, economyRules.maxFactoriesPer10k);
            const maxMines = getMaxInstallations(star.pop, economyRules.maxMinesPer10k);
            if (Number.isFinite(maxFactories)) {
                star.factories = Math.min(star.factories, maxFactories);
            }
            if (Number.isFinite(maxMines)) {
                star.mines = Math.min(star.mines, maxMines);
            }
            const effectiveFactories = raceModifiers.noFactories ? 0 : Math.min(star.factories, maxFactories);
            const productionPoints = Math.max(0, (alternateReality ? 0 : adjustedPopIncome) + (effectiveFactories * economyRules.resPerFactory));

            const economy = state.economy?.[star.owner];
            if (!economy) {
                return;
            }

            let resources = adjustedPopIncome + (effectiveFactories * economyRules.resPerFactory);
            if (alternateReality) {
                const energyLevel = techState?.fields?.ENER?.level ?? 0;
                resources = Math.floor((star.pop * Math.max(1, energyLevel)) / POP_OUTPUT_DIVISOR);
            }
            if (star.owner === 1) {
                taxTotal += popIncome;
                industrialOutput += productionPoints;
            }
            economy.credits += resources;

            const miningMultiplier = raceModifiers.miningRateMultiplier || 1;
            const miningRate = economyRules.miningRate * miningMultiplier;
            const iGain = Math.floor(miningRate * (star.concentration.i / 100) * star.mines);
            const bGain = Math.floor(miningRate * (star.concentration.b / 100) * star.mines);
            const gGain = Math.floor(miningRate * (star.concentration.g / 100) * star.mines);

            star.mins.i += iGain;
            star.mins.b += bGain;
            star.mins.g += gGain;

            const depletionFloor = isHomeworld(star) ? HOMEWORLD_DEPLETION_FLOOR : STANDARD_DEPLETION_FLOOR;
            applyConcentrationDepletion(star, "i", depletionFloor);
            applyConcentrationDepletion(star, "b", depletionFloor);
            applyConcentrationDepletion(star, "g", depletionFloor);

            const remainingResources = resolveQueue({ state, star, productionPoints, raceModifiers, race });
            if (remainingResources > 0 && star.autoBuild) {
                const buildKind = star.autoBuild.kind;
                if (shouldAutoBuild(star, buildKind) && buildKind !== "terraform") {
                    if (buildKind === "factory" && raceModifiers.noFactories) {
                        return;
                    }
                    if (buildKind === "mine" && raceModifiers.noMines) {
                        return;
                    }
                    const structure = DB.structures?.[buildKind];
                    if (structure) {
                        let count = Math.max(1, star.autoBuild.count || 1);
                        if (buildKind === "mine") {
                            const maxMines = getMaxInstallations(star.pop, economyRules.maxMinesPer10k);
                            count = Math.max(0, Math.min(count, maxMines - star.mines));
                        } else if (buildKind === "factory") {
                            const maxFactories = getMaxInstallations(star.pop, economyRules.maxFactoriesPer10k);
                            count = Math.max(0, Math.min(count, maxFactories - star.factories));
                        }
                        if (count > 0) {
                            const baseCost = buildKind === "mine"
                                ? economyRules.mineCost
                                : buildKind === "factory"
                                    ? economyRules.factoryCost
                                    : structure.cost;
                            const cost = baseCost * count;
                            const spend = Math.min(remainingResources, cost, economy.credits || 0);
                            if (spend >= baseCost) {
                                const actualCount = Math.floor(spend / baseCost);
                                economy.credits = Math.max(0, (economy.credits || 0) - (actualCount * baseCost));
                                if (buildKind === "mine") {
                                    star.mines += actualCount;
                                } else if (buildKind === "factory") {
                                    star.factories += actualCount;
                                }
                            }
                        }
                    }
                }
            }

            star.def.mines = star.mines;
            star.def.facts = star.factories;
        });

    const mineralTotals = {};
    state.stars.forEach(star => {
        if (!star.owner) {
            return;
        }
        if (!mineralTotals[star.owner]) {
            mineralTotals[star.owner] = { i: 0, b: 0, g: 0 };
        }
        mineralTotals[star.owner].i += star.mins?.i || 0;
        mineralTotals[star.owner].b += star.mins?.b || 0;
        mineralTotals[star.owner].g += star.mins?.g || 0;
    });
    Object.entries(state.economy || {}).forEach(([id, entry]) => {
        const totals = mineralTotals[id] || { i: 0, b: 0, g: 0 };
        entry.mineralStock = { ...totals };
        entry.minerals = totals.i + totals.b + totals.g;
    });
    const playerEconomy = state.economy?.[1];
    if (playerEconomy) {
        state.credits = playerEconomy.credits;
        state.mineralStock = { ...playerEconomy.mineralStock };
        state.minerals = playerEconomy.minerals;
    }
    state.empireCache = { taxTotal, industrialOutput };
};
