import { Game } from "../core/game.js";
import { Order, ORDER_TYPES } from "../models/orders.js";
import { dist } from "../core/utils.js";

let ui = null;

export const bindUI = (uiRef) => {
    ui = uiRef;
};

export const Renderer = {
    cvs: document.getElementById('galaxy-canvas'),
    ctx: document.getElementById('galaxy-canvas').getContext('2d'),
    cam: { x: 1600, y: 1600, zoom: 1, dirty: true },
    time: 0,
    hoverMinefield: null,
    tooltip: document.getElementById('minefield-tooltip'),
    jumpFx: { intensity: 0, ticks: 0, lastEventCount: 0 },

    init: function() {
        window.addEventListener('resize', this.resize.bind(this));
        this.resize();

        let drag = false;
        let lx = 0;
        let ly = 0;
        this.cvs.addEventListener('mousedown', e => {
            if (e.button === 1 || e.shiftKey) {
                drag = true;
                lx = e.clientX;
                ly = e.clientY;
                return;
            }
            if (e.button === 2) {
                return;
            }
            this.click(e);
        });
        window.addEventListener('mouseup', () => { drag = false; });
        window.addEventListener('mousemove', e => {
            if (drag) {
                this.cam.x -= (e.clientX - lx) / this.cam.zoom;
                this.cam.y -= (e.clientY - ly) / this.cam.zoom;
                lx = e.clientX;
                ly = e.clientY;
                this.cam.dirty = true;
            }
        });
        this.cvs.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (Game.selection && Game.selection.type === 'fleet') {
                const w = this.screenToWorld(e.clientX, e.clientY);
                const fleet = Game.fleets[Game.selection.id];
                if (fleet) {
                    const waypoint = { x: Math.round(w.x), y: Math.round(w.y), task: null, data: null, speed: fleet.warp };
                    Game.queueOrder(new Order(ORDER_TYPES.SET_WAYPOINTS, fleet.owner, { fleetId: fleet.id, waypoints: [waypoint] }));
                    Game.logMsg("Fleet course plotted.", "Command");
                    ui.updateComms();
                }
            }
        });
        this.cvs.addEventListener('mousemove', e => {
            const w = this.screenToWorld(e.clientX, e.clientY);
            const knownFields = Game.minefieldIntel?.[1] || [];
            const hit = knownFields.find(field => dist(field.center, w) <= field.radius);
            this.hoverMinefield = hit || null;
            if (this.tooltip) {
                if (hit) {
                    this.tooltip.style.opacity = '1';
                    this.tooltip.style.left = `${e.clientX + 12}px`;
                    this.tooltip.style.top = `${e.clientY + 12}px`;
                    const ownerLabel = hit.ownerEmpireId === 1 ? 'Friendly' : (hit.ownerEmpireId ? 'Hostile' : 'Unknown');
                    const strengthLabel = Number.isFinite(hit.estimatedStrength) ? hit.estimatedStrength : 'Unknown';
                    this.tooltip.innerHTML = `<div class=\"tip-title\">Minefield</div><div>Owner: ${ownerLabel}</div><div>Radius: ${Math.floor(hit.radius)} ly</div><div>Strength: ${strengthLabel}</div>`;
                } else {
                    this.tooltip.style.opacity = '0';
                }
            }
        });
        this.cvs.addEventListener('mouseleave', () => {
            this.hoverMinefield = null;
            if (this.tooltip) {
                this.tooltip.style.opacity = '0';
            }
        });
        this.cvs.addEventListener('wheel', e => {
            this.cam.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
            this.cam.zoom = Math.min(2.2, Math.max(0.4, this.cam.zoom));
            this.cam.dirty = true;
        });

        window.addEventListener('keydown', e => {
            if (e.code === 'Space') {
                e.preventDefault();
                ui.submitTurn?.();
            }
            if (e.code === 'Escape') {
                ui.setScreen('map');
            }
        });

        this.loop();
    },

    resize: function() {
        this.cvs.width = this.cvs.parentElement.offsetWidth;
        this.cvs.height = this.cvs.parentElement.offsetHeight;
        this.cam.dirty = true;
    },

    worldToScreen: function(x, y) {
        return {
            x: (x - this.cam.x) * this.cam.zoom + this.cvs.width / 2,
            y: (y - this.cam.y) * this.cam.zoom + this.cvs.height / 2
        };
    },

    screenToWorld: function(sx, sy) {
        const r = this.cvs.getBoundingClientRect();
        return {
            x: (sx - r.left - this.cvs.width / 2) / this.cam.zoom + this.cam.x,
            y: (sy - r.top - this.cvs.height / 2) / this.cam.zoom + this.cam.y
        };
    },

    click: function(e) {
        const w = this.screenToWorld(e.clientX, e.clientY);
        let hit = null;
        Game.fleets.forEach((f, i) => {
            const visible = f.owner === 1 || Game.activeScanners.some(scan => dist(scan, f) <= scan.r);
            if (visible && dist(f, w) < 20 / this.cam.zoom) {
                hit = { type: 'fleet', id: i };
            }
        });
        if (!hit) {
            Game.stars.forEach(s => {
                if ((s.visible || s.known) && dist(s, w) < 20 / this.cam.zoom) {
                    hit = { type: 'star', id: s.id };
                }
            });
        }

        Game.selection = hit;
        ui.updateSide();
    },

    loop: function() {
        requestAnimationFrame(this.loop.bind(this));
        this.time += 0.003;
        this.cam.dirty = true;
        this.draw();
    },

    draw: function() {
        this.cam.dirty = false;

        const ctx = this.ctx;
        const cvs = this.cvs;
        const w = cvs.width;
        const h = cvs.height;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(this.cam.zoom, this.cam.zoom);
        ctx.translate(-this.cam.x, -this.cam.y);

        this.drawBackground(ctx);
        this.drawMinefields(ctx);
        this.drawScanners(ctx);
        this.drawStars(ctx);
        this.drawStargates(ctx);
        this.drawFleets(ctx);

        ctx.restore();

        this.drawJumpFx(ctx);
    },

    drawBackground: function(ctx) {
        const size = 120;
        const height = Math.sqrt(3) * size;
        const width = size * 2;
        const offsetX = (this.time * 60) % width;
        const offsetY = (this.time * 45) % height;

        ctx.save();
        ctx.strokeStyle = '#10151f';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.8;
        for (let y = -height; y <= 3600; y += height) {
            for (let x = -width; x <= 3600; x += width * 0.75) {
                const px = x + offsetX + ((y / height) % 2) * (width / 2);
                const py = y + offsetY;
                this.drawHex(ctx, px, py, size);
            }
        }
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = '#0a1a24';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        const parallax = (this.time * 25) % width;
        for (let y = -height; y <= 3600; y += height) {
            for (let x = -width; x <= 3600; x += width * 0.75) {
                const px = x - parallax + ((y / height) % 2) * (width / 2);
                const py = y + offsetY * 0.6;
                this.drawHex(ctx, px, py, size * 0.6);
            }
        }
        ctx.restore();
    },

    drawHex: function(ctx, x, y, size) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const px = x + size * Math.cos(angle);
            const py = y + size * Math.sin(angle);
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.stroke();
    },

    drawMinefields: function(ctx) {
        const knownFields = Game.minefieldIntel?.[1] || [];
        knownFields.forEach(field => {
            const isFriendly = field.ownerEmpireId === 1;
            const isHostile = Boolean(field.ownerEmpireId && field.ownerEmpireId !== 1);
            const baseColor = isFriendly ? '0, 240, 255' : (isHostile ? '255, 0, 85' : '180, 180, 200');
            const flicker = 0.5 + Math.sin(this.time * 16 + field.id) * 0.2;
            const area = Math.PI * field.radius * field.radius;
            const density = area > 0 ? (field.estimatedStrength || 0) / area : 0;
            const glow = Math.min(1, density * 18);
            ctx.save();
            ctx.strokeStyle = `rgba(${baseColor}, ${0.25 + glow * 0.5})`;
            ctx.lineWidth = 1.4 + glow * 2.2;
            ctx.shadowColor = `rgba(${baseColor}, ${0.25 + glow * 0.6})`;
            ctx.shadowBlur = 12 + glow * 30;
            ctx.setLineDash([8, 10]);
            ctx.beginPath();
            ctx.arc(field.center.x, field.center.y, field.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(${baseColor}, ${0.25 + flicker * 0.5})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(field.center.x, field.center.y, field.radius * (0.92 + flicker * 0.05), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        });
    },

    drawStargates: function(ctx) {
        Game.stars.forEach(star => {
            const intelEntry = Game.planetKnowledge?.[1]?.[star.id];
            const isKnown = star.visible || star.known || Boolean(intelEntry);
            if (!isKnown) {
                return;
            }
            const info = star.visible ? star : (star.snapshot ?? intelEntry?.snapshot);
            if (!info?.hasStargate) {
                return;
            }
            const spin = this.time * 2.4;
            const pulse = 0.6 + Math.sin(this.time * 6 + star.id) * 0.2;
            ctx.save();
            ctx.translate(star.x, star.y);
            ctx.rotate(spin);
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.45 + pulse * 0.3})`;
            ctx.lineWidth = 2.2;
            ctx.shadowColor = `rgba(0, 240, 255, ${0.5 + pulse * 0.4})`;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.ellipse(0, 0, 28, 12, spin * 0.6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255, 0, 170, ${0.2 + pulse * 0.2})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.ellipse(0, 0, 20, 8, -spin * 0.4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(star.x - 18, star.y - 6);
            ctx.lineTo(star.x + 16, star.y + 4);
            ctx.moveTo(star.x + 18, star.y - 4);
            ctx.lineTo(star.x - 12, star.y + 8);
            ctx.stroke();
            ctx.restore();
        });
    },

    drawJumpFx: function(ctx) {
        const jumpEvents = Game.turnEvents?.filter(event => event.type === "STARGATE_JUMP") || [];
        if (jumpEvents.length !== this.jumpFx.lastEventCount) {
            this.jumpFx.lastEventCount = jumpEvents.length;
            if (jumpEvents.length) {
                this.jumpFx.intensity = 1;
                this.jumpFx.ticks = 16;
            }
        }
        if (this.jumpFx.ticks <= 0) {
            return;
        }
        this.jumpFx.ticks -= 1;
        const intensity = this.jumpFx.intensity * (this.jumpFx.ticks / 16);
        ctx.save();
        ctx.globalAlpha = 0.15 + intensity * 0.25;
        ctx.fillStyle = "rgba(0, 240, 255, 0.25)";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalAlpha = 0.12 + intensity * 0.2;
        ctx.fillStyle = "rgba(255, 0, 170, 0.35)";
        for (let i = 0; i < 6; i++) {
            const y = Math.random() * ctx.canvas.height;
            ctx.fillRect(0, y, ctx.canvas.width, 2 + Math.random() * 3);
        }
        ctx.restore();
    },

    drawScanners: function(ctx) {
        Game.activeScanners.forEach(s => {
            ctx.strokeStyle = '#00f0ff11';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.stroke();
        });
    },

    drawStars: function(ctx) {
        Game.stars.forEach(star => {
            const intelEntry = Game.planetKnowledge?.[1]?.[star.id];
            const isKnown = star.visible || star.known || Boolean(intelEntry);
            if (!isKnown) {
                return;
            }
            const isSel = Game.selection && Game.selection.type === 'star' && Game.selection.id === star.id;
            const info = star.visible ? star : (star.snapshot ?? intelEntry?.snapshot);
            const hasOldIntel = !star.visible && intelEntry?.turn_seen != null;
            const col = info.owner === 1 ? '#00f0ff' : (info.owner ? '#ff0055' : '#ffffff');
            const alpha = star.visible ? 1 : 0.35;

            ctx.fillStyle = col;
            ctx.globalAlpha = alpha;
            ctx.shadowColor = col;
            ctx.shadowBlur = info.owner ? 15 : 0;
            ctx.beginPath();
            ctx.arc(star.x, star.y, info.owner ? 6 : 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            if (info.owner || isSel) {
                ctx.fillStyle = '#889';
                ctx.font = '10px monospace';
                ctx.fillText(star.name, star.x + 10, star.y);
            }

            if (hasOldIntel) {
                const age = Math.max(0, Game.turnCount - intelEntry.turn_seen);
                const markerAlpha = Math.max(0.25, 0.7 - age * 0.05);
                ctx.save();
                ctx.strokeStyle = `rgba(255, 255, 255, ${markerAlpha})`;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.arc(star.x, star.y, 12, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }

            if (isSel) {
                ctx.strokeStyle = '#fff';
                ctx.strokeRect(star.x - 8, star.y - 8, 16, 16);
            }
            ctx.globalAlpha = 1;
        });
    },

    drawFleets: function(ctx) {
        Game.fleets.forEach((fleet, i) => {
            const visible = fleet.owner === 1 || (fleet.intelState && fleet.intelState !== "none");
            if (!visible) {
                return;
            }
            const isSel = Game.selection && Game.selection.type === 'fleet' && Game.selection.id === i;
            ctx.fillStyle = fleet.owner === 1 ? '#ffcc00' : '#ff2255';

            if (fleet.dest) {
                ctx.strokeStyle = '#aa8800';
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(fleet.x, fleet.y);
                ctx.lineTo(fleet.dest.x, fleet.dest.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.save();
            ctx.translate(fleet.x, fleet.y);
            if (isSel) {
                ctx.strokeStyle = '#fff';
                ctx.beginPath();
                ctx.arc(0, 0, 12, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(-6, 5);
            ctx.lineTo(-6, -5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });
    }
};
