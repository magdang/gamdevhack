import { startGame } from './core/Game';
import { playPortalIntro } from './intro/PortalIntro';

const app = document.getElementById('app');
const ui = document.getElementById('ui');
if (!app || !ui) throw new Error('missing #app / #ui');

// 2D starter intro first; Scotty walks into a portal and the souq game starts behind the white flash.
// Skip with ?intro=0.
void playPortalIntro({ onEnterPortal: () => startGame(app, ui) });
