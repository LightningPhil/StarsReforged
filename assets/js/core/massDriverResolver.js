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

const movePacket = (packet, speed) => {
    const dx = packet.destX - packet.x;
    const dy = packet.destY - packet.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= speed) {
        packet.x = packet.destX;
        packet.y = packet.destY;
        return { arrived: true, distance };
    }
    const scale = speed / distance;
    packet.x += dx * scale;
    packet.y += dy * scale;
    return { arrived: false, distance: speed };
};

const normalizePayload = (payload) => Math.max(0, Number.isFinite(payload) ? payload : 0);

export const resolveMassDriverPackets = (state) => {
    if (!Array.isArray(state.packets) || state.packets.length === 0) {
        return;
    }
    const rules = state.rules?.massDriver || {};
    const defaultSpeed = rules.speed ?? 80;
    const defaultDecay = rules.decayRate ?? 0.02;
    const defaultCatchRadius = rules.catchRadius ?? 12;
    const remainingPackets = [];
    const destroyed = new Set();

    state.packets
        .slice()
        .sort((a, b) => a.id - b.id)
        .forEach(packet => {
            packet.payload = normalizePayload(packet.payload);
            const speed = packet.speed ?? defaultSpeed;
            const decayRate = packet.decayRate ?? defaultDecay;
            const catchRadius = packet.catchRadius ?? defaultCatchRadius;
            const { arrived, distance } = movePacket(packet, speed);
            packet.payload = normalizePayload(packet.payload * (1 - decayRate));
            if (packet.payload <= 0) {
                return;
            }
            if (!arrived) {
                remainingPackets.push(packet);
                return;
            }

            const star = state.stars?.find(target => target.id === packet.destId);
            const nearbyFleet = state.fleets?.find(target => Math.hypot(target.x - packet.x, target.y - packet.y) <= catchRadius);
            const isResourcePacket = (packet.type || "resource") === "resource";

            if (nearbyFleet && nearbyFleet.owner !== packet.owner && !isResourcePacket) {
                const damageMultiplier = packet.damageMultiplier ?? 1;
                const damage = Math.ceil(packet.payload * damageMultiplier);
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
                const economy = state.economy?.[packet.owner];
                if (economy) {
                    economy.mineralStock.i += Math.floor(packet.payload * 0.4);
                    economy.mineralStock.b += Math.floor(packet.payload * 0.3);
                    economy.mineralStock.g += Math.floor(packet.payload * 0.3);
                    economy.minerals = economy.mineralStock.i + economy.mineralStock.b + economy.mineralStock.g;
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

            remainingPackets.push(packet);
        });

    if (destroyed.size) {
        state.fleets = state.fleets.filter(fleet => !destroyed.has(fleet.id));
    }
    state.packets = remainingPackets;
};
