import type { GameClock, HudSnapshot, KitContext, UiKit } from '../core/contracts';
import { UI } from './config';
import { attr, find, flag, text } from './dom';
import { Hud } from './Hud';
import { Screens } from './Screens';
import './styles.css';

export function createUi(ctx: KitContext): UiKit {
  const shell = document.createElement('div');
  shell.className = 'sq-ui';
  const hud = new Hud(ctx);
  const screens = new Screens(ctx);
  const banners = document.createElement('div');
  banners.className = 'sq-banners';
  banners.innerHTML = '<div class="sq-banner" role="status" aria-live="polite"><strong></strong><span></span></div><div class="sq-slash" aria-hidden="true"></div>';
  const banner = find(banners, '.sq-banner');
  const slash = find(banners, '.sq-slash');
  let bannerLeft = 0;
  let previousState: HudSnapshot['state'] | null = null;
  let previousPaused: boolean | null = null;
  shell.append(hud.element, banners, screens.element);
  ctx.uiRoot.replaceChildren(shell);

  function showBanner(title: string, detail = '', type = 'wave', duration: number = UI.bannerSeconds): void {
    text(find(banner, 'strong'), title);
    text(find(banner, 'span'), detail);
    attr(banner, 'data-kind', type);
    flag(banner, 'sq-visible', true);
    bannerLeft = duration;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && banner.animate) {
      banner.getAnimations().forEach((animation) => animation.cancel());
      banner.animate([{ transform: 'translateX(-110%) rotate(-3deg)', opacity: 0 },
        { transform: 'translateX(2%) rotate(-2deg)', opacity: 1, offset: 0.8 },
        { transform: 'translateX(0) rotate(-2deg)', opacity: 1 }], { duration: UI.bannerSweepMs, easing: 'ease-out' });
    }
    if (type === 'boss' && slash.animate) {
      slash.getAnimations().forEach((animation) => animation.cancel());
      slash.animate([{ transform: 'translateX(-140%) rotate(-14deg) scaleX(0.3)', opacity: 0 },
        { transform: 'translateX(0) rotate(-14deg) scaleX(1)', opacity: 1, offset: 0.35 },
        { transform: 'translateX(140%) rotate(-14deg) scaleX(1)', opacity: 0 }], { duration: UI.slashSweepMs, easing: 'ease-out' });
    }
  }
  function clearBanners(): void {
    bannerLeft = 0;
    flag(banner, 'sq-visible', false);
    banners.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  }
  ctx.events.on('wave:start', ({ wave }) => {
    const flavor = UI.waves[Math.min(UI.waves.length - 1, Math.max(0, wave - 1))];
    showBanner(`${UI.strings.wave} ${wave} · ${flavor[0]}`, flavor[1]);
  });
  ctx.events.on('wave:cleared', () => showBanner(UI.strings.cleared, UI.strings.clearedDetail, 'cleared', UI.clearedSeconds));
  ctx.events.on('boss:intro', () => showBanner(UI.strings.bossIntro, UI.strings.bossIntroDetail, 'boss', UI.bossIntroSeconds));
  ctx.events.on('finisher:start', () => showBanner(UI.strings.finisher, UI.strings.finisherDetail, 'finisher', UI.flashSeconds));
  ctx.events.on('combo:tier', ({ multiplier }) => showBanner(`${UI.strings.combo} x${multiplier}!`, '', 'combo', UI.flashSeconds));
  ctx.events.on('game:state', ({ state }) => {
    if (['boot', 'title', 'victory', 'gameOver'].includes(state)) clearBanners();
  });
  return {
    update(clock: GameClock, snapshot: HudSnapshot): void {
      if (snapshot.state !== previousState) { screens.setState(snapshot.state); previousState = snapshot.state; }
      if (snapshot.paused !== previousPaused) { screens.setPaused(snapshot.paused); previousPaused = snapshot.paused; }
      hud.update(clock, snapshot);
      screens.update(clock);
      if (bannerLeft > 0 && !snapshot.paused) {
        bannerLeft -= Math.max(0, clock.realDt);
        if (bannerLeft <= 0) flag(banner, 'sq-visible', false);
      }
    },
    reset(): void {
      clearBanners(); hud.reset(); screens.reset();
      previousState = null; previousPaused = null;
    },
  };
}
