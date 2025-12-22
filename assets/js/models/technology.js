import { DB } from "../data/db.js";

export class TechnologyField {
    constructor(id, level = 1, storedRP = 0) {
        this.id = id;
        this.level = level;
        this.storedRP = storedRP;
    }
}

export const COMPONENTS = DB.components;

const ALL_COMPONENTS = Object.values(COMPONENTS).flat();

export const getComponentById = (id) => ALL_COMPONENTS.find(component => component.id === id);

const getTraitSet = (race) => new Set([
    race?.primaryTrait,
    ...(race?.lesserTraits || [])
].filter(Boolean));

export const getComponentsBySlot = (slotType, race = null) => {
    const traitSet = race ? getTraitSet(race) : null;
    return ALL_COMPONENTS.filter(component => {
        if (component.slotType !== slotType) {
            return false;
        }
        if (!traitSet) {
            return true;
        }
        const required = [
            ...(component.requiresTraits || []),
            ...(component.reqTrait ? [component.reqTrait] : [])
        ];
        if (!required.length) {
            return true;
        }
        return required.every(trait => traitSet.has(trait));
    });
};

export const listAllComponents = () => ALL_COMPONENTS.slice();
