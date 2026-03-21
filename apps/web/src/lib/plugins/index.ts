// Stub: old plugin system removed. These exports keep existing pages compiling
// until they are migrated into vertical-slice modules.

import React from 'react';

export function PluginSlot(_props: { name: string; [key: string]: any }) {
  return null;
}

export const routeManager = {
  getAllRoutes: () => [] as { route: string; pluginId: string }[],
};

export const pluginManager = {
  getPlugins: () => new Map(),
  getPluginInfo: () => [],
};
