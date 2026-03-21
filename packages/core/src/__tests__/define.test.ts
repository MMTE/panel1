import { describe, it, expect, vi } from 'vitest';
import { defineModule } from '../define.js';

describe('defineModule', () => {
  it('returns a valid module definition', () => {
    const mod = defineModule({
      name: 'test',
      version: '1.0.0',
      setup: vi.fn(),
    });
    expect(mod.name).toBe('test');
    expect(mod.version).toBe('1.0.0');
  });

  it('rejects missing name', () => {
    expect(() =>
      defineModule({ name: '', version: '1.0.0', setup: vi.fn() })
    ).toThrow('non-empty "name"');
  });

  it('rejects missing version', () => {
    expect(() =>
      defineModule({ name: 'test', version: '', setup: vi.fn() })
    ).toThrow('non-empty "version"');
  });

  it('rejects missing setup function', () => {
    expect(() =>
      defineModule({ name: 'test', version: '1.0.0', setup: null as any })
    ).toThrow('"setup" function');
  });
});
