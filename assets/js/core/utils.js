export function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function r(n) {
    return Math.floor(Math.random() * n);
}
