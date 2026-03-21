import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../events.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('delivers events to subscribers', async () => {
    const handler = vi.fn();
    bus.on('test.event', handler);
    await bus.emit('test.event', { id: 1 });
    expect(handler).toHaveBeenCalledWith({ id: 1 });
  });

  it('delivers to multiple subscribers', async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('e', h1);
    bus.on('e', h2);
    await bus.emit('e', 'data');
    expect(h1).toHaveBeenCalledWith('data');
    expect(h2).toHaveBeenCalledWith('data');
  });

  it('does not throw when no subscribers', async () => {
    await expect(bus.emit('no.sub', {})).resolves.toBeUndefined();
  });

  it('calls persistEvent before dispatching', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const bus2 = new EventBus({ persistEvent: persist });
    const handler = vi.fn();
    bus2.on('x', handler);
    await bus2.emit('x', { a: 1 });
    expect(persist).toHaveBeenCalledWith('x', { a: 1 });
    expect(handler).toHaveBeenCalled();
  });

  it('handles handler errors without crashing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn().mockRejectedValue(new Error('boom'));
    const good = vi.fn();
    bus.on('e', bad);
    bus.on('e', good);
    await bus.emit('e', {});
    expect(good).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('listenerCount returns correct value', () => {
    expect(bus.listenerCount('x')).toBe(0);
    bus.on('x', vi.fn());
    bus.on('x', vi.fn());
    expect(bus.listenerCount('x')).toBe(2);
  });

  it('outbox: insert + markDispatched on success (memory mode)', async () => {
    const insertPending = vi.fn().mockResolvedValue('out-1');
    const markDispatched = vi.fn().mockResolvedValue(undefined);
    const bus2 = new EventBus({
      outbox: { insertPending, markDispatched, markDead: vi.fn() },
    });
    const handler = vi.fn();
    bus2.on('e', handler);
    await bus2.emit('e', { n: 1 });
    expect(insertPending).toHaveBeenCalledWith('e', { n: 1 });
    expect(markDispatched).toHaveBeenCalledWith('out-1');
    expect(handler).toHaveBeenCalledWith({ n: 1 });
  });

  it('getStats in memory mode returns mode only', async () => {
    const s = await bus.getStats();
    expect(s.mode).toBe('memory');
    expect(s.waiting).toBeUndefined();
  });
});
