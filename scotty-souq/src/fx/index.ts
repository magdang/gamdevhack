import { Vector3 } from 'three';
import type { FxKit, KitContext } from '../core/contracts';
import { FX, initialQuality } from './config';
import { DamageText } from './DamageText';
import { Impacts } from './Debris';
import { Petals } from './Petals';
import { Post } from './Post';
import { SplitObjects } from './SplitObject';
import { SwordTrails } from './SwordTrail';

export function createFx(ctx: KitContext): FxKit {
  let quality = initialQuality();
  const post = new Post(ctx.renderer, ctx.scene, ctx.camera, quality);
  const petals = new Petals(ctx, quality);
  const impacts = new Impacts(ctx);
  const text = new DamageText(ctx);
  const trails = new SwordTrails(ctx, (pos, count) => impacts.spark(pos, count));
  const splits = new SplitObjects(ctx, (pos, count, power) => petals.burst(pos, count, power));
  const target = new Vector3();
  const direction = new Vector3();
  const up = new Vector3(0, 1, 0);
  let warmup = 0, slowFrames = 0, averageDt = 1 / 60;
  let previousHp = NaN;

  // Event-owned reactions: do not duplicate these with direct core/enemy FX calls.
  ctx.events.on('enemy:hit', e => {
    petals.burst(e.position, FX.petals.hit, 0.75);
    impacts.spark(e.position);
    text.pop(e.position, e.damage, e.source === 'slash' ? 'normal' : 'big');
  });
  ctx.events.on('enemy:killed', e => petals.burst(e.position, FX.petals.kill, 1.1));
  ctx.events.on('dash:start', e => petals.dash(e.from, e.to));
  ctx.events.on('finisher:start', e => {
    post.setSlowMo(1);
    petals.burst(e.position, FX.petals.finisher, 1.8);
  });
  ctx.events.on('finisher:end', () => post.setSlowMo(0));
  ctx.events.on('boss:slam', e => {
    impacts.shockwave(e.position, e.radius);
    impacts.debris(e.position, up, 36);
  });
  ctx.events.on('player:hurt', e => {
    const amount = Math.max(1, (Number.isNaN(previousHp) ? e.maxHp : previousHp) - e.hp);
    previousHp = e.hp;
    post.flash(0xff1838, 0.36, 0.28);
    // The contract has no damage amount. Derive it from hp deltas, assuming full HP on reset.
    text.pop(e.position, `-${amount}`, 'player');
  });
  ctx.events.on('combo:tier', e => text.pop(target, `x${e.multiplier}!`, 'combo'));
  ctx.events.on('finalcut:impact', e => {
    post.flash(0xffffff, 1, 0.6);
    petals.burst(e.position, FX.petals.finalCut, 3.1);
    impacts.spark(e.position, 60);
  });
  ctx.events.on('boss:defeated', e => petals.burst(e.position, FX.petals.confetti, 2.4));

  return {
    update(clock) {
      const dt = Math.max(0, Math.min(0.1, clock.dt));
      const realDt = Math.max(0, Math.min(0.1, clock.realDt));
      ctx.camera.getWorldDirection(direction);
      const distance = direction.y < -0.05 ? Math.max(0, Math.min(80, -ctx.camera.position.y / direction.y)) : 15;
      target.copy(ctx.camera.position).addScaledVector(direction, distance); target.y = 0;
      petals.update(dt, target);
      trails.update(dt);
      impacts.update(dt);
      splits.update(dt);
      text.update(realDt);
      post.update(realDt);
      warmup += realDt;
      averageDt += (realDt - averageDt) * (1 - Math.exp(-realDt * 1.5));
      if (warmup > FX.quality.warmupSeconds && clock.dt > 0 && realDt < 0.09) {
        slowFrames = averageDt > FX.quality.slowFrame ? slowFrames + realDt : Math.max(0, slowFrames - realDt * 0.5);
        if (slowFrames > FX.quality.sustainedSeconds && quality < 2) {
          quality++;
          post.setQuality(quality); petals.setQuality(quality); slowFrames = 0;
        }
      }
    },
    render: () => post.render(),
    resize: (width, height, dpr) => post.resize(width, height, dpr),
    reset() {
      petals.reset(); trails.reset(); impacts.reset(); splits.reset(); text.reset(); post.reset();
      previousHp = NaN;
    },
    petalBurst: (pos, count, power) => petals.burst(pos, count, power),
    slashArc: (origin, facing, radius, halfAngle, side) => trails.arc(origin, facing, radius, halfAngle, side),
    beginTrail: style => trails.begin(style),
    damageNumber: (pos, value, kind) => text.pop(pos, value, kind),
    shockwave: (pos, radius, color) => impacts.shockwave(pos, radius, color),
    debris: (pos, dir, count) => impacts.debris(pos, dir, count),
    splitObject: (obj, normal, power) => splits.split(obj, normal, power),
    flash: (color, intensity, duration) => post.flash(color, intensity, duration),
    setLetterbox: amount => post.setLetterbox(amount),
    setDesaturate: amount => post.setDesaturate(amount),
    setSlowMo: amount => post.setSlowMo(amount),
  };
}
