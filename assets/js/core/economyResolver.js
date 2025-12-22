import { resolveRaceModifiers } from "./raceTraits.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getToleranceOffset = ({ value, center, width, immune }) => {
    if (immune) {
        return 0;
    }
    if (!Number.isFinite(value) || !Number.isFinite(center) || !Number.isFinite(width)) {
        return 0;
    }
    const effectiveWidth = Math.max(0, width);
    const distance = Math.abs(value - center);
    return Math.max(0, distance - effectiveWidth);
};

export const getHabitabilityScore = ({ star, race, techModifiers }) => {
    if (!star?.environment) {
        return 100;
    }
    const { modifiers } = resolveRaceModifiers(race);
    const tolerance = race?.tolerance || {};
    const widthBonus = modifiers.habitabilityWidthBonus || 0;
    const techBonus = techModifiers?.habitabilityTolerance || 0;

    const grav = tolerance.grav || {};
    const temp = tolerance.temp || {};
    const rad = tolerance.rad || {};

    const widthMultiplier = 1 + widthBonus + techBonus;

    const gravOffset = getToleranceOffset({
        value: star.environment.grav,
        center: grav.center ?? 50,
        width: (grav.width ?? 25) * widthMultiplier,
        immune: grav.immune || modifiers.habitabilityImmunity.grav
    });
    const tempOffset = getToleranceOffset({
        value: star.environment.temp,
        center: temp.center ?? 50,
        width: (temp.width ?? 25) * widthMultiplier,
        immune: temp.immune || modifiers.habitabilityImmunity.temp
    });
    const radOffset = getToleranceOffset({
        value: star.environment.rad,
        center: rad.center ?? 50,
        width: (rad.width ?? 25) * widthMultiplier,
        immune: rad.immune || modifiers.habitabilityImmunity.rad
    });

    const totalOffset = gravOffset + tempOffset + radOffset;
    return clamp(100 - totalOffset, -100, 100);
};

export const resolvePopulationGrowth = ({ star, race, techModifiers, maxPopulation = 1500000 }) => {
    const { modifiers } = resolveRaceModifiers(race);
    const habitabilityValue = getHabitabilityScore({ star, race, techModifiers });
    const growthBase = 1.02;
    const growthMultiplier = (techModifiers?.populationGrowth || 1) * (modifiers.populationGrowth || 1);
    const adjustedMaxPop = Math.max(1, Math.floor(maxPopulation * (modifiers.maxPopulationMultiplier || 1)));
    const habitabilityMultiplier = Math.max(0, habitabilityValue / 100);
    const grown = Math.floor(star.pop * growthBase * growthMultiplier * habitabilityMultiplier);
    return Math.min(adjustedMaxPop, grown);
};
