export class CombatReport {
    constructor(systemId, participants, outcome, losses, frames = [], summary = null) {
        this.systemId = systemId;
        this.participants = participants;
        this.outcome = outcome;
        this.losses = losses;
        this.frames = frames;
        this.summary = summary;
    }
}
