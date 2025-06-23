import { supabase } from '../supabase';
import { auditLogger } from '../audit/AuditLogger';
import { eventEmitter } from '../events/EventEmitter';
import type {
  Plugin,
  PluginRegistryInterface,
  PluginContext,
  PluginInfo,
  PluginStatus,
  Panel1EventMap,
  PluginError,
  PluginValidationError,
  PluginDependencyError,
} from '@panel1/plugin-sdk';

export class PluginRegistry implements PluginRegistryInterface {
  private plugins: Map<string, Plugin> = new Map();
  private pluginInfo: Map<string, PluginInfo> = new Map();
  private enabledPlugins: Set<string> = new Set();
  private eventQueue: Array<{ hook: keyof Panel1EventMap; payload: any }> = [];
  private processing = false;

  constructor() {
    this.loadInstalledPlugins();
  }

  /**
   * Load all installed plugins from the database
   */
  private async loadInstalledPlugins(): Promise<void> {
    try {
      const { data: installedPlugins, error } = await supabase
        .from('plugin_registry')
        .select('*')
        .eq('status', 'installed');

      if (error) {
        console.error('Failed to load installed plugins:', error);
        return;
      }

      for (const pluginData of installedPlugins || []) {
        try {
          // Load plugin module dynamically
          const plugin = await this.loadPluginModule(pluginData.name, pluginData.source);
          if (plugin) {
            this.plugins.set(pluginData.name, plugin);
            this.pluginInfo.set(pluginData.name, {
              metadata: plugin.metadata,
              status: pluginData.enabled ? 'enabled' : 'disabled',
              installedAt: new Date(pluginData.installed_at),
              enabledAt: pluginData.enabled_at ? new Date(pluginData.enabled_at) : undefined,
            });

            if (pluginData.enabled) {
              this.enabledPlugins.add(pluginData.name);
              // Call onEnable lifecycle method
              await this.callLifecycleMethod(plugin, 'onEnable');
            }
          }
        } catch (error) {
          console.error(`Failed to load plugin ${pluginData.name}:`, error);
          this.pluginInfo.set(pluginData.name, {
            metadata: { name: pluginData.name } as any,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            installedAt: new Date(pluginData.installed_at),
          });
        }
      }
    } catch (error) {
      console.error('Failed to load plugins:', error);
    }
  }

  /**
   * Dynamically load a plugin module
   */
  private async loadPluginModule(name: string, source: string): Promise<Plugin | null> {
    try {
      // In a real implementation, this would load the plugin from the filesystem
      // or from a remote source. For now, we'll simulate this.
      
      // This would be something like:
      // const module = await import(`/plugins/${name}/dist/index.js`);
      // return module.default;
      
      console.warn(`Plugin loading not fully implemented for ${name} from ${source}`);
      return null;
    } catch (error) {
      throw new PluginError(`Failed to load plugin module: ${error}`, name);
    }
  }

  /**
   * Register a plugin in the registry
   */
  async register(plugin: Plugin): Promise<void> {
    const { name } = plugin.metadata;

    // Validate plugin
    this.validatePlugin(plugin);

    // Check dependencies
    await this.checkDependencies(plugin);

    // Store plugin
    this.plugins.set(name, plugin);
    this.pluginInfo.set(name, {
      metadata: plugin.metadata,
      status: 'installed',
      installedAt: new Date(),
    });

    // Save to database
    await this.savePluginToDatabase(plugin, 'installed');

    // Call onInstall lifecycle method
    await this.callLifecycleMethod(plugin, 'onInstall');

    // Log plugin installation
    await auditLogger.logPluginAction('install', name, plugin.metadata);

    // Emit plugin installed event
    await this.executeHook('plugin.installed', { plugin: name, context: this.createContext(name) });
  }

  /**
   * Unregister a plugin from the registry
   */
  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new PluginError(`Plugin ${name} not found`, name);
    }

    // Disable if enabled
    if (this.enabledPlugins.has(name)) {
      await this.disable(name);
    }

    // Call onUninstall lifecycle method
    await this.callLifecycleMethod(plugin, 'onUninstall');

    // Remove from registry
    this.plugins.delete(name);
    this.pluginInfo.delete(name);

    // Remove from database
    await supabase
      .from('plugin_registry')
      .delete()
      .eq('name', name);

    // Remove plugin settings
    await supabase
      .from('plugin_settings')
      .delete()
      .eq('plugin_id', name);

    // Log plugin uninstallation
    await auditLogger.logPluginAction('uninstall', name);

    // Emit plugin uninstalled event
    await this.executeHook('plugin.uninstalled', { plugin: name, context: this.createContext(name) });
  }

  /**
   * Get a specific plugin
   */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugins
   */
  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all enabled plugins
   */
  getEnabled(): Plugin[] {
    return Array.from(this.enabledPlugins)
      .map(name => this.plugins.get(name))
      .filter((plugin): plugin is Plugin => plugin !== undefined);
  }

  /**
   * Check if a plugin is enabled
   */
  isEnabled(name: string): boolean {
    return this.enabledPlugins.has(name);
  }

  /**
   * Enable a plugin
   */
  async enable(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new PluginError(`Plugin ${name} not found`, name);
    }

    if (this.enabledPlugins.has(name)) {
      return; // Already enabled
    }

    // Check dependencies
    await this.checkDependencies(plugin);

    // Enable plugin
    this.enabledPlugins.add(name);

    // Update database
    await supabase
      .from('plugin_registry')
      .update({ 
        enabled: true, 
        enabled_at: new Date().toISOString() 
      })
      .eq('name', name);

    // Update plugin info
    const info = this.pluginInfo.get(name);
    if (info) {
      info.status = 'enabled';
      info.enabledAt = new Date();
    }

    // Call onEnable lifecycle method
    await this.callLifecycleMethod(plugin, 'onEnable');

    // Log plugin enablement
    await auditLogger.logPluginAction('enable', name);

    // Emit plugin enabled event
    await this.executeHook('plugin.enabled', { plugin: name, context: this.createContext(name) });
  }

  /**
   * Disable a plugin
   */
  async disable(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new PluginError(`Plugin ${name} not found`, name);
    }

    if (!this.enabledPlugins.has(name)) {
      return; // Already disabled
    }

    // Call onDisable lifecycle method
    await this.callLifecycleMethod(plugin, 'onDisable');

    // Disable plugin
    this.enabledPlugins.delete(name);

    // Update database
    await supabase
      .from('plugin_registry')
      .update({ 
        enabled: false, 
        enabled_at: null 
      })
      .eq('name', name);

    // Update plugin info
    const info = this.pluginInfo.get(name);
    if (info) {
      info.status = 'disabled';
      info.enabledAt = undefined;
    }

    // Log plugin disablement
    await auditLogger.logPluginAction('disable', name);

    // Emit plugin disabled event
    await this.executeHook('plugin.disabled', { plugin: name, context: this.createContext(name) });
  }

  /**
   * Install a plugin from a source
   */
  async install(name: string, source: string): Promise<void> {
    try {
      // Load plugin from source
      const plugin = await this.loadPluginModule(name, source);
      if (!plugin) {
        throw new PluginError(`Failed to load plugin from source: ${source}`, name);
      }

      // Register the plugin
      await this.register(plugin);
    } catch (error) {
      throw new PluginError(
        `Failed to install plugin ${name}: ${error}`,
        name
      );
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(name: string): Promise<void> {
    await this.unregister(name);
  }

  /**
   * Execute a hook across all enabled plugins
   */
  async executeHook<K extends keyof Panel1EventMap>(
    hook: K,
    payload: Parameters<Panel1EventMap[K]>[0]
  ): Promise<void> {
    // Add to event queue
    this.eventQueue.push({ hook, payload });

    // Process queue if not already processing
    if (!this.processing) {
      await this.processEventQueue();
    }
  }

  /**
   * Process the event queue
   */
  private async processEventQueue(): Promise<void> {
    this.processing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (!event) continue;

      const { hook, payload } = event;

      // Get all enabled plugins that have this hook
      const pluginsWithHook = this.getEnabled().filter(
        plugin => plugin.hooks && plugin.hooks[hook]
      );

      // Execute hooks in parallel
      const promises = pluginsWithHook.map(async (plugin) => {
        try {
          const handler = plugin.hooks![hook];
          if (handler) {
            await handler(payload);
          }
        } catch (error) {
          console.error(`Error executing hook ${hook} for plugin ${plugin.metadata.name}:`, error);
          
          // Log error to database
          await this.logPluginError(plugin.metadata.name, hook, error);
        }
      });

      await Promise.allSettled(promises);
    }

    this.processing = false;
  }

  /**
   * Validate a plugin
   */
  private validatePlugin(plugin: Plugin): void {
    try {
      // Validate metadata
      if (!plugin.metadata || !plugin.metadata.name || !plugin.metadata.version) {
        throw new PluginValidationError('Plugin metadata is invalid', plugin.metadata?.name || 'unknown');
      }

      // Validate config schema if provided
      if (plugin.configSchema) {
        // Zod schema validation happens automatically
      }

      // Validate hooks
      if (plugin.hooks) {
        for (const hookName of Object.keys(plugin.hooks)) {
          if (typeof plugin.hooks[hookName as keyof Panel1EventMap] !== 'function') {
            throw new PluginValidationError(`Hook ${hookName} must be a function`, plugin.metadata.name);
          }
        }
      }

      // Validate routes
      if (plugin.routes) {
        for (const route of Object.keys(plugin.routes)) {
          if (typeof plugin.routes[route] !== 'function') {
            throw new PluginValidationError(`Route ${route} must be a function`, plugin.metadata.name);
          }
        }
      }

    } catch (error) {
      if (error instanceof PluginValidationError) {
        throw error;
      }
      throw new PluginValidationError(`Plugin validation failed: ${error}`, plugin.metadata?.name || 'unknown');
    }
  }

  /**
   * Check plugin dependencies
   */
  private async checkDependencies(plugin: Plugin): Promise<void> {
    if (!plugin.metadata.dependencies) {
      return;
    }

    for (const [depName, depVersion] of Object.entries(plugin.metadata.dependencies)) {
      const depPlugin = this.plugins.get(depName);
      
      if (!depPlugin) {
        throw new PluginDependencyError(
          `Required dependency ${depName} is not installed`,
          plugin.metadata.name
        );
      }

      if (!this.enabledPlugins.has(depName)) {
        throw new PluginDependencyError(
          `Required dependency ${depName} is not enabled`,
          plugin.metadata.name
        );
      }

      // TODO: Implement semantic version checking
      // if (!semver.satisfies(depPlugin.metadata.version, depVersion)) {
      //   throw new PluginDependencyError(
      //     `Dependency ${depName} version ${depPlugin.metadata.version} does not satisfy ${depVersion}`,
      //     plugin.metadata.name
      //   );
      // }
    }
  }

  /**
   * Call a lifecycle method on a plugin
   */
  private async callLifecycleMethod(
    plugin: Plugin,
    method: 'onInstall' | 'onEnable' | 'onDisable' | 'onUninstall'
  ): Promise<void> {
    try {
      const lifecycleMethod = plugin[method];
      if (lifecycleMethod) {
        const context = this.createContext(plugin.metadata.name);
        await lifecycleMethod(context);
      }
    } catch (error) {
      console.error(`Error calling ${method} for plugin ${plugin.metadata.name}:`, error);
      await this.logPluginError(plugin.metadata.name, method, error);
      throw error;
    }
  }

  /**
   * Create a plugin context
   */
  createContext(pluginId: string): PluginContext {
    return {
      pluginId,
      logger: {
        info: (...args) => console.log(`[${pluginId}]`, ...args),
        warn: (...args) => console.warn(`[${pluginId}]`, ...args),
        error: (...args) => console.error(`[${pluginId}]`, ...args),
        debug: (...args) => console.debug(`[${pluginId}]`, ...args),
      },
      supabase,
      eventEmitter,
      auditLogger,
      async getPluginConfig<T>(id: string): Promise<T> {
        const { data, error } = await supabase
          .from('plugin_settings')
          .select('settings')
          .eq('plugin_id', id)
          .single();

        if (error) {
          throw new Error(`Failed to get plugin config: ${error.message}`);
        }

        return data?.settings || {};
      },
      async setPluginConfig<T>(id: string, config: Partial<T>): Promise<void> {
        const { error } = await supabase
          .from('plugin_settings')
          .upsert({
            plugin_id: id,
            settings: config,
            updated_at: new Date().toISOString(),
          });

        if (error) {
          throw new Error(`Failed to set plugin config: ${error.message}`);
        }

        // Log configuration change
        await auditLogger.logPluginAction('configure', id, config);
      },
      async createSettings<T>(settings: T): Promise<void> {
        const { error } = await supabase
          .from('plugin_settings')
          .insert({
            plugin_id: pluginId,
            settings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (error) {
          throw new Error(`Failed to create plugin settings: ${error.message}`);
        }
      },
      async deleteSettings(): Promise<void> {
        const { error } = await supabase
          .from('plugin_settings')
          .delete()
          .eq('plugin_id', pluginId);

        if (error) {
          throw new Error(`Failed to delete plugin settings: ${error.message}`);
        }
      },
      translate: (key: string, replacements?: Record<string, string>) => {
        // TODO: Implement i18n translation
        let translated = key;
        if (replacements) {
          for (const [placeholder, value] of Object.entries(replacements)) {
            translated = translated.replace(`{${placeholder}}`, value);
          }
        }
        return translated;
      },
      async emit(eventName: string, data: any): Promise<void> {
        await eventEmitter.emit(eventName as keyof Panel1EventMap, data, {
          entityType: 'plugin',
          entityId: pluginId,
        });
      },
    };
  }

  /**
   * Save plugin to database
   */
  private async savePluginToDatabase(plugin: Plugin, status: PluginStatus): Promise<void> {
    const { error } = await supabase
      .from('plugin_registry')
      .upsert({
        name: plugin.metadata.name,
        version: plugin.metadata.version,
        description: plugin.metadata.description,
        author: plugin.metadata.author,
        metadata: plugin.metadata,
        status,
        enabled: false,
        installed_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to save plugin to database: ${error.message}`);
    }
  }

  /**
   * Log plugin error to database
   */
  private async logPluginError(pluginId: string, operation: string, error: any): Promise<void> {
    try {
      await supabase
        .from('plugin_errors')
        .insert({
          plugin_id: pluginId,
          operation,
          error_message: error instanceof Error ? error.message : String(error),
          error_stack: error instanceof Error ? error.stack : null,
          occurred_at: new Date().toISOString(),
        });
    } catch (logError) {
      console.error('Failed to log plugin error:', logError);
    }
  }

  /**
   * Get plugin info
   */
  getPluginInfo(name: string): PluginInfo | undefined {
    return this.pluginInfo.get(name);
  }

  /**
   * Get all plugin info
   */
  getAllPluginInfo(): PluginInfo[] {
    return Array.from(this.pluginInfo.values());
  }
}

// Create singleton instance
export const pluginRegistry = new PluginRegistry();