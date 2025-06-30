import { EventEmitter } from 'events';
import path from 'path';
import { db } from '../../db';
import { plugins, pluginConfigs } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { Logger } from '../logging/Logger';
import { EventService } from '../events/EventService';
import {
  Plugin,
  PluginMetadata,
  PluginConfig,
  PluginHook,
  ExtensionPoint,
  PluginLifecycleEvent,
  PluginManagerEvent,
  PluginInstallOptions,
  PluginUninstallOptions,
  PluginUpdateOptions,
  PluginDiscoveryResult
} from './types';

export class PluginManager extends EventEmitter {
  private static instance: PluginManager;
  private plugins: Map<string, Plugin> = new Map();
  private hooks: Map<string, PluginHook[]> = new Map();
  private extensionPoints: Map<string, ExtensionPoint> = new Map();
  private initialized = false;
  private logger = Logger.getInstance();
  private eventService = EventService.getInstance();

  private constructor() {
    super();
    this.setupEventHandlers();
  }

  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  private setupEventHandlers(): void {
    // Listen for plugin lifecycle events
    Object.values(PluginLifecycleEvent).forEach(event => {
      this.on(event, async (pluginId: string) => {
        await this.eventService.emit(`plugin.lifecycle.${event}`, { pluginId });
      });
    });

    // Listen for plugin manager events
    Object.values(PluginManagerEvent).forEach(event => {
      this.on(event, async (data: any) => {
        await this.eventService.emit(`plugin.manager.${event}`, data);
      });
    });
  }

  /**
   * Initialize the plugin manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('🔄 Initializing Plugin Manager...');

    try {
      // Load installed plugins from database
      const installedPlugins = await db
        .select()
        .from(plugins)
        .where(eq(plugins.status, 'installed'));

      // Load and initialize each plugin
      for (const pluginData of installedPlugins) {
        try {
          const plugin = await this.loadPlugin(pluginData.id);
          if (plugin) {
            await this.initializePlugin(plugin, pluginData.id);
            this.logger.info(`👍 Successfully loaded and initialized plugin: ${pluginData.name} v${pluginData.version}`);
          }
        } catch (error) {
          this.logger.error(`Failed to load plugin: ${pluginData.id}`, { error: String(error) });
          // Optionally update plugin status to 'error' in DB
        }
      }

      this.initialized = true;
      this.logger.info('✅ Plugin Manager initialized successfully', {
        pluginsCount: this.plugins.size,
        hooksCount: Array.from(this.hooks.values()).flat().length,
        extensionPointsCount: this.extensionPoints.size
      });
    } catch (error) {
      this.logger.error('❌ Failed to initialize Plugin Manager', { error: String(error) });
      throw error;
    }
  }

  /**
   * Load a plugin by ID from the filesystem
   */
  private async loadPlugin(pluginId: string): Promise<Plugin | null> {
    const pluginsDir = process.env.PLUGINS_DIR || path.join(process.cwd(), 'plugins');
    const pluginPath = path.join(pluginsDir, pluginId, 'index.js');
    
    this.logger.info(`Attempting to load plugin from: ${pluginPath}`);

    try {
      // Check if plugin file exists
      const fs = await import('fs/promises');
      try {
        await fs.access(pluginPath);
      } catch (accessError) {
        this.logger.error(`Plugin file not found: ${pluginPath}`);
        return null;
      }

      // Use dynamic import to load the module. The cache-busting `?v=` is important
      // for development to ensure the latest version is loaded on restart.
      const module = await import(`${pluginPath}?v=${Date.now()}`);
      
      if (!module.default) {
        throw new Error('Invalid plugin structure: module.default is not defined');
      }
      
      const plugin: Plugin = module.default;

      // Basic validation
      if (!plugin.metadata) {
        throw new Error('Invalid plugin structure: metadata is missing');
      }

      if (plugin.metadata.id !== pluginId) {
        throw new Error(`Plugin ID mismatch: expected '${pluginId}', but got '${plugin.metadata.id}' from metadata.`);
      }

      // Validate required plugin methods
      if (typeof plugin.install !== 'function') {
        throw new Error('Invalid plugin structure: install method is required');
      }
      
      this.logger.info(`✅ Successfully loaded plugin: ${plugin.metadata.name} v${plugin.metadata.version}`);
      return plugin;
    } catch (error) {
      this.logger.error(`❌ Failed to load plugin code for '${pluginId}':`, { error: String(error) });
      return null;
    }
  }

  /**
   * Initialize a plugin
   */
  private async initializePlugin(plugin: Plugin, pluginId: string): Promise<void> {
    try {
      // Load plugin configuration
      const config = await this.getPluginConfig(pluginId);

      // Configure the plugin if it has a configure method
      if (plugin.configure && config) {
        await plugin.configure(config);
      }

      // Register plugin hooks
      if (plugin.getHooks) {
        const hooks = plugin.getHooks();
        hooks.forEach(hook => this.registerHook(hook));
      }

      // Register plugin extension points
      if (plugin.getExtensionPoints) {
        const extensionPoints = plugin.getExtensionPoints();
        extensionPoints.forEach(ep => this.registerExtensionPoint(ep));
      }

      // Store the plugin instance
      this.plugins.set(pluginId, plugin);

      this.logger.info(`✅ Plugin initialized: ${pluginId}`, {
        hooks: plugin.getHooks?.()?.length || 0,
        extensionPoints: plugin.getExtensionPoints?.()?.length || 0
      });
    } catch (error) {
      this.logger.error(`Failed to initialize plugin: ${pluginId}`, { error: String(error) });
      throw error;
    }
  }

  /**
   * Get plugin configuration
   */
  private async getPluginConfig(pluginId: string): Promise<PluginConfig | null> {
    const config = await db
      .select()
      .from(pluginConfigs)
      .where(eq(pluginConfigs.pluginId, pluginId))
      .limit(1);

    return config.length > 0 ? config[0].config as PluginConfig : null;
  }

  /**
   * Register a plugin hook
   */
  private registerHook(hook: PluginHook): void {
    const hooks = this.hooks.get(hook.event) || [];
    hooks.push(hook);
    hooks.sort((a, b) => b.priority - a.priority);
    this.hooks.set(hook.event, hooks);
    this.emit(PluginManagerEvent.HOOK_REGISTERED, hook);
  }

  /**
   * Register an extension point
   */
  private registerExtensionPoint(extensionPoint: ExtensionPoint): void {
    this.extensionPoints.set(extensionPoint.id, extensionPoint);
    this.emit(PluginManagerEvent.EXTENSION_POINT_REGISTERED, extensionPoint);
  }

  /**
   * Install a plugin
   */
  async installPlugin(
    pluginId: string,
    options: PluginInstallOptions = {}
  ): Promise<void> {
    this.logger.info(`🔄 Installing plugin: ${pluginId}`, options);

    try {
      // Emit before install event
      this.emit(PluginLifecycleEvent.BEFORE_INSTALL, pluginId);

      // Load the plugin
      const plugin = await this.loadPlugin(pluginId);
      if (!plugin) {
        this.logger.error(`Plugin not found: ${pluginId}. Skipping installation.`);
        this.emit(PluginManagerEvent.PLUGIN_ERROR, { pluginId, error: `Plugin not found: ${pluginId}` });
        return;
      }

      // Check dependencies if not skipped
      if (!options.skipDependencyCheck) {
        await this.checkDependencies(plugin.metadata);
      }

      // Install the plugin
      await plugin.install();

      // Save plugin metadata to database
      await db.insert(plugins).values({
        id: pluginId,
        name: plugin.metadata.name,
        version: plugin.metadata.version,
        description: plugin.metadata.description,
        status: 'installed',
        installedAt: new Date(),
        updatedAt: new Date()
      });

      // Save plugin configuration if provided
      if (options.config) {
        await db.insert(pluginConfigs).values({
          pluginId,
          config: options.config,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // Initialize the plugin
      await this.initializePlugin(plugin, pluginId);

      // Emit after install event
      this.emit(PluginLifecycleEvent.AFTER_INSTALL, pluginId);
      this.emit(PluginManagerEvent.PLUGIN_INSTALLED, {
        pluginId,
        metadata: plugin.metadata
      });

      this.logger.info(`✅ Successfully installed plugin: ${pluginId}`);
    } catch (error) {
      // Rollback on error
      this.emit(PluginManagerEvent.PLUGIN_ERROR, { pluginId, error: String(error) });
      this.logger.error(`❌ Failed to install plugin: ${pluginId}`, {
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(
    pluginId: string,
    options: PluginUninstallOptions = {}
  ): Promise<void> {
    this.logger.info(`🔄 Uninstalling plugin: ${pluginId}`, options);

    try {
      // Emit before uninstall event
      this.emit(PluginLifecycleEvent.BEFORE_UNINSTALL, pluginId);

      const plugin = this.plugins.get(pluginId);
      if (!plugin && !options.force) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      if (plugin) {
        // Unregister hooks
        if (plugin.getHooks) {
          const hooks = plugin.getHooks();
          hooks.forEach(hook => {
            const eventHooks = this.hooks.get(hook.event) || [];
            const filtered = eventHooks.filter(h => h.pluginId !== pluginId);
            if (filtered.length > 0) {
              this.hooks.set(hook.event, filtered);
            } else {
              this.hooks.delete(hook.event);
            }
            this.emit(PluginManagerEvent.HOOK_UNREGISTERED, hook);
          });
        }

        // Unregister extension points
        if (plugin.getExtensionPoints) {
          const extensionPoints = plugin.getExtensionPoints();
          extensionPoints.forEach(ep => {
            this.extensionPoints.delete(ep.id);
            this.emit(PluginManagerEvent.EXTENSION_POINT_UNREGISTERED, ep);
          });
        }

        // Call plugin's uninstall method
        await plugin.uninstall();
      }

      // Remove from database
      await db.delete(plugins).where(eq(plugins.id, pluginId));

      // Remove configuration if requested
      if (options.removeConfig) {
        await db.delete(pluginConfigs).where(eq(pluginConfigs.pluginId, pluginId));
      }

      // Remove from memory
      this.plugins.delete(pluginId);

      // Emit after uninstall event
      this.emit(PluginLifecycleEvent.AFTER_UNINSTALL, pluginId);
      this.emit(PluginManagerEvent.PLUGIN_UNINSTALLED, { pluginId });

      this.logger.info(`✅ Successfully uninstalled plugin: ${pluginId}`);
    } catch (error) {
      // Rollback on error
      this.emit(PluginManagerEvent.PLUGIN_ERROR, { pluginId, error: String(error) });
      this.logger.error(`❌ Failed to uninstall plugin: ${pluginId}`, {
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string): Promise<void> {
    this.logger.info(`🔄 Enabling plugin: ${pluginId}`);

    try {
      // Emit before enable event
      this.emit(PluginLifecycleEvent.BEFORE_ENABLE, pluginId);

      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      // Enable the plugin
      await plugin.enable();

      // Update database status
      await db
        .update(plugins)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(plugins.id, pluginId));

      // Emit after enable event
      this.emit(PluginLifecycleEvent.AFTER_ENABLE, pluginId);
      this.emit(PluginManagerEvent.PLUGIN_ENABLED, { pluginId });

      this.logger.info(`✅ Plugin enabled successfully: ${pluginId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to enable plugin: ${pluginId}`, { error: String(error) });
      this.emit(PluginManagerEvent.PLUGIN_ERROR, {
        pluginId,
        error,
        operation: 'enable'
      });
      throw error;
    }
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    this.logger.info(`🔄 Disabling plugin: ${pluginId}`);

    try {
      // Emit before disable event
      this.emit(PluginLifecycleEvent.BEFORE_DISABLE, pluginId);

      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      // Disable the plugin
      await plugin.disable();

      // Update database status
      await db
        .update(plugins)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(plugins.id, pluginId));

      // Emit after disable event
      this.emit(PluginLifecycleEvent.AFTER_DISABLE, pluginId);
      this.emit(PluginManagerEvent.PLUGIN_DISABLED, { pluginId });

      this.logger.info(`✅ Plugin disabled successfully: ${pluginId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to disable plugin: ${pluginId}`, { error: String(error) });
      this.emit(PluginManagerEvent.PLUGIN_ERROR, {
        pluginId,
        error,
        operation: 'disable'
      });
      throw error;
    }
  }

  /**
   * Check plugin dependencies
   */
  private async checkDependencies(metadata: PluginMetadata): Promise<void> {
    if (!metadata.dependencies) return;

    const missing: string[] = [];
    const incompatible: string[] = [];

    for (const [depId, version] of Object.entries(metadata.dependencies)) {
      const dep = this.plugins.get(depId);
      if (!dep) {
        missing.push(depId);
      } else if (!this.isVersionCompatible(dep.metadata.version, version)) {
        incompatible.push(`${depId}@${version}`);
      }
    }

    if (missing.length > 0 || incompatible.length > 0) {
      throw new Error(
        `Dependency check failed:\n` +
        `Missing: ${missing.join(', ')}\n` +
        `Incompatible: ${incompatible.join(', ')}`
      );
    }
  }

  /**
   * Check if a version is compatible
   */
  private isVersionCompatible(actual: string, required: string): boolean {
    // Simple version check for now
    // In a real implementation, this would use semver
    return actual === required;
  }

  /**
   * Execute hooks for an event
   */
  async executeHooks<T>(event: string, context: T): Promise<void> {
    const hooks = this.hooks.get(event) || [];
    for (const hook of hooks) {
      try {
        await hook.handler(context);
      } catch (error) {
        this.logger.error(`Error executing hook for event: ${event}`, {
          plugin: hook.pluginId,
          error: String(error),
        });
      }
    }
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): Map<string, Plugin> {
    return this.plugins;
  }

  /**
   * Get all registered hooks
   */
  getHooks(): Map<string, PluginHook[]> {
    return this.hooks;
  }

  /**
   * Get all registered extension points
   */
  getExtensionPoints(): Map<string, ExtensionPoint> {
    return this.extensionPoints;
  }

  /**
   * Shutdown the plugin manager
   */
  async shutdown(): Promise<void> {
    this.logger.info('🔄 Shutting down Plugin Manager...');

    for (const [pluginId, plugin] of this.plugins.entries()) {
      if ('shutdown' in plugin && typeof (plugin as any).shutdown === 'function') {
        try {
          await (plugin as any).shutdown();
          this.logger.info(`🔌 Plugin shut down successfully: ${pluginId}`);
        } catch (error) {
          this.logger.error(`Error shutting down plugin: ${pluginId}`, { error: String(error) });
        }
      }
    }
    this.plugins.clear();
    this.hooks.clear();
    this.extensionPoints.clear();
    this.initialized = false;

    this.logger.info('✅ Plugin Manager shut down complete.');
  }

  /**
   * Get all active plugins (status === 'active')
   */
  async getActivePlugins(): Promise<Plugin[]> {
    // Query DB for active plugin IDs
    const activeRows = await db.select().from(plugins).where(eq(plugins.status, 'active'));
    const activeIds = new Set(activeRows.map(row => row.id));
    // Return only those plugins that are loaded and active
    return Array.from(this.plugins.entries())
      .filter(([id]) => activeIds.has(id))
      .map(([, plugin]) => plugin);
  }
}