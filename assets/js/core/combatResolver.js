import { CombatReport } from "../models/combatReport.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const sortByInitiative = (a, b) => {
    if (a.initiative !== b.initiative) {
        return b.initiative - a.initiative;
    }
    return a.id.localeCompare(b.id);
};

const normalizeDesignStats = (design, stackStats = null) => {
    const source = stackStats || design?.finalStats || design || {};
    const beamDamage = source.beamDamage ?? source.attack ?? design?.beamDamage ?? design?.attack ?? 0;
    const torpedoDamage = source.torpedoDamage ?? design?.torpedoDamage ?? 0;
    const beamRange = source.beamRange ?? design?.beamRange ?? (beamDamage > 0 ? 1 : 0);
    const torpedoRange = source.torpedoRange ?? design?.torpedoRange ?? (torpedoDamage > 0 ? 2 : 0);
    return {
        armor: source.armor ?? design?.armor ?? 0,
        structure: source.structure ?? design?.structure ?? 0,
        shields: source.shields ?? design?.shields ?? 0,
        initiative: source.initiative ?? design?.initiative ?? 0,
        defense: source.defense ?? design?.defense ?? 0,
        speed: source.speed ?? design?.speed ?? 0,
        beamDamage,
        torpedoDamage,
        beamRange,
        torpedoRange,
        bombing: source.bombing ?? design?.bombing ?? Math.floor(torpedoDamage * 0.2),
        gattling: source.gattling ?? design?.gattling ?? 0,
        sapper: source.sapper ?? design?.sapper ?? 0,
        flags: source.flags ?? design?.flags ?? [],
        hullId: source.hullId ?? design?.hullId ?? null
    };
};

const buildStackState = (fleet, stack, modifiers, stackIndex) => {
    const designStats = normalizeDesignStats(fleet.design, stack.stats);
    const shieldStrength = modifiers?.shieldStrength ?? 1;
    const initiative = Math.floor((designStats.initiative || 0) * (modifiers?.combatInitiative ?? 1));
    const base = {
        shields: Math.max(0, Math.floor((designStats.shields || 0) * shieldStrength)),
        armor: Math.max(0, Math.floor(designStats.armor || 0)),
        structure: Math.max(1, Math.floor(designStats.structure || 0))
    };
    const battlePlan = fleet.battlePlan || stack.battlePlan || {};
    return {
        id: `${fleet.id}-${stackIndex}`,
        fleetId: fleet.id,
        owner: fleet.owner,
        name: fleet.name,
        designId: stack.designId,
        hullId: designStats.hullId,
        count: Math.max(0, stack.count ?? 0),
        base,
        shieldDamage: 0,
        hullDamage: 0,
        initiative,
        defense: designStats.defense || 0,
        speed: designStats.speed || 0,
        beamDamage: Math.max(0, Math.floor((designStats.beamDamage || 0) * (modifiers?.shipDamage ?? 1))),
        torpedoDamage: Math.max(0, Math.floor((designStats.torpedoDamage || 0) * (modifiers?.shipDamage ?? 1))),
        beamRange: designStats.beamRange || 0,
        torpedoRange: designStats.torpedoRange || 0,
        bombing: Math.max(0, Math.floor((designStats.bombing || 0) * (modifiers?.shipDamage ?? 1))),
        gattling: Math.max(0, Math.floor(designStats.gattling || 0)),
        sapper: Math.max(0, Math.min(0.8, designStats.sapper || 0)),
        flags: Array.isArray(designStats.flags) ? designStats.flags : [],
        battlePlan: {
            primary: battlePlan.primary ?? battlePlan.primaryTarget ?? "closest",
            secondary: battlePlan.secondary ?? battlePlan.secondaryTarget ?? "weakest",
            tactic: battlePlan.tactic ?? battlePlan.tactics ?? "balanced"
        },
        regeneratingShields: Boolean(modifiers?.regeneratingShields),
        groundCombatBonus: modifiers?.groundCombatBonus ?? 0,
        destroyed: false,
        originalCount: Math.max(0, stack.count ?? 0)
    };
};

const getHullPerShip = (stack) => Math.max(1, (stack.base.armor || 0) + (stack.base.structure || 0));

const getRemainingTotals = (stack) => {
    const hullPerShip = getHullPerShip(stack);
    const totalHull = hullPerShip * stack.count;
    const totalShields = (stack.base.shields || 0) * stack.count;
    const remainingHull = Math.max(0, totalHull - stack.hullDamage);
    const remainingShields = Math.max(0, totalShields - stack.shieldDamage);
    return {
        hullPerShip,
        totalHull,
        totalShields,
        remainingHull,
        remainingShields
    };
};

const getCurrentShipStatus = (stack) => {
    if (stack.count <= 0) {
        return { count: 0, shields: 0, armor: 0, structure: 0 };
    }
    const totals = getRemainingTotals(stack);
    const hullPerShip = totals.hullPerShip;
    const currentHull = Math.max(0, totals.remainingHull - hullPerShip * (stack.count - 1));
    const currentShields = Math.max(0, totals.remainingShields - (stack.base.shields || 0) * (stack.count - 1));
    const armor = Math.min(stack.base.armor || 0, currentHull);
    const structure = Math.max(0, currentHull - armor);
    return {
        count: stack.count,
        shields: currentShields,
        armor,
        structure
    };
};

const applyDamageToStack = (stack, damage, sapper = 0) => {
    if (stack.count <= 0 || damage <= 0) {
        return { kills: 0, remaining: 0 };
    }
    const totals = getRemainingTotals(stack);
    let remaining = Math.max(0, damage);
    const sapperDamage = Math.floor(remaining * sapper);
    let normalDamage = remaining - sapperDamage;
    if (totals.remainingShields > 0 && normalDamage > 0) {
        const absorbed = Math.min(totals.remainingShields, normalDamage);
        stack.shieldDamage += absorbed;
        normalDamage -= absorbed;
    }
    const hullDamage = sapperDamage + normalDamage;
    if (hullDamage > 0) {
        stack.hullDamage += hullDamage;
    }
    const previousCount = stack.count;
    const totalHull = totals.hullPerShip * previousCount;
    const remainingHull = Math.max(0, totalHull - stack.hullDamage);
    const newCount = remainingHull <= 0 ? 0 : Math.ceil(remainingHull / totals.hullPerShip);
    const kills = previousCount - newCount;
    stack.count = newCount;
    if (stack.count <= 0) {
        stack.destroyed = true;
    }
    const maxShield = (stack.base.shields || 0) * stack.count;
    if (stack.shieldDamage > maxShield) {
        stack.shieldDamage = maxShield;
    }
    return { kills, remaining: 0 };
};

const applyHullDamageToStack = (stack, damage) => {
    if (stack.count <= 0 || damage <= 0) {
        return { kills: 0 };
    }
    stack.hullDamage += damage;
    const totals = getRemainingTotals(stack);
    const remainingHull = Math.max(0, totals.totalHull - stack.hullDamage);
    const newCount = remainingHull <= 0 ? 0 : Math.ceil(remainingHull / totals.hullPerShip);
    const kills = stack.count - newCount;
    stack.count = newCount;
    if (stack.count <= 0) {
        stack.destroyed = true;
        stack.shieldDamage = 0;
    }
    return { kills };
};

const applyShieldDamageOnly = (stack, damage) => {
    if (stack.count <= 0 || damage <= 0) {
        return { kills: 0 };
    }
    const totals = getRemainingTotals(stack);
    if (totals.remainingShields <= 0) {
        return { kills: 0 };
    }
    const absorbed = Math.min(totals.remainingShields, damage);
    stack.shieldDamage += absorbed;
    return { kills: 0 };
};

const getPairKey = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

const getRangeBetween = (ranges, a, b) => ranges.get(getPairKey(a, b)) ?? 3;

const setRangeBetween = (ranges, a, b, range) => {
    ranges.set(getPairKey(a, b), clamp(range, 0, 4));
};

const getTargetMetric = (attacker, target, ranges) => {
    const totals = getRemainingTotals(target);
    return {
        range: getRangeBetween(ranges, attacker, target),
        count: target.count,
        defense: target.defense,
        damage: target.beamDamage + target.torpedoDamage,
        durability: totals.remainingHull + totals.remainingShields,
        isStarbase: target.designId === "starbase",
        hullId: target.hullId
    };
};

const sortTargets = (attacker, plan, ranges) => (a, b) => {
    const metricA = getTargetMetric(attacker, a, ranges);
    const metricB = getTargetMetric(attacker, b, ranges);
    const compare = (key, direction = "desc") => {
        if (metricA[key] !== metricB[key]) {
            const diff = metricA[key] - metricB[key];
            return direction === "asc" ? diff : -diff;
        }
        return 0;
    };
    const compareByKey = (key) => {
        switch (key) {
            case "closest":
                return compare("range", "asc");
            case "farthest":
                return compare("range", "desc");
            case "largest":
                return compare("count", "desc");
            case "smallest":
                return compare("count", "asc");
            case "highestDefense":
                return compare("defense", "desc");
            case "lowestDefense":
                return compare("defense", "asc");
            case "highestDamage":
                return compare("damage", "desc");
            case "lowestDamage":
                return compare("damage", "asc");
            case "strongest":
                return compare("durability", "desc");
            case "weakest":
                return compare("durability", "asc");
            default:
                return 0;
        }
    };
    const primary = compareByKey(plan.primary);
    if (primary !== 0) {
        return primary;
    }
    const secondary = compareByKey(plan.secondary);
    if (secondary !== 0) {
        return secondary;
    }
    if (metricA.range !== metricB.range) {
        return metricA.range - metricB.range;
    }
    return a.id.localeCompare(b.id);
};

const selectTarget = (attacker, combatants, ranges) => {
    const enemies = combatants.filter(item => !item.destroyed && item.owner !== attacker.owner && item.count > 0);
    if (!enemies.length) {
        return null;
    }
    const plan = attacker.battlePlan || { primary: "closest", secondary: "weakest", tactic: "balanced" };
    if (plan.primary === "starbase") {
        const starbases = enemies.filter(target => target.designId === "starbase");
        if (starbases.length) {
            return starbases.slice().sort(sortTargets(attacker, plan, ranges))[0];
        }
    }
    if (plan.primary === "capital") {
        const capitalTargets = enemies.filter(target => target.hullId === "battleship");
        if (capitalTargets.length) {
            return capitalTargets.slice().sort(sortTargets(attacker, plan, ranges))[0];
        }
    }
    return enemies.slice().sort(sortTargets(attacker, plan, ranges))[0];
};

const getPreferredRange = (stack, currentRange) => {
    const tactic = stack.battlePlan?.tactic || "balanced";
    const maxRange = Math.max(stack.beamRange, stack.torpedoRange, 1);
    if (tactic === "hold") {
        return currentRange;
    }
    if (tactic === "close") {
        return 0;
    }
    if (tactic === "retreat") {
        return 4;
    }
    if (tactic === "kite") {
        return maxRange;
    }
    if (stack.torpedoDamage > stack.beamDamage) {
        return stack.torpedoRange || 2;
    }
    if (stack.beamDamage > 0) {
        return stack.beamRange || 1;
    }
    return 0;
};

const getMovementBands = (stack) => {
    if (stack.speed <= 0) {
        return 0;
    }
    return Math.max(0, (stack.speed - 4) / 4);
};

const resolveMovementPhase = (combatants, ranges, frame) => {
    const movementPhase = frame?.movementPhase ?? 1;
    combatants
        .filter(stack => !stack.destroyed && stack.count > 0)
        .sort(sortByInitiative)
        .forEach(stack => {
            const target = selectTarget(stack, combatants, ranges);
            if (!target) {
                return;
            }
            const currentRange = getRangeBetween(ranges, stack, target);
            const desiredRange = getPreferredRange(stack, currentRange);
            const moveBands = getMovementBands(stack);
            if (moveBands <= 0 || currentRange === desiredRange || movementPhase > Math.ceil(moveBands)) {
                return;
            }
            let nextRange = currentRange;
            if (currentRange > desiredRange) {
                nextRange = currentRange - moveBands;
            } else if (currentRange < desiredRange) {
                nextRange = currentRange + moveBands;
            }
            nextRange = clamp(nextRange, 0, 4);
            setRangeBetween(ranges, stack, target, nextRange);
            if (frame) {
                frame.events.push({
                    type: "movement",
                    stackId: stack.id,
                    targetId: target.id,
                    from: currentRange,
                    to: nextRange
                });
            }
        });
};

const getBeamRangeMultiplier = (range, beamRange) => {
    if (beamRange <= 0) {
        return 0;
    }
    const decay = 0.1 * (range / Math.max(1, beamRange));
    return clamp(1 - decay, 0, 1);
};

const getTorpedoAccuracy = (attacker, target, range) => {
    const base = 0.35;
    const rangePenalty = Math.max(0, range - 1) * 0.1;
    const defensePenalty = (target.defense || 0) * 0.01;
    const initiativeBonus = (attacker.initiative || 0) * 0.01;
    return clamp(base + initiativeBonus - defensePenalty - rangePenalty, 0.05, 0.95);
};

const resolveFiringPhase = (combatants, ranges, frame, rng) => {
    combatants
        .filter(stack => !stack.destroyed && stack.count > 0)
        .sort(sortByInitiative)
        .forEach(attacker => {
            const target = selectTarget(attacker, combatants, ranges);
            if (!target) {
                return;
            }
            const range = getRangeBetween(ranges, attacker, target);
            const attacks = [];
            if (attacker.beamDamage > 0 && range <= attacker.beamRange) {
                const decay = getBeamRangeMultiplier(range, attacker.beamRange);
                attacks.push({ type: "beam", damage: Math.floor(attacker.beamDamage * decay) });
            }
            if (attacker.torpedoDamage > 0 && range <= attacker.torpedoRange) {
                attacks.push({ type: "torpedo", damage: attacker.torpedoDamage });
            }
            if (!attacks.length) {
                return;
            }
            attacks.forEach(attack => {
                const targets = attacker.gattling > 0 && attack.type === "beam"
                    ? combatants.filter(entry => entry.owner !== attacker.owner
                        && !entry.destroyed
                        && entry.count > 0
                        && getRangeBetween(ranges, attacker, entry) <= attacker.beamRange)
                    : [target];
                targets.forEach(entry => {
                    if (entry.destroyed || entry.count <= 0) {
                        return;
                    }
                    const baseDamage = Math.max(0, attack.damage * attacker.count);
                    const mitigation = Math.floor(entry.defense * entry.count * 0.25);
                    const effectiveDamage = Math.max(0, baseDamage - mitigation);
                    if (effectiveDamage <= 0) {
                        return;
                    }
                    const shots = Math.max(1, attacker.gattling + 1);
                    const perShot = Math.max(1, Math.floor(effectiveDamage / shots));
                    let totalKills = 0;
                    for (let shot = 0; shot < shots; shot += 1) {
                        if (attack.type === "torpedo") {
                            const accuracy = getTorpedoAccuracy(attacker, entry, range);
                            const roll = rng?.nextInt ? rng.nextInt(1000) / 1000 : Math.random();
                            if (roll > accuracy) {
                                applyShieldDamageOnly(entry, Math.floor(perShot / 8));
                                continue;
                            }
                            const hullDamage = Math.floor(perShot / 2);
                            const shieldDamage = perShot - hullDamage;
                            const hullOutcome = applyHullDamageToStack(entry, hullDamage);
                            const outcome = applyDamageToStack(entry, shieldDamage, 0);
                            totalKills += (hullOutcome.kills || 0) + outcome.kills;
                            if (entry.destroyed || entry.count <= 0) {
                                break;
                            }
                            continue;
                        }
                        const outcome = applyDamageToStack(entry, perShot, attacker.sapper);
                        totalKills += outcome.kills;
                        if (entry.destroyed || entry.count <= 0) {
                            break;
                        }
                    }
                    if (frame) {
                        const targetStatus = getCurrentShipStatus(entry);
                        frame.events.push({
                            type: "attack",
                            weapon: attack.type,
                            attackerId: attacker.id,
                            targetId: entry.id,
                            range,
                            damage: effectiveDamage,
                            kills: totalKills,
                            targetStatus: {
                                count: targetStatus.count,
                                shields: targetStatus.shields,
                                armor: targetStatus.armor,
                                structure: targetStatus.structure
                            }
                        });
                    }
                });
            });
        });
};

const buildStarbaseStack = (star) => {
    if (!star?.owner || !star.def?.base) {
        return null;
    }
    const baseHp = star.def.base.hp || 800;
    return {
        id: `starbase-${star.id}`,
        fleetId: `starbase-${star.id}`,
        owner: star.owner,
        name: star.def.base.name || "Starbase",
        designId: "starbase",
        hullId: "starbase",
        count: 1,
        base: {
            shields: Math.floor(baseHp * 0.1),
            armor: Math.floor(baseHp * 0.2),
            structure: Math.floor(baseHp * 0.7)
        },
        shieldDamage: 0,
        hullDamage: 0,
        initiative: 1,
        defense: 20,
        speed: 0,
        beamDamage: 60 + (star.def.mines || 0) + Math.floor(star.pop / 2000),
        torpedoDamage: 0,
        beamRange: 2,
        torpedoRange: 0,
        bombing: 0,
        gattling: 0,
        sapper: 0,
        flags: [],
        battlePlan: { primary: "closest", secondary: "weakest", tactic: "hold" },
        destroyed: false,
        originalCount: 1
    };
};

const getBombingProfile = (stack) => {
    const flags = new Set((stack.flags || []).map(flag => String(flag).toLowerCase()));
    const isSmart = flags.has("smartbomb") || flags.has("smartbombs") || flags.has("smart");
    const isNeutron = flags.has("neutronbomb") || flags.has("neutronbombs") || flags.has("neutron");
    return { isSmart, isNeutron };
};

const resolveBombardment = (star, attackers, frames, getModifiersForEmpire = null) => {
    if (!star || !star.owner || star.def?.base) {
        return null;
    }
    const defenseDisabled = getModifiersForEmpire ? Boolean(getModifiersForEmpire(star.owner)?.noPlanetaryDefenses) : false;
    const totals = attackers.reduce((sum, stack) => {
        const profile = getBombingProfile(stack);
        const bombing = (stack.bombing || 0) * stack.count;
        if (profile.isSmart) {
            sum.smart += bombing;
        } else if (profile.isNeutron) {
            sum.neutron += bombing;
        } else {
            sum.standard += bombing;
        }
        return sum;
    }, { standard: 0, smart: 0, neutron: 0 });
    const totalBombing = totals.standard + totals.smart + totals.neutron;
    if (totalBombing <= 0) {
        return null;
    }
    const smartDefenseDamage = Math.floor(totals.smart * 1.2);
    const standardDefenseDamage = Math.floor(totals.standard * 0.4);
    const defenseDamage = defenseDisabled ? 0 : (smartDefenseDamage + standardDefenseDamage);
    const defensePool = (star.def.mines || 0) + (star.def.facts || 0);
    const actualDefenseLoss = Math.min(defensePool, Math.floor(defenseDamage));
    const mineLoss = Math.min(star.def.mines || 0, Math.floor(actualDefenseLoss * 0.6));
    const factLoss = Math.min(star.def.facts || 0, actualDefenseLoss - mineLoss);
    const standardPopLoss = Math.floor(totals.standard * 0.6);
    const neutronPopLoss = Math.floor(totals.neutron * 1.4);
    const popLoss = Math.min(star.pop, standardPopLoss + neutronPopLoss);
    const factoryLoss = Math.min(star.factories || 0, Math.floor(totals.standard * 0.3 + totals.smart * 0.2));
    star.pop = Math.max(0, star.pop - popLoss);
    star.def.mines = Math.max(0, (star.def.mines || 0) - mineLoss);
    star.def.facts = Math.max(0, (star.def.facts || 0) - factLoss);
    star.factories = Math.max(0, (star.factories || 0) - factoryLoss);
    if (frames) {
        frames.push({
            round: "bombardment",
            phase: "bombing",
            events: [{
                type: "bombing",
                totalBombing,
                smartBombing: totals.smart,
                neutronBombing: totals.neutron,
                popLoss,
                mineLoss,
                factoryLoss,
                defenseFactLoss: factLoss
            }]
        });
    }
    return {
        totalBombing,
        popLoss,
        mineLoss,
        factoryLoss,
        defenseFactLoss: factLoss,
        smartBombing: totals.smart,
        neutronBombing: totals.neutron
    };
};

const resolveInvasion = (star, attackers, frames, getModifiersForEmpire = null) => {
    if (!star || !star.owner || star.def?.base || star.pop <= 0) {
        return null;
    }
    const troopStacks = attackers.filter(stack => stack.fleetId && stack.count > 0);
    if (!troopStacks.length) {
        return null;
    }
    const invasionForce = troopStacks.reduce((sum, stack) => {
        const fleet = stack.fleetRef;
        const bonus = stack.groundCombatBonus || 0;
        return sum + Math.floor((fleet?.cargo?.pop || 0) * (1 + bonus));
    }, 0);
    if (invasionForce <= 0) {
        return null;
    }
    const defenseDisabled = getModifiersForEmpire ? Boolean(getModifiersForEmpire(star.owner)?.noPlanetaryDefenses) : false;
    const defenseBonus = defenseDisabled ? 0 : ((star.def.mines || 0) + (star.def.facts || 0));
    const defenderBonus = getModifiersForEmpire ? (getModifiersForEmpire(star.owner)?.groundCombatBonus || 0) : 0;
    const defenderForce = Math.floor(star.pop * (1 + defenderBonus)) + Math.floor(defenseBonus * 0.5);
    if (invasionForce <= defenderForce) {
        if (frames) {
            frames.push({
                round: "invasion",
                phase: "invasion",
                events: [{
                    type: "invasion",
                    result: "repelled",
                    invasionForce,
                    defenderForce
                }]
            });
        }
        return { result: "repelled", invasionForce, defenderForce };
    }
    const winningStack = troopStacks[0];
    const winnerId = winningStack.owner;
    star.owner = winnerId;
    star.pop = Math.max(1, Math.floor(invasionForce * 0.25));
    troopStacks.forEach(stack => {
        if (stack.fleetRef?.cargo) {
            stack.fleetRef.cargo.pop = 0;
        }
    });
    if (frames) {
        frames.push({
            round: "invasion",
            phase: "invasion",
            events: [{
                type: "invasion",
                result: "captured",
                invasionForce,
                defenderForce,
                newOwner: winnerId
            }]
        });
    }
    return { result: "captured", invasionForce, defenderForce, newOwner: winnerId };
};

export const CombatResolver = {
    resolve(systemId, fleets, star, getModifiersForEmpire = () => ({
        shipDamage: 1,
        shipSpeed: 1,
        shipRange: 1,
        shipCost: 1,
        combatInitiative: 1,
        shieldStrength: 1,
        populationGrowth: 1,
        habitabilityTolerance: 0,
        regeneratingShields: false
    }), rng = null) {
        const participants = fleets.map(fleet => ({ id: fleet.id, owner: fleet.owner, name: fleet.name }));
        const byEmpire = fleets.reduce((acc, fleet) => {
            if (!acc[fleet.owner]) {
                acc[fleet.owner] = [];
            }
            acc[fleet.owner].push(fleet);
            return acc;
        }, {});
        const empireIds = Object.keys(byEmpire);
        if (empireIds.length <= 1 && (!star?.owner || empireIds.includes(String(star.owner)))) {
            return { fleets, star, report: null };
        }

        const losses = {};
        empireIds.forEach(id => {
            losses[id] = [];
        });

        const combatants = [];
        fleets.forEach(fleet => {
            const modifiers = getModifiersForEmpire(fleet.owner);
            const stacks = Array.isArray(fleet.shipStacks) && fleet.shipStacks.length
                ? fleet.shipStacks
                : [{ designId: fleet.designId, count: 1 }];
            stacks.forEach((stack, index) => {
                const combatant = buildStackState(fleet, stack, modifiers, index);
                combatant.fleetRef = fleet;
                if (combatant.count > 0) {
                    combatants.push(combatant);
                }
            });
        });

        const starbaseStack = buildStarbaseStack(star);
        if (starbaseStack) {
            combatants.push(starbaseStack);
            participants.push({ id: starbaseStack.id, owner: starbaseStack.owner, name: starbaseStack.name });
        }

        const ranges = new Map();
        combatants.forEach((a, index) => {
            for (let j = index + 1; j < combatants.length; j += 1) {
                const b = combatants[j];
                if (a.owner === b.owner) {
                    continue;
                }
                const maxRangeA = Math.max(a.beamRange, a.torpedoRange, 1);
                const maxRangeB = Math.max(b.beamRange, b.torpedoRange, 1);
                const startingRange = clamp(Math.ceil((maxRangeA + maxRangeB) / 2), 1, 4);
                setRangeBetween(ranges, a, b, startingRange);
            }
        });

        const frames = [];
        for (let round = 1; round <= 16; round += 1) {
            const activeOwners = new Set(
                combatants.filter(stack => !stack.destroyed && stack.count > 0).map(stack => stack.owner)
            );
            if (activeOwners.size <= 1) {
                break;
            }
            for (let phase = 1; phase <= 3; phase += 1) {
                const movementFrame = { round, phase: "movement", movementPhase: phase, events: [] };
                resolveMovementPhase(combatants, ranges, movementFrame);
                frames.push(movementFrame);
            }
            const fireFrame = { round, phase: "fire", events: [] };
            resolveFiringPhase(combatants, ranges, fireFrame, rng);
            frames.push(fireFrame);
            combatants.forEach(stack => {
                if (stack.destroyed || stack.count <= 0) {
                    return;
                }
                if (stack.regeneratingShields) {
                    const regen = Math.floor((stack.base.shields || 0) * stack.count * 0.1);
                    stack.shieldDamage = Math.max(0, stack.shieldDamage - regen);
                }
            });
        }

        const fleetStatus = new Map();
        combatants.forEach(stack => {
            if (!stack.fleetRef || stack.designId === "starbase") {
                return;
            }
            if (!fleetStatus.has(stack.fleetId)) {
                fleetStatus.set(stack.fleetId, []);
            }
            fleetStatus.get(stack.fleetId).push(stack);
        });

        const survivingFleets = [];
        fleets.forEach(fleet => {
            const stacks = fleetStatus.get(fleet.id) || [];
            const remainingStacks = stacks.filter(stack => stack.count > 0);
            if (!remainingStacks.length) {
                losses[fleet.owner]?.push(fleet.id);
                return;
            }
            fleet.shipStacks = remainingStacks.map(stack => ({
                designId: stack.designId,
                count: stack.count,
                stats: {
                    armor: stack.base.armor,
                    structure: stack.base.structure,
                    shields: stack.base.shields,
                    initiative: stack.initiative,
                    defense: stack.defense,
                    beamDamage: stack.beamDamage,
                    torpedoDamage: stack.torpedoDamage,
                    beamRange: stack.beamRange,
                    torpedoRange: stack.torpedoRange,
                    bombing: stack.bombing,
                    gattling: stack.gattling,
                    sapper: stack.sapper,
                    speed: stack.speed
                }
            }));
            const totals = remainingStacks.reduce((sum, stack) => {
                const hullPerShip = getHullPerShip(stack);
                const totalArmor = (stack.base.armor || 0) * stack.count;
                const totalStructure = (stack.base.structure || 0) * stack.count;
                const totalShield = (stack.base.shields || 0) * stack.count;
                const hullDamage = Math.min(stack.hullDamage, hullPerShip * stack.count);
                const armorRemaining = Math.max(0, totalArmor - hullDamage);
                const structureRemaining = Math.max(0, totalStructure - Math.max(0, hullDamage - totalArmor));
                const shieldRemaining = Math.max(0, totalShield - (stack.shieldDamage || 0));
                sum.armor += armorRemaining;
                sum.structure += structureRemaining;
                sum.shields += shieldRemaining;
                return sum;
            }, { armor: 0, structure: 0, shields: 0 });
            fleet.armor = totals.armor;
            fleet.structure = totals.structure;
            fleet.shields = totals.shields;
            fleet.hp = totals.armor + totals.structure + totals.shields;
            survivingFleets.push(fleet);
        });

        const activeEmpires = new Set();
        survivingFleets.forEach(fleet => activeEmpires.add(String(fleet.owner)));
        const starbaseAlive = starbaseStack && !starbaseStack.destroyed;
        if (star?.owner && starbaseAlive) {
            activeEmpires.add(String(star.owner));
        }
        const winner = activeEmpires.size === 1 ? Array.from(activeEmpires)[0] : null;

        const orbitingAttackers = combatants.filter(stack => (
            !stack.destroyed
            && stack.count > 0
            && star
            && star.owner
            && stack.owner !== star.owner
            && stack.fleetId !== `starbase-${star.id}`
        ));

        if (starbaseStack && starbaseStack.destroyed && star?.def?.base) {
            star.def.base = null;
        }

        const bombingOutcome = resolveBombardment(star, orbitingAttackers, frames, getModifiersForEmpire);
        const invasionOutcome = resolveInvasion(star, orbitingAttackers, frames, getModifiersForEmpire);

        if (winner && star && star.owner && String(star.owner) !== String(winner)) {
            star.owner = parseInt(winner, 10);
            star.pop = Math.floor(star.pop * 0.4);
            star.def = { ...star.def, base: null };
        }

        const summary = {
            winner,
            rounds: frames.filter(frame => frame.phase === "fire").length,
            bombing: bombingOutcome,
            invasion: invasionOutcome
        };

        const report = new CombatReport(systemId, participants, { winner }, losses, frames, summary);
        return { fleets: survivingFleets, star, report };
    }
};
