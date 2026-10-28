import { startGame } from './core/Game';
import { playPortalIntro } from './intro/PortalIntro';

const app = document.getElementById('app');
const ui = document.getElementById('ui');
if (!app || !ui) throw new Error('missing #app / #ui');

// Title screen first. "Tap to start" plays the 2D starter intro; walking through the portal drops Scotty
// straight into wave 1 of the souq behind the white flash. Skip the intro with ?intro=0.
startGame(app, ui, { beforePlay: (begin) => void playPortalIntro({ onEnterPortal: begin }) });
