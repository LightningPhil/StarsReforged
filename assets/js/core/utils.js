const MAX_INT_ROOT = 1 << 30;

export function intSqrt(value) {
    if (value <= 0) {
        return 0;
    }
    let n = value >>> 0;
    let result = 0;
    let bit = MAX_INT_ROOT;
    while (bit > n) {
        bit >>= 2;
    }
    while (bit !== 0) {
        if (n >= result + bit) {
            n -= result + bit;
            result = (result >> 1) + bit;
        } else {
            result >>= 1;
        }
        bit >>= 2;
    }
    return result;
}

export function distSq(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

export function dist(a, b) {
    return intSqrt(distSq(a, b));
}
