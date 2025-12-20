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

export const getComponentsBySlot = (slotType) => ALL_COMPONENTS.filter(component => component.slotType === slotType);

export const listAllComponents = () => ALL_COMPONENTS.slice();
