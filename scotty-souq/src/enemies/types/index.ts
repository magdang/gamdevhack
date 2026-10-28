import type { EnemyKind } from '../../core/contracts';
import { createBeaver } from './beaver';
import { createTree } from './tree';
import { createBear } from './bear';
import { createCollie } from './collie';
import { createWasp } from './wasp';
import { createTiger } from './tiger';

export const FALLBACKS = {
  beaver: createBeaver, tree: createTree, bear: createBear,
  collie: createCollie, wasp: createWasp, tiger: createTiger,
} satisfies Record<EnemyKind, () => import('three').Group>;
