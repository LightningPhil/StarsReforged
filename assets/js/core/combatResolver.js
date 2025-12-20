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
        sapper: source.sapper ?? design?.sapper ?? 0
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
    return {
        id: `${fleet.id}-${stackIndex}`,
        fleetId: fleet.id,
        owner: fleet.owner,
        name: fleet.name,
        designId: stack.designId,
        count: Math.max(0, stack.count ?? 0),
        base,
        current: { ...base },
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
        destroyed: false,
        originalCount: Math.max(0, stack.count ?? 0)
    };
};

const applyDamageToShip = (ship, damage, sapper = 0) => {
    let remaining = damage;
    const sapperDamage = Math.floor(remaining * sapper);
    const normalDamage = remaining - sapperDamage;
    if (ship.shields > 0 && normalDamage > 0) {
        const absorbed = Math.min(ship.shields, normalDamage);
        ship.shields -= absorbed;
        remaining -= absorbed;
    }
    remaining -= sapperDamage;
    if (ship.armor > 0 && remaining > 0) {
        const absorbed = Math.min(ship.armor, remaining);
        ship.armor -= absorbed;
        remaining -= absorbed;
    }
    if (ship.structure > 0 && remaining > 0) {
        const absorbed = Math.min(ship.structure, remaining);
        ship.structure -= absorbed;
        remaining -= absorbed;
    }
    return remaining;
};

const applyDamageToStack = (stack, damage, sapper = 0) => {
    let remaining = damage;
    let kills = 0;
    while (remaining > 0 && stack.count > 0) {
        remaining = applyDamageToShip(stack.current, remaining, sapper);
        if (stack.current.structure <= 0) {
            kills += 1;
            stack.count -= 1;
            stack.current = { ...stack.base };
        } else {
            break;
        }
    }
    if (stack.count <= 0) {
        stack.destroyed = true;
    }
    return { kills, remaining };
};

const getPairKey = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

const getRangeBetween = (ranges, a, b) => ranges.get(getPairKey(a, b)) ?? 3;

const setRangeBetween = (ranges, a, b, range) => {
    ranges.set(getPairKey(a, b), clamp(range, 0, 4));
};

const selectTarget = (attacker, combatants, ranges) => {
    const enemies = combatants.filter(item => !item.destroyed && item.owner !== attacker.owner && item.count > 0);
    if (!enemies.length) {
        return null;
    }
    return enemies
        .slice()
        .sort((a, b) => {
            const rangeDiff = getRangeBetween(ranges, attacker, a) - getRangeBetween(ranges, attacker, b);
            if (rangeDiff !== 0) {
                return rangeDiff;
            }
            return a.id.localeCompare(b.id);
        })[0];
};

const getPreferredRange = (stack) => {
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
    return clamp(Math.floor(stack.speed / 4), 1, 2);
};

const resolveMovementPhase = (combatants, ranges, frame) => {
    combatants
        .filter(stack => !stack.destroyed && stack.count > 0)
        .sort(sortByInitiative)
        .forEach(stack => {
            const target = selectTarget(stack, combatants, ranges);
            if (!target) {
                return;
            }
            const currentRange = getRangeBetween(ranges, stack, target);
            const desiredRange = getPreferredRange(stack);
            const moveBands = getMovementBands(stack);
            if (moveBands <= 0 || currentRange === desiredRange) {
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

const resolveFiringPhase = (combatants, ranges, frame) => {
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
                attacks.push({ type: "beam", damage: attacker.beamDamage });
            }
            if (attacker.torpedoDamage > 0 && range <= attacker.torpedoRange) {
                attacks.push({ type: "torpedo", damage: attacker.torpedoDamage });
            }
            if (!attacks.length) {
                return;
            }
            attacks.forEach(attack => {
                if (target.destroyed || target.count <= 0) {
                    return;
                }
                const baseDamage = Math.max(0, attack.damage * attacker.count);
                const mitigation = Math.floor(target.defense * target.count * 0.25);
                const effectiveDamage = Math.max(0, baseDamage - mitigation);
                if (effectiveDamage <= 0) {
                    return;
                }
                const shots = Math.max(1, attacker.gattling + 1);
                const perShot = Math.max(1, Math.floor(effectiveDamage / shots));
                let totalKills = 0;
                for (let shot = 0; shot < shots; shot += 1) {
                    const outcome = applyDamageToStack(target, perShot, attacker.sapper);
                    totalKills += outcome.kills;
                    if (target.destroyed || target.count <= 0) {
                        break;
                    }
                }
                if (frame) {
                    frame.events.push({
                        type: "attack",
                        weapon: attack.type,
                        attackerId: attacker.id,
                        targetId: target.id,
                        range,
                        damage: effectiveDamage,
                        kills: totalKills,
                        targetStatus: {
                            count: target.count,
                            shields: target.current.shields,
                            armor: target.current.armor,
                            structure: target.current.structure
                        }
                    });
                }
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
        count: 1,
        base: {
            shields: Math.floor(baseHp * 0.1),
            armor: Math.floor(baseHp * 0.2),
            structure: Math.floor(baseHp * 0.7)
        },
        current: {
            shields: Math.floor(baseHp * 0.1),
            armor: Math.floor(baseHp * 0.2),
            structure: Math.floor(baseHp * 0.7)
        },
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
        destroyed: false,
        originalCount: 1
    };
};

const resolveBombardment = (star, attackers, frames) => {
    if (!star || !star.owner || star.def?.base) {
        return null;
    }
    const totalBombing = attackers.reduce((sum, stack) => sum + (stack.bombing || 0) * stack.count, 0);
    if (totalBombing <= 0) {
        return null;
    }
    const popLoss = Math.min(star.pop, Math.floor(totalBombing * 0.6));
    const mineLoss = Math.min(star.def.mines || 0, Math.floor(totalBombing / 5));
    const factoryLoss = Math.min(star.factories || 0, Math.floor(totalBombing / 6));
    star.pop = Math.max(0, star.pop - popLoss);
    star.def.mines = Math.max(0, (star.def.mines || 0) - mineLoss);
    star.factories = Math.max(0, (star.factories || 0) - factoryLoss);
    if (frames) {
        frames.push({
            round: "bombardment",
            phase: "bombing",
            events: [{
                type: "bombing",
                totalBombing,
                popLoss,
                mineLoss,
                factoryLoss
            }]
        });
    }
    return { totalBombing, popLoss, mineLoss, factoryLoss };
};

const resolveInvasion = (star, attackers, frames) => {
    if (!star || !star.owner || star.def?.base || star.pop <= 0) {
        return null;
    }
    const troopStacks = attackers.filter(stack => stack.fleetId && stack.count > 0);
    if (!troopStacks.length) {
        return null;
    }
    const invasionForce = troopStacks.reduce((sum, stack) => {
        const fleet = stack.fleetRef;
        return sum + (fleet?.cargo?.pop || 0);
    }, 0);
    if (invasionForce <= 0) {
        return null;
    }
    const defenderForce = star.pop;
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
    star.pop = Math.max(1, Math.floor(invasionForce * 0.3));
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
        habitabilityTolerance: 0
    })) {
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
            const movementFrame = { round, phase: "movement", events: [] };
            resolveMovementPhase(combatants, ranges, movementFrame);
            frames.push(movementFrame);
            const fireFrame = { round, phase: "fire", events: [] };
            resolveFiringPhase(combatants, ranges, fireFrame);
            frames.push(fireFrame);
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
            const totalArmor = remainingStacks.reduce((sum, stack) => sum + stack.base.armor * stack.count, 0);
            const totalStructure = remainingStacks.reduce((sum, stack) => sum + stack.base.structure * stack.count, 0);
            const totalShields = remainingStacks.reduce((sum, stack) => sum + stack.base.shields * stack.count, 0);
            fleet.armor = totalArmor;
            fleet.structure = totalStructure;
            fleet.shields = totalShields;
            fleet.hp = totalArmor + totalStructure + totalShields;
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

        const bombingOutcome = resolveBombardment(star, orbitingAttackers, frames);
        const invasionOutcome = resolveInvasion(star, orbitingAttackers, frames);

        if (winner && star && star.owner && String(star.owner) !== String(winner)) {
            star.owner = parseInt(winner, 10);
            star.pop = Math.floor(star.pop * 0.4);
            star.def = { ...star.def, base: null };
        }

        const summary = {
            winner,
            rounds: frames.filter(frame => typeof frame.round === "number").length / 2,
            bombing: bombingOutcome,
            invasion: invasionOutcome
        };

        const report = new CombatReport(systemId, participants, { winner }, losses, frames, summary);
        return { fleets: survivingFleets, star, report };
    }
};
