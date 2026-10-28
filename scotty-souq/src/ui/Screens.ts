import type { GameClock, GameState, KitContext, RunSummary } from '../core/contracts';
import { readBestScore, saveBestScore, UI } from './config';
import { attr, find, flag, hidden, numberFormat, text, timeLabel } from './dom';

export class Screens {
  readonly element = document.createElement('div');
  private title: HTMLElement;
  private panel: HTMLElement;
  private panelTitle: HTMLElement;
  private panelDetail: HTMLElement;
  private resume: HTMLButtonElement;
  private restart: HTMLButtonElement;
  private stats: HTMLElement;
  private record: HTMLElement;
  private state: GameState = 'title';
  private paused = false;
  private startPending = false;
  private best = readBestScore();
  private summary: RunSummary = { score: 0, bestCombo: 0, wavesCleared: 0, timeSeconds: 0 };
  private statsElapsed = 0;
  private recordSet = false;
  private previousFocus: HTMLElement | null = null;

  constructor(private ctx: KitContext) {
    const s = UI.strings;
    this.element.className = 'sq-screens';
    this.element.innerHTML = `
      <section class="sq-title" role="dialog" aria-modal="true" aria-label="${s.scotty}: ${s.title}">
        <img class="sq-key-art" alt="" /><div class="sq-title-shade"></div>
        <div class="sq-title-header"><span class="sq-location">✦ ${s.location} ✦</span>
          <h1><span>${s.scotty}</span><small>${s.title}</small></h1><p>${s.controlsHint}</p></div>
        <div class="sq-title-bottom"><button type="button" class="sq-button sq-start">${s.start}<small class="sq-desktop">${s.startDesktop}</small></button>
          <button type="button" class="sq-button sq-boss-skip" data-boss>${s.skipToBoss}<small class="sq-desktop">${s.skipToBossDesktop}</small></button>
          <div class="sq-controls sq-plate"><strong>${s.controlsTouch}</strong><small>${s.controlsDesktop}</small></div>
          <span class="sq-personal-best">${s.best} <b data-title-best>0</b></span></div>
      </section>
      <section class="sq-modal" role="dialog" aria-modal="true" aria-labelledby="sq-panel-title" hidden>
        <div class="sq-panel sq-plate"><span class="sq-panel-eyebrow">✦ ${s.scotty} ✦</span>
          <h2 id="sq-panel-title"></h2><p class="sq-panel-detail"></p><span class="sq-record" hidden>${s.newBest}</span>
          <div class="sq-stats"><div><strong data-stat="score">0</strong><span>${s.score}</span></div>
            <div><strong data-stat="bestCombo">0</strong><span>${s.bestCombo}</span></div>
            <div><strong data-stat="wavesCleared">0</strong><span>${s.wavesCleared}</span></div>
            <div><strong data-stat="timeSeconds">0:00</strong><span>${s.time}</span></div></div>
          <div class="sq-panel-actions"><button class="sq-button" data-resume type="button">${s.resume}</button>
            <button class="sq-button" data-restart type="button">${s.restart}</button></div>
          <span class="sq-personal-best">${s.best} <b data-panel-best>0</b></span></div>
      </section>`;
    this.title = find(this.element, '.sq-title');
    this.panel = find(this.element, '.sq-modal');
    this.panelTitle = find(this.panel, 'h2');
    this.panelDetail = find(this.panel, '.sq-panel-detail');
    this.resume = find(this.panel, '[data-resume]');
    this.restart = find(this.panel, '[data-restart]');
    this.stats = find(this.panel, '.sq-stats');
    this.record = find(this.panel, '.sq-record');
    const art = find<HTMLImageElement>(this.element, '.sq-key-art');
    art.onerror = () => { art.hidden = true; };
    art.src = ctx.assets.imageUrl('key_art');
    this.title.addEventListener('click', () => this.start());
    find(this.title, '[data-boss]').addEventListener('click', (event) => {
      event.stopPropagation();
      this.startBoss();
    });
    this.resume.addEventListener('click', () => ctx.events.emit('ui:resume', {}));
    this.restart.addEventListener('click', () => ctx.events.emit('ui:restart', {}));
    this.element.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.element.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const activeScreen = this.panel.hidden ? this.title : this.panel;
      const buttons = Array.from(activeScreen.querySelectorAll<HTMLButtonElement>('button')).filter((button) => !button.hidden);
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    window.addEventListener('keydown', (event) => {
      if (this.state !== 'title' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, select, textarea, [data-demo-controls]')) return;
      event.preventDefault();
      const bossKey = event.key === 'b' || event.key === 'B';
      const bossButton = target instanceof HTMLElement && target.closest('[data-boss]') && (event.key === 'Enter' || event.key === ' ');
      if (bossKey || bossButton) this.startBoss();
      else this.start();
    });
    ctx.events.on('game:state', ({ state }) => this.setState(state));
    ctx.events.on('game:paused', ({ paused }) => this.setPaused(paused));
    ctx.events.on('game:over', (summary) => this.setSummary(summary, 'gameOver'));
    ctx.events.on('game:victory', (summary) => this.setSummary(summary, 'victory'));
    this.render();
  }

  private start(): void {
    if (this.state !== 'title' || this.startPending) return;
    this.startPending = true;
    this.ctx.events.emit('ui:start', {});
  }

  private startBoss(): void {
    if (this.state !== 'title' || this.startPending) return;
    this.startPending = true;
    this.ctx.events.emit('ui:startBoss', {});
  }
  setState(state: GameState): void {
    if (this.state === state) return;
    this.state = state;
    this.startPending = false;
    if (['title', 'playing', 'gameOver', 'victory'].includes(state)) this.paused = false;
    this.render();
  }
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.render();
  }
  private setSummary(summary: RunSummary, state: 'victory' | 'gameOver'): void {
    this.summary = { ...summary };
    this.statsElapsed = 0;
    this.recordSet = summary.score > this.best;
    this.best = Math.max(this.best, summary.score);
    saveBestScore(this.best);
    this.state = state;
    this.paused = false;
    this.render();
    this.updateStats(0);
  }
  private render(): void {
    const s = UI.strings;
    const isTitle = this.state === 'title' || this.state === 'boot';
    const isResult = this.state === 'victory' || this.state === 'gameOver';
    const showPanel = this.paused || isResult;
    const wasPanel = !this.panel.hidden;
    hidden(this.title, !isTitle);
    hidden(this.panel, !showPanel);
    flag(this.panel, 'sq-victory', this.state === 'victory');
    hidden(this.resume, !this.paused);
    hidden(this.stats, this.paused);
    hidden(this.record, this.paused || !this.recordSet);
    flag(this.restart, 'sq-secondary', this.paused);
    text(this.panelTitle, this.paused ? s.paused : this.state === 'victory' ? s.victory : s.over);
    text(this.panelDetail, this.paused ? s.pausedDetail : this.state === 'victory' ? s.victoryDetail : s.overDetail);
    text(this.restart, this.state === 'victory' && !this.paused ? s.playAgain : s.restart);
    text(find(this.element, '[data-title-best]'), numberFormat.format(this.best));
    text(find(this.element, '[data-panel-best]'), numberFormat.format(this.best));
    attr(this.element, 'aria-hidden', String(!isTitle && !showPanel));
    if (showPanel && !wasPanel) {
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      (this.paused ? this.resume : this.restart).focus({ preventScroll: true });
    } else if (!showPanel && wasPanel) this.previousFocus?.focus({ preventScroll: true });
  }
  private updateStats(progress: number): void {
    const ease = 1 - (1 - Math.min(1, progress)) ** 3;
    for (const key of ['score', 'bestCombo', 'wavesCleared', 'timeSeconds'] as const) {
      const value = Math.round(this.summary[key] * ease);
      text(find(this.stats, `[data-stat="${key}"]`), key === 'timeSeconds' ? timeLabel(value) : numberFormat.format(value));
    }
  }
  update(clock: GameClock): void {
    if (this.panel.hidden || this.paused || this.statsElapsed >= UI.statsDuration) return;
    this.statsElapsed += Math.max(0, clock.realDt);
    this.updateStats(this.statsElapsed / UI.statsDuration);
  }
  reset(): void {
    this.startPending = false;
    this.statsElapsed = 0;
    this.recordSet = false;
    this.paused = false;
    this.render();
  }
}
