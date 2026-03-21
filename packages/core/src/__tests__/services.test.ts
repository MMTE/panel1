import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceRegistry } from '../services.js';

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  it('registers and resolves a service', () => {
    const impl = { greet: () => 'hello' };
    registry.register('greeter', impl);
    expect(registry.resolve('greeter')).toBe(impl);
  });

  it('throws on duplicate registration', () => {
    registry.register('a', {});
    expect(() => registry.register('a', {})).toThrow('already registered');
  });

  it('throws when resolving unregistered service', () => {
    expect(() => registry.resolve('missing')).toThrow('not registered');
  });

  it('has() returns correct state', () => {
    expect(registry.has('x')).toBe(false);
    registry.register('x', 1);
    expect(registry.has('x')).toBe(true);
  });

  it('list() returns registered names', () => {
    registry.register('a', 1);
    registry.register('b', 2);
    expect(registry.list()).toEqual(['a', 'b']);
  });
});
