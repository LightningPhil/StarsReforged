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

const normalizeEndpoint = (endpoint) => {
    if (!endpoint) {
        return null;
    }
    if (Number.isFinite(endpoint.x) && Number.isFinite(endpoint.y)) {
        return {
            x: endpoint.x,
            y: endpoint.y,
            radius: Number.isFinite(endpoint.radius) ? endpoint.radius : 12
        };
    }
    return null;
};

const getEndpoints = (wormhole) => {
    const entry = normalizeEndpoint(wormhole.entry || wormhole.a || wormhole.from);
    const exit = normalizeEndpoint(wormhole.exit || wormhole.b || wormhole.to);
    if (entry && exit) {
        return { entry, exit };
    }
    const endpoints = Array.isArray(wormhole.endpoints) ? wormhole.endpoints.map(normalizeEndpoint).filter(Boolean) : [];
    if (endpoints.length >= 2) {
        return { entry: endpoints[0], exit: endpoints[1] };
    }
    return null;
};

export const resolveWormholes = (state) => {
    const wormholes = state.wormholes || [];
    if (!Array.isArray(wormholes) || wormholes.length === 0) {
        return;
    }
    const relocated = new Set();
    const destroyed = new Set();
    wormholes.forEach(wormhole => {
        const endpoints = getEndpoints(wormhole);
        if (!endpoints) {
            return;
        }
        const massLimit = Number.isFinite(wormhole.massLimit) ? wormhole.massLimit : null;
        state.fleets.forEach(fleet => {
            if (relocated.has(fleet.id)) {
                return;
            }
            const distance = Math.hypot(fleet.x - endpoints.entry.x, fleet.y - endpoints.entry.y);
            if (distance > endpoints.entry.radius) {
                return;
            }
            fleet.x = endpoints.exit.x;
            fleet.y = endpoints.exit.y;
            relocated.add(fleet.id);
            if (state.turnEvents) {
                state.turnEvents.push({
                    type: "WORMHOLE_JUMP",
                    fleetId: fleet.id,
                    wormholeId: wormhole.id ?? null,
                    entry: { ...endpoints.entry },
                    exit: { ...endpoints.exit }
                });
            }
            if (massLimit && fleet.mass > massLimit) {
                const overflow = (fleet.mass - massLimit) / massLimit;
                const damage = Math.ceil(fleet.mineHitpoints * Math.min(1, 0.25 + overflow));
                const destroyedShip = applyDamageToFleet(fleet, damage);
                if (state.turnEvents) {
                    state.turnEvents.push({
                        type: "WORMHOLE_STRESS",
                        fleetId: fleet.id,
                        damage
                    });
                }
                if (destroyedShip) {
                    destroyed.add(fleet.id);
                }
            }
        });
    });
    if (destroyed.size) {
        state.fleets = state.fleets.filter(fleet => !destroyed.has(fleet.id));
    }
};
