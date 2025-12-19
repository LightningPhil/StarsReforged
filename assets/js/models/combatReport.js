export class CombatReport {
    constructor(systemId, participants, outcome, losses) {
        this.systemId = systemId;
        this.participants = participants;
        this.outcome = outcome;
        this.losses = losses;
    }
}
