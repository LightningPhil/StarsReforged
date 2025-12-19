import { CombatReport } from "../models/combatReport.js";

const sortByInitiative = (a, b) => {
    if (a.fleet.design.initiative !== b.fleet.design.initiative) {
        return b.fleet.design.initiative - a.fleet.design.initiative;
    }
    return a.fleet.id - b.fleet.id;
};

const buildFleetState = (fleet) => ({
    fleet,
    shields: fleet.design.shields,
    hull: fleet.design.hull
});

const applyDamage = (fleetState, damage) => {
    let remaining = damage;
    if (fleetState.shields > 0) {
        const absorbed = Math.min(fleetState.shields, remaining);
        fleetState.shields -= absorbed;
        remaining -= absorbed;
    }
    if (remaining > 0) {
        fleetState.hull -= remaining;
    }
    return fleetState.hull > 0;
};

const applyDamageToGroup = (targets, totalDamage) => {
    let remaining = totalDamage;
    const orderedTargets = targets.slice().sort((a, b) => a.fleet.id - b.fleet.id);
    for (const target of orderedTargets) {
        if (remaining <= 0) {
            break;
        }
        const mitigation = Math.max(0, target.fleet.design.defense);
        const effectiveDamage = Math.max(0, remaining - mitigation);
        if (effectiveDamage <= 0) {
            break;
        }
        const survived = applyDamage(target, effectiveDamage);
        remaining = Math.max(0, remaining - effectiveDamage);
        if (!survived) {
            target.destroyed = true;
        }
    }
};

const calculateStarDefense = (star) => {
    if (!star) {
        return 0;
    }
    const basePower = star.def.base ? 120 : 40;
    const minePower = star.def.mines;
    const popPower = Math.floor(star.pop / 1000);
    return basePower + minePower + popPower;
};

export const CombatResolver = {
    resolve(systemId, fleets, star) {
        const participants = fleets.map(fleet => ({ id: fleet.id, owner: fleet.owner, name: fleet.name }));
        const byEmpire = fleets.reduce((acc, fleet) => {
            if (!acc[fleet.owner]) {
                acc[fleet.owner] = [];
            }
            acc[fleet.owner].push(fleet);
            return acc;
        }, {});
        const empireIds = Object.keys(byEmpire);
        if (empireIds.length <= 1) {
            return { fleets, star, report: null };
        }

        let combatants = fleets.map(buildFleetState);
        const losses = {};
        empireIds.forEach(id => {
            losses[id] = [];
        });

        if (star && star.owner) {
            const hostile = combatants.filter(item => item.fleet.owner !== star.owner);
            if (hostile.length) {
                const defensePower = calculateStarDefense(star);
                applyDamageToGroup(hostile, defensePower);
            }
        }

        const activeEmpires = () => {
            const owners = new Set();
            combatants.forEach(item => {
                if (!item.destroyed && item.hull > 0) {
                    owners.add(item.fleet.owner);
                }
            });
            return owners;
        };

        combatants
            .filter(item => !item.destroyed)
            .sort(sortByInitiative)
            .forEach(attacker => {
                if (attacker.destroyed || attacker.hull <= 0) {
                    return;
                }
                const enemies = combatants.filter(item => !item.destroyed && item.fleet.owner !== attacker.fleet.owner);
                if (!enemies.length) {
                    return;
                }
                const target = enemies.sort((a, b) => a.fleet.id - b.fleet.id)[0];
                const baseDamage = attacker.fleet.design.attack;
                const mitigation = target.fleet.design.defense;
                const damage = Math.max(0, baseDamage - mitigation);
                if (damage > 0) {
                    const survived = applyDamage(target, damage);
                    if (!survived) {
                        target.destroyed = true;
                    }
                }
            });

        combatants.forEach(item => {
            if (item.destroyed || item.hull <= 0) {
                losses[item.fleet.owner]?.push(item.fleet.id);
            }
        });

        const survivingEmpires = Array.from(activeEmpires());
        const winner = survivingEmpires.length === 1 ? survivingEmpires[0] : null;

        const survivingFleets = combatants
            .filter(item => !item.destroyed && item.hull > 0)
            .map(item => {
                item.fleet.hp = item.hull + item.shields;
                return item.fleet;
            });

        if (winner && star && star.owner !== winner) {
            star.owner = parseInt(winner, 10);
            star.pop = Math.floor(star.pop * 0.4);
            star.def = { ...star.def, base: null };
        }

        const report = new CombatReport(systemId, participants, { winner }, losses);
        return { fleets: survivingFleets, star, report };
    }
};
