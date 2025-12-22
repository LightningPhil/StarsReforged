import { Game, bindUI as bindGameUI } from "./core/game.js";
import { Renderer, bindUI as bindRendererUI } from "./ui/renderer.js";
import { UI, bindRenderer as bindUIRenderer } from "./ui/ui.js";

bindGameUI(UI);
bindRendererUI(UI);
bindUIRenderer(Renderer);

window.Game = Game;
window.UI = UI;

window.onload = () => {
    Game.init()
        .then(() => {
            Renderer.init();
        })
        .catch(error => {
            console.error("Failed to initialize game.", error);
        });
};
