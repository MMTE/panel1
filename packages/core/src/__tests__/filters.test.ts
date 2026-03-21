import { describe, it, expect, beforeEach } from 'vitest';
import { FilterChain } from '../filters.js';

describe('FilterChain', () => {
  let chain: FilterChain;

  beforeEach(() => {
    chain = new FilterChain();
  });

  it('returns payload unchanged when no filters', async () => {
    const result = await chain.apply('test', { value: 1 });
    expect(result).toEqual({ value: 1 });
  });

  it('applies a single filter', async () => {
    chain.register('test', (p: any) => ({ ...p, extra: true }));
    const result = await chain.apply('test', { value: 1 });
    expect(result).toEqual({ value: 1, extra: true });
  });

  it('chains multiple filters in priority order', async () => {
    const order: number[] = [];
    chain.register('e', (p: any) => { order.push(2); return { ...p, b: true }; }, 20);
    chain.register('e', (p: any) => { order.push(1); return { ...p, a: true }; }, 10);
    chain.register('e', (p: any) => { order.push(3); return { ...p, c: true }; }, 30);

    const result = await chain.apply('e', {});
    expect(result).toEqual({ a: true, b: true, c: true });
    expect(order).toEqual([1, 2, 3]);
  });

  it('supports async filters', async () => {
    chain.register('e', async (p: any) => {
      await new Promise((r) => setTimeout(r, 1));
      return { ...p, async: true };
    });
    const result = await chain.apply('e', {});
    expect(result).toEqual({ async: true });
  });

  it('propagates filter errors', async () => {
    chain.register('e', () => { throw new Error('blocked'); });
    await expect(chain.apply('e', {})).rejects.toThrow('blocked');
  });
});
