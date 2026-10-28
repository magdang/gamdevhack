import type { GameClock, HudSnapshot, KitContext } from '../core/contracts';
import { UI } from './config';
import { attr, clamp01, find, flag, numberFormat, pop, style, text } from './dom';

export class Hud {
  readonly element = document.createElement('section');
  private hearts: HTMLElement;
  private heartSlots: HTMLElement[] = [];
  private score: HTMLElement;
  private combo: HTMLElement;
  private comboValue: HTMLElement;
  private multiplier: HTMLElement;
  private decay: HTMLElement;
  private wave: HTMLElement;
  private enemies: HTMLElement;
  private dash: HTMLElement;
  private dashArc: SVGCircleElement;
  private dashStatus: HTMLElement;
  private mute: HTMLButtonElement;
  private boss: HTMLElement;
  private bossFill: HTMLElement;
  private bossTrail: HTMLElement;
  private bossValue: HTMLElement;
  private finalCut: HTMLElement;
  private displayScore = 0;
  private previousHp: number | null = null;
  private previousCombo = 0;

  constructor(private ctx: KitContext) {
    const s = UI.strings;
    this.element.className = 'sq-hud';
    this.element.setAttribute('aria-label', 'Game status');
    this.element.innerHTML = `
      <div class="sq-hud-top">
        <div class="sq-vitals"><div class="sq-hearts" role="img"></div>
          <div class="sq-score"><span class="sq-label">${s.score}</span><strong data-score>0</strong></div></div>
        <div class="sq-wave sq-plate"><strong data-wave></strong><span data-enemies></span></div>
        <div class="sq-tools"><button class="sq-icon" data-mute type="button" aria-pressed="false">♫</button>
          <button class="sq-icon" data-pause type="button" aria-label="${s.pauseLabel}">Ⅱ</button></div>
      </div>
      <div class="sq-boss" role="group" aria-label="${s.boss} health">
        <div class="sq-portrait"><span aria-hidden="true">D</span><img alt="" /></div>
        <div class="sq-boss-body"><div class="sq-boss-heading"><strong>${s.boss}</strong><span>${s.bossSubtitle}</span></div>
          <div class="sq-boss-track" role="progressbar" aria-label="Boss health" aria-valuemin="0" aria-valuemax="100">
            <div class="sq-boss-trail"></div><div class="sq-boss-fill"></div><i class="sq-phase-marker"></i>
            <span class="sq-boss-value"></span></div><small class="sq-phase-label">50% · ${s.phaseTwo}</small></div>
      </div>
      <div class="sq-combo"><span class="sq-label">${s.combo}</span><div class="sq-combo-number"><strong>0</strong><b>x1</b></div>
        <div class="sq-combo-track"><i></i></div></div>
      <div class="sq-dash" role="progressbar" aria-label="Dash cooldown" aria-valuemin="0" aria-valuemax="100">
        <svg viewBox="0 0 80 80" aria-hidden="true"><circle class="sq-dash-base" cx="40" cy="40" r="33" />
          <circle class="sq-dash-arc" cx="40" cy="40" r="33" pathLength="100" /></svg>
        <div><b>↗</b><strong>${s.dash}</strong><small></small></div></div>
      <div class="sq-final-cut" role="status"><div class="sq-swipe" aria-hidden="true"><i></i><b>➤</b></div>
        <strong class="sq-touch">${s.finalCut}</strong><strong class="sq-desktop">${s.finalCutDesktop}</strong>
        <span class="sq-desktop">${s.finalCutDetail}</span></div>`;
    this.hearts = find(this.element, '.sq-hearts');
    this.score = find(this.element, '[data-score]');
    this.combo = find(this.element, '.sq-combo');
    this.comboValue = find(this.element, '.sq-combo-number strong');
    this.multiplier = find(this.element, '.sq-combo-number b');
    this.decay = find(this.element, '.sq-combo-track i');
    this.wave = find(this.element, '[data-wave]');
    this.enemies = find(this.element, '[data-enemies]');
    this.dash = find(this.element, '.sq-dash');
    this.dashArc = find(this.element, '.sq-dash-arc');
    this.dashStatus = find(this.element, '.sq-dash small');
    this.mute = find(this.element, '[data-mute]');
    this.mute.addEventListener('click', () => ctx.events.emit('ui:toggleMute', {}));
    find(this.element, '[data-pause]').addEventListener('click', () => ctx.events.emit('ui:pause', {}));
    this.element.querySelectorAll('button').forEach((button) => {
      button.addEventListener('pointerdown', (event) => event.stopPropagation());
      button.addEventListener('keydown', (event) => event.stopPropagation());
    });
    this.boss = find(this.element, '.sq-boss');
    this.bossFill = find(this.element, '.sq-boss-fill');
    this.bossTrail = find(this.element, '.sq-boss-trail');
    this.bossValue = find(this.element, '.sq-boss-value');
    const portrait = find<HTMLImageElement>(this.element, '.sq-portrait img');
    portrait.onerror = () => { portrait.hidden = true; };
    portrait.src = ctx.assets.imageUrl('dean_portrait');
    this.finalCut = find(this.element, '.sq-final-cut');
    ctx.events.on('boss:spawned', ({ hp, maxHp }) => {
      flag(this.boss, 'sq-visible', true);
      this.updateBoss(hp, maxHp, 1);
    });
  }

  private updateBoss(hp: number, maxHp: number, phase: number): void {
    const ratio = clamp01(maxHp > 0 ? hp / maxHp : 0);
    const transform = `scaleX(${ratio.toFixed(4)})`;
    style(this.bossFill, 'transform', transform);
    style(this.bossTrail, 'transform', transform);
    text(this.bossValue, `${Math.max(0, Math.ceil(hp))} / ${Math.max(0, Math.ceil(maxHp))}`);
    attr(find(this.boss, '.sq-boss-track'), 'aria-valuenow', String(Math.round(ratio * 100)));
    flag(this.boss, 'sq-phase-two', phase >= 2);
  }

  update(clock: GameClock, hud: HudSnapshot): void {
    const active = !['boot', 'title', 'victory', 'gameOver'].includes(hud.state);
    flag(this.element, 'sq-active', active);
    attr(this.element, 'aria-hidden', String(!active));
    if (this.element.inert === active) this.element.inert = !active;
    if (this.heartSlots.length !== hud.maxHp) {
      this.hearts.replaceChildren();
      this.heartSlots = Array.from({ length: Math.max(0, Math.floor(hud.maxHp)) }, () => {
        const slot = document.createElement('span');
        slot.className = 'sq-heart';
        slot.innerHTML = '<span aria-hidden="true">♥</span><img alt="" />';
        const image = find<HTMLImageElement>(slot, 'img');
        image.onerror = () => { image.hidden = true; };
        this.hearts.append(slot);
        return slot;
      });
    }
    this.heartSlots.forEach((slot, index) => {
      const full = index < hud.hp;
      flag(slot, 'sq-empty', !full);
      const image = find<HTMLImageElement>(slot, 'img');
      const url = this.ctx.assets.imageUrl(full ? 'heart_full' : 'heart_empty');
      if (image.getAttribute('src') !== url) { image.hidden = false; image.src = url; }
    });
    attr(this.hearts, 'aria-label', `${hud.hp} of ${hud.maxHp} hearts`);
    if (this.previousHp !== null && hud.hp < this.previousHp) pop(this.hearts, true);
    this.previousHp = hud.hp;
    if (hud.score < this.displayScore) this.displayScore = hud.score;
    this.displayScore += (hud.score - this.displayScore) * (1 - Math.exp(-UI.scoreCatchup * Math.max(0, clock.realDt)));
    if (Math.abs(hud.score - this.displayScore) < 0.5) this.displayScore = hud.score;
    text(this.score, numberFormat.format(Math.round(this.displayScore)));
    text(this.comboValue, String(hud.combo));
    text(this.multiplier, `x${hud.comboMultiplier}`);
    style(this.combo, '--combo-color', UI.comboColors[Math.min(3, Math.max(0, hud.comboTier))]);
    style(this.decay, 'transform', `scaleX(${clamp01(hud.comboDecay01).toFixed(3)})`);
    flag(this.combo, 'sq-visible', hud.combo > 0);
    if (hud.combo > this.previousCombo) pop(find(this.combo, '.sq-combo-number'));
    this.previousCombo = hud.combo;
    text(this.wave, hud.wave > hud.totalWaves ? UI.strings.bossWave : `${UI.strings.wave} ${hud.wave}/${hud.totalWaves}`);
    text(this.enemies, `${hud.enemiesAlive} ${UI.strings.enemies}`);
    const ready = hud.dashReady01 >= 0.999;
    flag(this.dash, 'sq-ready', ready);
    style(this.dashArc, 'stroke-dashoffset', (100 * (1 - clamp01(hud.dashReady01))).toFixed(2));
    attr(this.dash, 'aria-valuenow', String(Math.round(clamp01(hud.dashReady01) * 100)));
    text(this.dashStatus, ready ? UI.strings.dashReady : UI.strings.dashCharging);
    attr(this.mute, 'aria-pressed', String(hud.muted));
    attr(this.mute, 'aria-label', hud.muted ? UI.strings.unmuteLabel : UI.strings.muteLabel);
    text(this.mute, hud.muted ? '♪̸' : '♫');
    flag(this.boss, 'sq-visible', hud.boss !== null);
    if (hud.boss) this.updateBoss(hud.boss.hp, hud.boss.maxHp, hud.boss.phase);
    flag(this.finalCut, 'sq-visible', hud.finalCutReady);
    attr(this.finalCut, 'aria-hidden', String(!hud.finalCutReady));
  }

  reset(): void {
    this.previousHp = null;
    this.previousCombo = 0;
    this.displayScore = 0;
    flag(this.boss, 'sq-visible', false);
    flag(this.combo, 'sq-visible', false);
    flag(this.finalCut, 'sq-visible', false);
  }
}
