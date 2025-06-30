import { pluginRegistry } from './PluginRegistry';
import type { Plugin, PluginInfo, Panel1EventMap } from '@panel1/plugin-sdk';

/**
 * High-level plugin management interface
 */
export class PluginManager {
  private static instance: PluginManager;

  private constructor() {}

  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  /**
   * Install a plugin from a source (URL, file path, etc.)
   */
  async installPlugin(name: string, source: string): Promise<void> {
    try {
      await pluginRegistry.install(name, source);
      console.log(`Plugin ${name} installed successfully`);
    } catch (error) {
      console.error(`Failed to install plugin ${name}:`, error);
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(name: string): Promise<void> {
    try {
      await pluginRegistry.uninstall(name);
      console.log(`Plugin ${name} uninstalled successfully`);
    } catch (error) {
      console.error(`Failed to uninstall plugin ${name}:`, error);
      throw error;
    }
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(name: string): Promise<void> {
    try {
      await pluginRegistry.enable(name);
      console.log(`Plugin ${name} enabled successfully`);
    } catch (error) {
      console.error(`Failed to enable plugin ${name}:`, error);
      throw error;
    }
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(name: string): Promise<void> {
    try {
      await pluginRegistry.disable(name);
      console.log(`Plugin ${name} disabled successfully`);
    } catch (error) {
      console.error(`Failed to disable plugin ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get all plugins
   */
  getAllPlugins(): Plugin[] {
    return pluginRegistry.getAll();
  }

  /**
   * Get enabled plugins
   */
  getEnabledPlugins(): Plugin[] {
    return pluginRegistry.getEnabled();
  }

  /**
   * Get plugin info
   */
  getPluginInfo(name: string): PluginInfo | undefined {
    const plugin = pluginRegistry.get(name);
    return plugin ? {
      name: plugin.metadata.name,
      version: plugin.metadata.version,
      description: plugin.metadata.description,
      status: plugin.status,
      isEnabled: plugin.status === 'enabled' && plugin.instance !== null
    } : undefined;
  }

  /**
   * Get all plugin info
   */
  getAllPluginInfo(): PluginInfo[] {
    return this.getAllPlugins().map(plugin => ({
      name: plugin.metadata.name,
      version: plugin.metadata.version,
      description: plugin.metadata.description,
      status: plugin.status,
      isEnabled: plugin.status === 'enabled' && plugin.instance !== null
    }));
  }

  /**
   * Check if a plugin is enabled
   */
  isPluginEnabled(name: string): boolean {
    return pluginRegistry.isEnabled(name);
  }

  /**
   * Execute a hook across all enabled plugins
   */
  async executeHook<K extends keyof Panel1EventMap>(
    hook: K,
    payload: Parameters<Panel1EventMap[K]>[0]
  ): Promise<void> {
    await pluginRegistry.executeHook(hook, payload);
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): Plugin | undefined {
    return pluginRegistry.get(name);
  }

  /**
   * Register a plugin directly (for development/testing)
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    await pluginRegistry.register(plugin);
  }

  /**
   * Search plugins by keyword
   */
  searchPlugins(query: string): Plugin[] {
    const allPlugins = this.getAllPlugins();
    const lowerQuery = query.toLowerCase();

    return allPlugins.filter(plugin => 
      plugin.metadata.name.toLowerCase().includes(lowerQuery) ||
      plugin.metadata.description.toLowerCase().includes(lowerQuery) ||
      (plugin.metadata.keywords && plugin.metadata.keywords.some(keyword => 
        keyword.toLowerCase().includes(lowerQuery)
      ))
    );
  }

  /**
   * Get plugins by status
   */
  getPluginsByStatus(status: 'installed' | 'enabled' | 'disabled' | 'error'): PluginInfo[] {
    return this.getAllPluginInfo().filter(info => info.status === status);
  }

  /**
   * Update plugin configuration
   */
  async updatePluginConfig<T>(pluginId: string, config: Partial<T>): Promise<void> {
    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // Validate config against schema if available
    if (plugin.configSchema) {
      try {
        plugin.configSchema.parse(config);
      } catch (error) {
        throw new Error(`Invalid plugin configuration: ${error}`);
      }
    }

    // Update config through registry
    const context = (pluginRegistry as any).createContext(pluginId);
    await context.setPluginConfig(pluginId, config);
  }

  /**
   * Get plugin configuration
   */
  async getPluginConfig<T>(pluginId: string): Promise<T> {
    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const context = (pluginRegistry as any).createContext(pluginId);
    return await context.getPluginConfig<T>(pluginId);
  }
}

// Export singleton instance
export const pluginManager = PluginManager.getInstance();