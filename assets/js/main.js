import { Game } from "./core/game.js";
import { Renderer, bindUI as bindRendererUI } from "./ui/renderer.js";
import { UI, bindRenderer as bindUIRenderer } from "./ui/ui.js";

window.Game = Game;
window.UI = UI;
bindUIRenderer(Renderer);
bindRendererUI(UI);

window.onload = () => {
    Game.init()
        .then(() => {
            UI.init();
            Renderer.init();
        })
        .catch(error => {
            console.error("Failed to initialize game.", error);
        });
};
