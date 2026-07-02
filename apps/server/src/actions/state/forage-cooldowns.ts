let cooldowns = new Map<string, number>();

export function setBackingStore(map: Map<string, number>): void {
  cooldowns = map;
}

export function get(key: string): number | undefined {
  return cooldowns.get(key);
}

export function set(key: string, tick: number): void {
  cooldowns.set(key, tick);
}

export function remove(key: string): boolean {
  return cooldowns.delete(key);
}

export function size(): number {
  return cooldowns.size;
}

export function entries(): IterableIterator<[string, number]> {
  return cooldowns.entries();
}

export function reset(): void {
  cooldowns.clear();
}
