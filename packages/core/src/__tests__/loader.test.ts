import { describe, it, expect, vi } from 'vitest';
import { topologicalSort, validateDependencies } from '../loader.js';
import type { ModuleDefinition } from '@panel1/types';

function mod(name: string, deps: string[] = []): ModuleDefinition {
  return { name, version: '0.1.0', deps, setup: vi.fn() };
}

describe('validateDependencies', () => {
  it('passes when all deps are present', () => {
    expect(() => validateDependencies([mod('a'), mod('b', ['a'])])).not.toThrow();
  });

  it('throws for missing dependency', () => {
    expect(() => validateDependencies([mod('b', ['a'])])).toThrow('depends on "a"');
  });
});

describe('topologicalSort', () => {
  it('sorts independent modules in original order', () => {
    const modules = [mod('a'), mod('b'), mod('c')];
    const sorted = topologicalSort(modules);
    expect(sorted.map((m) => m.name)).toEqual(['a', 'b', 'c']);
  });

  it('puts dependencies before dependents', () => {
    const modules = [mod('b', ['a']), mod('a')];
    const sorted = topologicalSort(modules);
    expect(sorted.map((m) => m.name)).toEqual(['a', 'b']);
  });

  it('handles deep dependency chains', () => {
    const modules = [mod('c', ['b']), mod('b', ['a']), mod('a')];
    const sorted = topologicalSort(modules);
    expect(sorted.map((m) => m.name)).toEqual(['a', 'b', 'c']);
  });

  it('detects circular dependencies', () => {
    const modules = [mod('a', ['b']), mod('b', ['a'])];
    expect(() => topologicalSort(modules)).toThrow('Circular dependency');
  });

  it('detects missing dependencies', () => {
    expect(() => topologicalSort([mod('a', ['missing'])])).toThrow('not registered');
  });
});
