import { COMBAT } from './config';

/** Interrupted/dead attackers return their slot immediately. Holding is idempotent. */
export class AttackTokens {
  private owners = new Set<number>();
  acquire(id: number): boolean {
    if (this.owners.has(id)) return true;
    if (this.owners.size >= COMBAT.attackTokens) return false;
    this.owners.add(id);
    return true;
  }
  release(id: number): void { this.owners.delete(id); }
  reset(): void { this.owners.clear(); }
}
