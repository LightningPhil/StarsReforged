import { resolveRaceModifiers } from "./raceTraits.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getToleranceScore = ({ value, center, width, immune }) => {
    if (immune) {
        return 1;
    }
    if (!Number.isFinite(value) || !Number.isFinite(center) || !Number.isFinite(width)) {
        return 1;
    }
    const effectiveWidth = Math.max(1, width);
    const distance = Math.abs(value - center);
    return clamp(1 - (distance / effectiveWidth), 0, 1);
};

export const getHabitabilityScore = ({ star, race, techModifiers }) => {
    if (!star?.environment) {
        return 1;
    }
    const { modifiers } = resolveRaceModifiers(race);
    const tolerance = race?.tolerance || {};
    const widthBonus = modifiers.habitabilityWidthBonus || 0;
    const techBonus = techModifiers?.habitabilityTolerance || 0;

    const grav = tolerance.grav || {};
    const temp = tolerance.temp || {};
    const rad = tolerance.rad || {};

    const widthMultiplier = 1 + widthBonus + techBonus;

    const gravScore = getToleranceScore({
        value: star.environment.grav,
        center: grav.center ?? 50,
        width: (grav.width ?? 25) * widthMultiplier,
        immune: grav.immune || modifiers.habitabilityImmunity.grav
    });
    const tempScore = getToleranceScore({
        value: star.environment.temp,
        center: temp.center ?? 50,
        width: (temp.width ?? 25) * widthMultiplier,
        immune: temp.immune || modifiers.habitabilityImmunity.temp
    });
    const radScore = getToleranceScore({
        value: star.environment.rad,
        center: rad.center ?? 50,
        width: (rad.width ?? 25) * widthMultiplier,
        immune: rad.immune || modifiers.habitabilityImmunity.rad
    });

    return clamp((gravScore + tempScore + radScore) / 3, 0, 1);
};

export const resolvePopulationGrowth = ({ star, race, techModifiers, maxPopulation = 1500000 }) => {
    const { modifiers } = resolveRaceModifiers(race);
    const habitability = getHabitabilityScore({ star, race, techModifiers });
    const growthBase = 1.02;
    const growthMultiplier = (techModifiers?.populationGrowth || 1) * (modifiers.populationGrowth || 1);
    const adjustedMaxPop = Math.max(1, Math.floor(maxPopulation * (modifiers.maxPopulationMultiplier || 1)));
    const grown = Math.floor(star.pop * growthBase * growthMultiplier * habitability);
    return Math.min(adjustedMaxPop, grown);
};
