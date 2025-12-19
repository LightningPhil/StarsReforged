import { Game, bindRenderer as bindGameRenderer, bindUI as bindGameUI } from "./core/game.js";
import { Renderer, bindUI as bindRendererUI } from "./ui/renderer.js";
import { UI, bindRenderer as bindUIRenderer } from "./ui/ui.js";

bindGameUI(UI);
bindGameRenderer(Renderer);
bindRendererUI(UI);
bindUIRenderer(Renderer);

window.Game = Game;
window.UI = UI;

window.onload = () => Game.init();
