// Main plugin system exports
export { pluginManager } from './PluginManager';
export { pluginRegistry } from './PluginRegistry';
export { PluginLoader } from './PluginLoader';
export { uiSlotManager, PluginSlot, usePluginSlot } from './UISlotManager';
export { routeManager } from './RouteManager';

// Re-export plugin SDK types
export type {
  Plugin,
  PluginMetadata,
  PluginContext,
  PluginHooks,
  PluginRoutes,
  PluginUIComponents,
  Panel1EventMap,
  PluginInfo,
  PluginStatus,
  PluginManifest,
} from '@panel1/plugin-sdk';

// Plugin system initialization
export async function initializePluginSystem(): Promise<void> {
  try {
    console.log('Initializing Panel1 plugin system...');
    
    // The plugin registry automatically loads installed plugins on construction
    // Additional initialization can be added here
    
    console.log('Plugin system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize plugin system:', error);
    throw error;
  }
}

// Plugin system utilities
export const PluginSystem = {
  get manager() { 
    const { pluginManager } = require('./PluginManager');
    return pluginManager;
  },
  get registry() { 
    const { pluginRegistry } = require('./PluginRegistry');
    return pluginRegistry;
  },
  get loader() { 
    const { PluginLoader } = require('./PluginLoader');
    return PluginLoader;
  },
  get uiSlots() { 
    const { uiSlotManager } = require('./UISlotManager');
    return uiSlotManager;
  },
  get routes() { 
    const { routeManager } = require('./RouteManager');
    return routeManager;
  },
  
  // Convenience methods
  async install(name: string, source: string) {
    const { pluginManager } = require('./PluginManager');
    return pluginManager.installPlugin(name, source);
  },
  
  async uninstall(name: string) {
    const { pluginManager } = require('./PluginManager');
    return pluginManager.uninstallPlugin(name);
  },
  
  async enable(name: string) {
    const { pluginManager } = require('./PluginManager');
    return pluginManager.enablePlugin(name);
  },
  
  async disable(name: string) {
    const { pluginManager } = require('./PluginManager');
    return pluginManager.disablePlugin(name);
  },
  
  getAll() {
    const { pluginManager } = require('./PluginManager');
    return pluginManager.getAllPlugins();
  },
  
  getEnabled() {
    const { pluginManager } = require('./PluginManager');
    return pluginManager.getEnabledPlugins();
  },
  
  search(query: string) {
    const { pluginManager } = require('./PluginManager');
    return pluginManager.searchPlugins(query);
  },
  
  async executeHook(hook: keyof Panel1EventMap, payload: any) {
    const { pluginManager } = require('./PluginManager');
    return pluginManager.executeHook(hook, payload);
  },
};