import { startGame } from './core/Game';

const app = document.getElementById('app');
const ui = document.getElementById('ui');
if (!app || !ui) throw new Error('missing #app / #ui');

startGame(app, ui);
