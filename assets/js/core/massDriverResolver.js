import { resolveRaceModifiers } from "./raceTraits.js";

const applyDamageToFleet = (fleet, damage) => {
    let remaining = damage;
    if (fleet.armor > 0) {
        const absorbed = Math.min(fleet.armor, remaining);
        fleet.armor -= absorbed;
        remaining -= absorbed;
    }
    if (remaining > 0) {
        fleet.structure = Math.max(0, fleet.structure - remaining);
    }
    fleet.mineHitpoints = Math.max(0, fleet.armor + fleet.structure);
    fleet.hp = Math.max(0, fleet.armor + fleet.structure + fleet.shields);
    return fleet.mineHitpoints <= 0 || fleet.structure <= 0;
};

const movePacket = (packet, travelDistance) => {
    const dx = packet.destX - packet.x;
    const dy = packet.destY - packet.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= travelDistance) {
        packet.x = packet.destX;
        packet.y = packet.destY;
        return { arrived: true, distance };
    }
    const scale = travelDistance / distance;
    packet.x += dx * scale;
    packet.y += dy * scale;
    return { arrived: false, distance: travelDistance };
};

const normalizePayload = (payload) => Math.max(0, Number.isFinite(payload) ? payload : 0);

const getPacketSpeed = (packet, rules) => {
    const speed = packet.speed ?? rules.speed ?? 9;
    return Math.max(0, Number.isFinite(speed) ? speed : 0);
};

const getPacketDriverRating = (packet, rules, speed, targetRating = null) => {
    const rating = Number.isFinite(targetRating) ? targetRating : (packet.driverRating ?? rules.driverRating ?? speed);
    return Math.max(0, Number.isFinite(rating) ? rating : 0);
};

const getPacketDecayRate = (packet, speed, rating, rules) => {
    if (Number.isFinite(packet.decayRate)) {
        return Math.max(0, Math.min(1, packet.decayRate));
    }
    const decayRules = rules.decayRates || {};
    const safe = Number.isFinite(decayRules.safe) ? decayRules.safe : 0.1;
    const risky = Number.isFinite(decayRules.risky) ? decayRules.risky : 0.25;
    const extreme = Number.isFinite(decayRules.extreme) ? decayRules.extreme : 0.5;
    if (rating <= 0) {
        return extreme;
    }
    if (speed <= rating) {
        return safe;
    }
    if (speed <= rating * 2) {
        return risky;
    }
    return extreme;
};

const getImpactDamage = ({ speed, rating, mass, multiplier = 1 }) => {
    const speedSquared = speed ** 2;
    const ratingSquared = rating ** 2;
    const base = Math.max(0, (speedSquared - ratingSquared) * mass / 160);
    return Math.max(0, Math.floor(base * multiplier));
};

const applyDamageToStar = (star, damage) => {
    let remaining = damage;
    let baseDamage = 0;
    if (star.def?.base && Number.isFinite(star.def.base.hp)) {
        baseDamage = Math.min(star.def.base.hp, remaining);
        star.def.base.hp = Math.max(0, star.def.base.hp - baseDamage);
        remaining -= baseDamage;
        if (star.def.base.hp <= 0) {
            star.def.base = null;
        }
    }
    if (remaining <= 0) {
        return { baseDamage, popLoss: 0, mineLoss: 0, factoryLoss: 0 };
    }
    const popLoss = Math.min(star.pop || 0, Math.floor(remaining * 0.6));
    const mineLoss = Math.min(star.def?.mines || 0, Math.floor(remaining / 5));
    const factoryLoss = Math.min(star.def?.facts ?? star.factories ?? 0, Math.floor(remaining / 6));
    star.pop = Math.max(0, (star.pop || 0) - popLoss);
    star.def.mines = Math.max(0, (star.def.mines || 0) - mineLoss);
    star.mines = Math.max(0, (star.mines || 0) - mineLoss);
    star.def.facts = Math.max(0, (star.def.facts || 0) - factoryLoss);
    star.factories = Math.max(0, (star.factories || 0) - factoryLoss);
    return { baseDamage, popLoss, mineLoss, factoryLoss };
};

const shouldApplyPacketTerraforming = (state) => {
    const roll = state.rng?.nextInt ? state.rng.nextInt(100) : Math.floor(Math.random() * 100);
    return roll < 50;
};

const applyPacketTerraforming = (state, star, race) => {
    if (!star?.environment || !race?.tolerance) {
        return false;
    }
    if (!shouldApplyPacketTerraforming(state)) {
        return false;
    }
    const tolerance = race.tolerance || {};
    const axes = ["grav", "temp", "rad"];
    const targets = axes.map(axis => ({
        axis,
        current: star.environment?.[axis] ?? 50,
        target: tolerance[axis]?.center ?? 50
    }));
    targets.sort((a, b) => Math.abs(b.current - b.target) - Math.abs(a.current - a.target));
    const selected = targets[0];
    if (!selected) {
        return false;
    }
    const delta = Math.sign(selected.target - selected.current);
    if (delta === 0) {
        return false;
    }
    star.environment[selected.axis] = Math.max(0, Math.min(100, selected.current + delta));
    return true;
};

const getRaceForEmpire = (state, empireId) => {
    const player = state.players?.find(entry => entry.id === empireId);
    return player?.race || state.race;
};

export const resolveMassDriverPackets = (state) => {
    if (!Array.isArray(state.packets) || state.packets.length === 0) {
        return;
    }
    const rules = state.rules?.massDriver || {};
    const defaultCatchRadius = rules.catchRadius ?? 12;
    const remainingPackets = [];
    const destroyed = new Set();
    state.packets
        .slice()
        .sort((a, b) => a.id - b.id)
        .forEach(packet => {
            const race = getRaceForEmpire(state, packet.owner);
            const raceModifiers = resolveRaceModifiers(race).modifiers;
            const packetPhysics = Boolean(raceModifiers.packetPhysics);
            const packetDamageMultiplier = packetPhysics ? 1 / 3 : 1;
            packet.payload = normalizePayload(packet.payload);
            const speed = getPacketSpeed(packet, rules);
            const targetStar = state.stars?.find(target => target.id === packet.destId);
            const targetRating = targetStar?.massDriverRating ?? null;
            const driverRating = getPacketDriverRating(packet, rules, speed, targetRating);
            const decayRate = getPacketDecayRate(packet, speed, driverRating, rules);
            const catchRadius = packet.catchRadius ?? defaultCatchRadius;
            const travelDistance = speed ** 2;
            const { arrived } = movePacket(packet, travelDistance);
            packet.payload = normalizePayload(packet.payload * (1 - decayRate));
            if (packet.payload <= 0) {
                return;
            }
            if (!arrived) {
                remainingPackets.push(packet);
                return;
            }

            const star = targetStar;
            const nearbyFleet = state.fleets?.find(target => Math.hypot(target.x - packet.x, target.y - packet.y) <= catchRadius);
            const isResourcePacket = (packet.type || "resource") === "resource";

            if (nearbyFleet && nearbyFleet.owner !== packet.owner && !isResourcePacket) {
                const damageMultiplier = (packet.damageMultiplier ?? 1) * packetDamageMultiplier;
                const damage = getImpactDamage({
                    speed,
                    rating: driverRating,
                    mass: packet.payload,
                    multiplier: damageMultiplier
                });
                const destroyedShip = applyDamageToFleet(nearbyFleet, damage);
                if (state.turnEvents) {
                    state.turnEvents.push({
                        type: "PACKET_IMPACT",
                        packetId: packet.id,
                        fleetId: nearbyFleet.id,
                        damage
                    });
                }
                if (destroyedShip) {
                    destroyed.add(nearbyFleet.id);
                }
                return;
            }

            if (star && isResourcePacket && star.owner === packet.owner) {
                if (star.mins) {
                    star.mins.i += Math.floor(packet.payload * 0.4);
                    star.mins.b += Math.floor(packet.payload * 0.3);
                    star.mins.g += Math.floor(packet.payload * 0.3);
                }
                if (packetPhysics) {
                    applyPacketTerraforming(state, star, race);
                }
                if (state.turnEvents) {
                    state.turnEvents.push({
                        type: "PACKET_DELIVERED",
                        packetId: packet.id,
                        starId: star.id
                    });
                }
                return;
            }

            if (nearbyFleet && nearbyFleet.owner === packet.owner && nearbyFleet.cargo) {
                nearbyFleet.cargo.i += Math.floor(packet.payload * 0.4);
                nearbyFleet.cargo.b += Math.floor(packet.payload * 0.3);
                nearbyFleet.cargo.g += Math.floor(packet.payload * 0.3);
                if (state.turnEvents) {
                    state.turnEvents.push({
                        type: "PACKET_CAUGHT",
                        packetId: packet.id,
                        fleetId: nearbyFleet.id
                    });
                }
                return;
            }

            if (star && (!isResourcePacket || star.owner !== packet.owner)) {
                const damageMultiplier = (packet.damageMultiplier ?? 1) * packetDamageMultiplier;
                const damage = getImpactDamage({
                    speed,
                    rating: driverRating,
                    mass: packet.payload,
                    multiplier: damageMultiplier
                });
                const outcome = damage > 0 ? applyDamageToStar(star, damage) : { baseDamage: 0, popLoss: 0, mineLoss: 0, factoryLoss: 0 };
                let terraformed = false;
                if (packetPhysics) {
                    terraformed = applyPacketTerraforming(state, star, race);
                }
                if (state.turnEvents) {
                    state.turnEvents.push({
                        type: "PACKET_IMPACT",
                        packetId: packet.id,
                        starId: star.id,
                        damage,
                        baseDamage: outcome.baseDamage,
                        popLoss: outcome.popLoss,
                        mineLoss: outcome.mineLoss,
                        factoryLoss: outcome.factoryLoss,
                        terraformed
                    });
                }
                return;
            }

            remainingPackets.push(packet);
        });

    if (destroyed.size) {
        state.fleets = state.fleets.filter(fleet => !destroyed.has(fleet.id));
    }
    state.packets = remainingPackets;
};
