import type { HudSnapshot } from '../contracts';
import type { EventBus } from '../Events';

/** Minimal isolated-core adapter, hidden as soon as the real UI owns its root. */
export class CoreOverlay {
  private root = document.createElement('div');
  private card = document.createElement('div');
  private title = document.createElement('h1');
  private text = document.createElement('p');
  private button = document.createElement('button');
  private status = document.createElement('div');
  private state = '';
  private score = -1;
  private abort = new AbortController();

  constructor(host: HTMLElement, private uiRoot: HTMLElement, events: EventBus) {
    this.root.dataset.coreOverlay = '';
    this.root.style.cssText = 'position:absolute;inset:0;z-index:10;color:#fff5dc;font:600 16px/1.5 system-ui;pointer-events:none;text-align:center;';
    this.card.style.cssText = 'position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);width:min(440px,80vw);padding:28px;border:1px solid #ffde9b66;background:#241b35e8;border-radius:22px;box-shadow:0 15px 70px #0005;pointer-events:auto;';
    this.title.style.cssText = 'font-size:clamp(28px,6vw,44px);line-height:1.05;margin:0 0 18px;color:#ffdb87;';
    this.button.style.cssText = 'cursor:pointer;border:0;border-radius:30px;padding:14px 32px;background:#f5cd7a;color:#2a1b3d;font:800 18px system-ui;';
    this.button.type = 'button';
    this.card.append(this.title, this.text, this.button);
    this.status.style.cssText = 'position:absolute;top:max(18px,env(safe-area-inset-top));left:20px;right:20px;text-shadow:0 2px 5px #000;';
    this.root.append(this.card, this.status); host.append(this.root);
    this.button.addEventListener('click', () => {
      if (this.state === 'title') events.emit('ui:start', {});
      else if (this.state === 'paused') events.emit('ui:resume', {});
      else events.emit('ui:restart', {});
    }, { signal: this.abort.signal });
  }

  update(hud: HudSnapshot): void {
    this.root.hidden = this.uiRoot.childElementCount > 0;
    if (this.root.hidden) return;
    const state = hud.paused ? 'paused' : hud.state;
    if (state !== this.state) {
      this.state = state;
      this.card.hidden = !['title', 'paused', 'victory', 'gameOver'].includes(state);
      this.title.textContent = state === 'title' ? 'SCOTTY: DEFEND SOUQ WAQIF' : state === 'victory' ? 'SOUQ DEFENDED!' : state === 'gameOver' ? 'ONE MORE TRY?' : 'PAUSED';
      this.text.textContent = state === 'title' ? 'Drag or WASD to move. Swipe, Space or right-click to dash. Slashes are automatic. Defeat Dean Trick with the Final Cut.' : state === 'paused' ? 'Take a breather. The souq can wait.' : `Score ${hud.score} · Best combo ${hud.bestCombo}`;
      this.button.textContent = state === 'title' ? 'Tap to start' : state === 'paused' ? 'Resume' : 'Play again';
    }
    if (hud.score !== this.score || state === 'finalCut' || hud.finalCutReady) {
      this.score = hud.score;
      this.status.textContent = hud.finalCutReady ? 'FINAL CUT! Swipe, tap or press Space' : `♥ ${hud.hp}/${hud.maxHp}   Wave ${hud.wave}   ${hud.score} pts   ${hud.combo} combo`;
    }
  }
  dispose(): void { this.abort.abort(); this.root.remove(); }
}
