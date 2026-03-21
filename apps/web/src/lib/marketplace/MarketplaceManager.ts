// Stub: old marketplace system removed. Keeps AdminPlugins.tsx compiling
// until it is migrated into the modules architecture.

export interface MarketplacePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
}

export const marketplaceManager = {
  getAvailable: async (): Promise<MarketplacePlugin[]> => [],
  install: async (_id: string) => {},
  uninstall: async (_id: string) => {},
};
