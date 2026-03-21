import type { ModuleDefinition } from '@panel1/types';

export function defineModule(def: ModuleDefinition): ModuleDefinition {
  if (!def.name || typeof def.name !== 'string') {
    throw new Error('Module definition requires a non-empty "name" string');
  }
  if (!def.version || typeof def.version !== 'string') {
    throw new Error(`Module "${def.name}" requires a non-empty "version" string`);
  }
  if (typeof def.setup !== 'function') {
    throw new Error(`Module "${def.name}" requires a "setup" function`);
  }
  return def;
}
