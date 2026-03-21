import type { FilterHandler } from '@panel1/types';

interface FilterEntry {
  handler: FilterHandler<string>;
  priority: number;
}

export class FilterChain {
  private filters = new Map<string, FilterEntry[]>();

  register(event: string, handler: FilterHandler<string>, priority = 10): void {
    const entries = this.filters.get(event) || [];
    entries.push({ handler, priority });
    entries.sort((a, b) => a.priority - b.priority);
    this.filters.set(event, entries);
  }

  async apply<T>(event: string, payload: T): Promise<T> {
    const entries = this.filters.get(event) || [];
    let result: unknown = payload;
    for (const entry of entries) {
      result = await entry.handler(result);
    }
    return result as T;
  }

  count(event: string): number {
    return (this.filters.get(event) || []).length;
  }

  clear(): void {
    this.filters.clear();
  }
}
