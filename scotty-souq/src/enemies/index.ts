import type { DamageResult, EnemiesKit, FxKit, Hittable, KitContext, WorldKit } from '../core/contracts';
import { DeanBoss } from '../boss/DeanBoss';
import { WaveDirector } from '../waves/WaveDirector';
import { AttackTokens } from './AttackTokens';
import { BOSS, COMBAT, WAVES } from './config';
import { Enemy, type EnemyServices } from './Enemy';
import { Projectiles } from './Projectiles';
import { circleOverlapsSector, distanceToSegmentSq, segmentFraction } from './Shapes';
import { TelegraphPool } from './Telegraph';

export interface EnemiesDeps {
  world: WorldKit;
  fx: FxKit;
}

export function createEnemies(ctx: KitContext, deps: EnemiesDeps): EnemiesKit {
  const enemies: Enemy[] = [];
  const tokens = new AttackTokens();
  const telegraphs = new TelegraphPool(ctx.scene);
  const projectiles = new Projectiles(ctx, deps.world);
  const services: EnemyServices = { ctx, ...deps, tokens, telegraphs, projectiles };
  let boss: DeanBoss | null = null;
  let nextId = 1;
  let frozen = false;
  const director = new WaveDirector(ctx, deps.world, (kind, gate, offset) => {
    enemies.push(new Enemy(nextId++, kind, gate, offset, services));
  }, () => {
    boss = new DeanBoss(nextId++, services, () => {
      const slots = WAVES.maxAlive - enemies.filter((enemy) => enemy.alive).length;
      const count = Math.min(slots, ctx.rng.int(BOSS.summonMin, BOSS.summonMax));
      const gates = director.pickGates();
      if (gates.length === 0) return;
      for (let i = 0; i < count; i++) {
        enemies.push(new Enemy(nextId++, ctx.rng.pick(['beaver', 'collie', 'wasp'] as const),
          gates[i % gates.length], Math.floor(i / gates.length) * COMBAT.spawnSpacing, services));
      }
    });
  });
  const forEachAlive = (visit: (target: Hittable) => void) => {
    for (const enemy of enemies) if (enemy.alive) visit(enemy);
    if (boss?.alive) visit(boss);
  };
  const ignored: DamageResult = { applied: false, killed: false, damage: 0 };
  const reset = () => {
    director.reset();
    for (const enemy of enemies) enemy.dispose();
    enemies.length = 0;
    boss?.dispose();
    boss = null;
    tokens.reset();
    telegraphs.reset();
    projectiles.reset();
    frozen = false;
  };
  return {
    get wave() { return director.wave; },
    totalWaves: WAVES.tables.length,
    get boss() { return boss; },
    start(fromWave) { reset(); director.start(fromWave); },
    update(clock, player) {
      boss?.update(clock, player, frozen);
      if (frozen || clock.dt <= 0 || boss?.finalCutReady || (boss && boss.hp <= 0)) return;
      for (const enemy of enemies) enemy.update(clock.dt, player, enemies);
      for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].disposed) enemies.splice(i, 1);
      projectiles.update(clock.dt, player);
      telegraphs.update(clock.dt);
      director.update(clock.dt, enemies.filter((enemy) => enemy.alive).length);
    },
    reset,
    aliveCount() { return enemies.filter((enemy) => enemy.alive).length + (boss?.alive ? 1 : 0); },
    nearest(p, maxDist) {
      let found: Hittable | null = null;
      let closest = maxDist;
      forEachAlive((target) => {
        const distance = Math.max(0, Math.hypot(target.position.x - p.x, target.position.z - p.z) - target.radius);
        if (distance <= closest) { closest = distance; found = target; }
      });
      return found;
    },
    queryArc(center, facing, radius, halfAngle, out) {
      out.length = 0;
      forEachAlive((target) => {
        if (circleOverlapsSector(target.position, target.radius, center, facing, Math.max(0, radius), Math.max(0, halfAngle))) out.push(target);
      });
      return out;
    },
    querySegment(a, b, radius, out) {
      out.length = 0;
      forEachAlive((target) => {
        if (distanceToSegmentSq(target.position, a, b) <= (Math.max(0, radius) + target.radius) ** 2) out.push(target);
      });
      out.sort((left, right) => segmentFraction(left.position, a, b) - segmentFraction(right.position, a, b));
      return out;
    },
    damage(target, info) {
      if (target === boss) return boss.damage(info);
      const enemy = enemies.find((entry) => entry === target);
      return enemy ? enemy.damage(info) : { ...ignored };
    },
    executeFinalCut(dir) { boss?.executeFinalCut(dir); },
    setFrozen(value) { frozen = value; },
  };
}
