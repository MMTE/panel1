import { trpc } from '../../api/trpc';
import { Plugin, PluginMetadata, PluginConfig, PluginStatus } from './types';

class PluginRegistry {
  private static instance: PluginRegistry;
  private trpcClient: typeof trpc;
  private installedPlugins: Map<string, Plugin> = new Map();

  private constructor() {
    this.trpcClient = trpc;
  }

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * Initialize the plugin registry
   */
  public async initialize(): Promise<void> {
    try {
      const plugins = await this.trpcClient.plugins.listPlugins.query();
      
      // Clear existing plugins
      this.installedPlugins.clear();
      
      // Load each plugin
      for (const plugin of plugins) {
        await this.loadPlugin(plugin);
      }
    } catch (error) {
      console.error('Failed to initialize plugin registry:', error);
      throw error;
    }
  }

  /**
   * Load a plugin into the registry
   */
  private async loadPlugin(pluginData: any): Promise<void> {
    try {
      // Validate plugin metadata
      if (!this.validatePluginMetadata(pluginData.metadata)) {
        throw new Error(`Invalid plugin metadata for ${pluginData.metadata.name}`);
      }

      // Create plugin instance
      const plugin: Plugin = {
        id: pluginData.id,
        metadata: pluginData.metadata,
        status: pluginData.status || 'disabled',
        config: pluginData.config || {},
        instance: null // Will be set when the plugin is enabled
      };

      // Store in registry
      this.installedPlugins.set(plugin.metadata.name, plugin);

      // If plugin should be enabled, enable it
      if (plugin.status === 'enabled') {
        await this.enablePlugin(plugin.metadata.name);
      }
    } catch (error) {
      console.error(`Failed to load plugin ${pluginData.metadata?.name}:`, error);
      throw error;
    }
  }

  /**
   * Install a new plugin
   */
  public async installPlugin(pluginPackage: ArrayBuffer, options: { enable?: boolean } = {}): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('plugin', new Blob([pluginPackage]));
      formData.append('options', JSON.stringify(options));

      const result = await this.trpcClient.plugins.installPlugin.mutate({
        plugin: formData
      });

      if (result.success) {
        await this.loadPlugin(result.plugin);
      }
    } catch (error) {
      console.error('Failed to install plugin:', error);
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  public async uninstallPlugin(name: string): Promise<void> {
    try {
      const plugin = this.installedPlugins.get(name);
      if (!plugin) {
        throw new Error(`Plugin ${name} not found`);
      }

      await this.trpcClient.plugins.uninstallPlugin.mutate({
        id: plugin.id
      });

      this.installedPlugins.delete(name);
    } catch (error) {
      console.error(`Failed to uninstall plugin ${name}:`, error);
      throw error;
    }
  }

  /**
   * Enable a plugin
   */
  public async enablePlugin(name: string): Promise<void> {
    try {
      const plugin = this.installedPlugins.get(name);
      if (!plugin) {
        throw new Error(`Plugin ${name} not found`);
      }

      // Update plugin status in backend
      await this.trpcClient.plugins.updatePluginStatus.mutate({
        id: plugin.id,
        status: 'enabled'
      });

      // Load and initialize plugin instance
      const moduleUrl = `/plugins/${name}/index.js`;
      const module = await import(/* @vite-ignore */ moduleUrl);
      
      if (typeof module.default !== 'function') {
        throw new Error(`Plugin ${name} does not export a default class`);
      }

      plugin.instance = new module.default({
        name: plugin.metadata.name,
        version: plugin.metadata.version,
        config: plugin.config,
        debug: (...args) => console.debug(`[${plugin.metadata.name}]`, ...args)
      });

      await plugin.instance.initialize();
      plugin.status = 'enabled';
    } catch (error) {
      console.error(`Failed to enable plugin ${name}:`, error);
      throw error;
    }
  }

  /**
   * Disable a plugin
   */
  public async disablePlugin(name: string): Promise<void> {
    try {
      const plugin = this.installedPlugins.get(name);
      if (!plugin) {
        throw new Error(`Plugin ${name} not found`);
      }

      // Update plugin status in backend
      await this.trpcClient.plugins.updatePluginStatus.mutate({
        id: plugin.id,
        status: 'disabled'
      });

      // Cleanup plugin instance
      if (plugin.instance) {
        await plugin.instance.cleanup();
        plugin.instance = null;
      }

      plugin.status = 'disabled';
    } catch (error) {
      console.error(`Failed to disable plugin ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get plugin configuration
   */
  public async getPluginConfig(id: string): Promise<PluginConfig> {
    try {
      const config = await this.trpcClient.plugins.getPluginConfig.query({ id });
      return config;
    } catch (error) {
      console.error(`Failed to get plugin config for ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update plugin configuration
   */
  public async setPluginConfig(id: string, config: PluginConfig): Promise<void> {
    try {
      await this.trpcClient.plugins.updatePluginConfig.mutate({
        id,
        config
      });

      const plugin = Array.from(this.installedPlugins.values()).find(p => p.id === id);
      if (plugin) {
        plugin.config = config;
        if (plugin.instance) {
          await plugin.instance.onConfigUpdate(config);
        }
      }
    } catch (error) {
      console.error(`Failed to update plugin config for ${id}:`, error);
      throw error;
    }
  }

  /**
   * Validate plugin metadata
   */
  private validatePluginMetadata(metadata: PluginMetadata): boolean {
    return !!(
      metadata &&
      typeof metadata.name === 'string' &&
      typeof metadata.version === 'string' &&
      typeof metadata.description === 'string' &&
      Array.isArray(metadata.dependencies)
    );
  }

  /**
   * Get all installed plugins
   */
  public getAll(): Plugin[] {
    return Array.from(this.installedPlugins.values());
  }

  /**
   * Get enabled plugins
   */
  public getEnabled(): Plugin[] {
    return Array.from(this.installedPlugins.values())
      .filter(plugin => plugin.status === 'enabled' && plugin.instance !== null);
  }

  /**
   * Get a specific plugin by name
   */
  public get(name: string): Plugin | undefined {
    return this.installedPlugins.get(name);
  }

  /**
   * Check if a plugin is enabled
   */
  public isEnabled(name: string): boolean {
    const plugin = this.installedPlugins.get(name);
    return plugin?.status === 'enabled' && plugin.instance !== null;
  }
}

export const pluginRegistry = PluginRegistry.getInstance();