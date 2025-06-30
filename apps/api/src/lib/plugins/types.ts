 /**
 * Plugin metadata interface
 */
export interface PluginMetadata {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    homepage?: string;
    repository?: string;
    license?: string;
    dependencies?: Record<string, string>;
    tags?: string[];
  }
  
  /**
   * Plugin configuration interface
   */
  export interface PluginConfig {
    enabled: boolean;
    settings?: Record<string, any>;
    [key: string]: any;
  }
  
  /**
   * Plugin lifecycle events
   */
  export enum PluginLifecycleEvent {
    BEFORE_INSTALL = 'beforeInstall',
    AFTER_INSTALL = 'afterInstall',
    BEFORE_UNINSTALL = 'beforeUninstall',
    AFTER_UNINSTALL = 'afterUninstall',
    BEFORE_ENABLE = 'beforeEnable',
    AFTER_ENABLE = 'afterEnable',
    BEFORE_DISABLE = 'beforeDisable',
    AFTER_DISABLE = 'afterDisable',
    BEFORE_UPDATE = 'beforeUpdate',
    AFTER_UPDATE = 'afterUpdate',
  }
  
  /**
   * Plugin hook interface
   */
  export interface PluginHook<T = any> {
    id: string;
    pluginId: string;
    event: string;
    priority: number;
    handler: (context: T) => Promise<void>;
  }
  
  /**
   * Plugin extension point interface
   */
  export interface ExtensionPoint<T = any> {
    id: string;
    description?: string;
    schema?: Record<string, any>;
    defaultConfig?: T;
  }
  
  /**
   * Base plugin interface that all plugins must implement
   */
  export interface Plugin {
    metadata: PluginMetadata;
    
    // Required methods
    install(): Promise<void>;
    uninstall(): Promise<void>;
    enable(): Promise<void>;
    disable(): Promise<void>;
    
    // Optional methods
    configure?(config: PluginConfig): Promise<void>;
    getExtensionPoints?(): ExtensionPoint[];
    getHooks?(): PluginHook[];
    
    // Optional status methods
    getStatus?(): Promise<{
      status: 'active' | 'inactive' | 'error';
      message?: string;
      details?: Record<string, any>;
    }>;
    
    // Optional health check
    healthCheck?(): Promise<{
      healthy: boolean;
      message?: string;
      details?: Record<string, any>;
    }>;
  }
  
  /**
   * Plugin manager events
   */
  export enum PluginManagerEvent {
    PLUGIN_INSTALLED = 'plugin:installed',
    PLUGIN_UNINSTALLED = 'plugin:uninstalled',
    PLUGIN_ENABLED = 'plugin:enabled',
    PLUGIN_DISABLED = 'plugin:disabled',
    PLUGIN_UPDATED = 'plugin:updated',
    PLUGIN_ERROR = 'plugin:error',
    HOOK_REGISTERED = 'hook:registered',
    HOOK_UNREGISTERED = 'hook:unregistered',
    EXTENSION_POINT_REGISTERED = 'extensionPoint:registered',
    EXTENSION_POINT_UNREGISTERED = 'extensionPoint:unregistered',
  }
  
  /**
   * Plugin installation options
   */
  export interface PluginInstallOptions {
    force?: boolean;
    skipDependencyCheck?: boolean;
    config?: PluginConfig;
  }
  
  /**
   * Plugin uninstallation options
   */
  export interface PluginUninstallOptions {
    force?: boolean;
    removeData?: boolean;
    removeConfig?: boolean;
  }
  
  /**
   * Plugin update options
   */
  export interface PluginUpdateOptions {
    force?: boolean;
    keepConfig?: boolean;
    backup?: boolean;
  }
  
  /**
   * Plugin discovery result
   */
  export interface PluginDiscoveryResult {
    id: string;
    path: string;
    metadata: PluginMetadata;
    error?: Error;
  }