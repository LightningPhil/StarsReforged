const UINT64_MASK = (1n << 64n) - 1n;

export class PCG32 {
    constructor(seed = 0n, seq = 1n) {
        this.state = 0n;
        this.inc = (seq << 1n) | 1n;
        this.seed(seed);
    }

    seed(seed) {
        this.state = 0n;
        this.nextUint32();
        this.state = (this.state + (seed & UINT64_MASK)) & UINT64_MASK;
        this.nextUint32();
    }

    nextUint32() {
        const oldstate = this.state;
        this.state = (oldstate * 6364136223846793005n + this.inc) & UINT64_MASK;
        const xorshifted = Number(((oldstate >> 18n) ^ oldstate) >> 27n) >>> 0;
        const rot = Number(oldstate >> 59n) & 31;
        return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
    }

    nextInt(max) {
        if (max <= 0) {
            return 0;
        }
        return this.nextUint32() % max;
    }
}
