import React from 'react';
import { z } from 'zod';

// --- 1. Core Plugin Metadata and Configuration Schemas ---

/**
 * @interface PluginMetadata
 * @description Defines the essential metadata for a Panel1 plugin, as declared in plugin.json.
 * This information is used by Panel1 to identify, validate, and manage plugins.
 */
export interface PluginMetadata {
  /** A unique identifier for the plugin (e.g., "my-analytics-plugin"). Lowercase alphanumeric, dashes allowed. */
  name: string;
  /** The semantic version of the plugin (e.g., "1.0.0"). */
  version: string;
  /** A short description of the plugin's functionality. */
  description: string;
  /** The author(s) of the plugin. */
  author: string;
  /** Semantic version range of Panel1 core required by this plugin (e.g., ">=0.2.0 <0.3.0"). */
  panel1: string;
  /** Optional: A map of Panel1 plugin IDs to their semantic version ranges, indicating dependencies on other plugins. */
  dependencies?: { [pluginId: string]: string };
  /** Optional: Plugin homepage URL */
  homepage?: string;
  /** Optional: Plugin repository URL */
  repository?: string;
  /** Optional: Plugin license */
  license?: string;
  /** Optional: Plugin keywords for discovery */
  keywords?: string[];
  /** Optional: Plugin permissions required */
  permissions?: string[];
  /** Optional: UI slots this plugin provides */
  uiSlots?: string[];
  /** Optional: API routes this plugin provides */
  apiRoutes?: string[];
}

/**
 * @typedef PluginConfigSchema
 * @description A Zod schema defining the structure and validation rules for a plugin's configuration.
 * This allows Panel1 to provide a type-safe and validated settings UI.
 */
export type PluginConfigSchema<T extends z.ZodObject<any>> = T;

/**
 * @function definePluginConfig
 * @template T
 * @param {T} schema - The Zod object schema for the plugin's configuration.
 * @returns {PluginConfigSchema<T>} The provided schema, typed correctly.
 * @description A helper function to define a plugin's configuration schema using Zod.
 * This aids in type inference and ensures the schema conforms to expectations.
 */
export function definePluginConfig<T extends z.ZodObject<any>>(schema: T): PluginConfigSchema<T> {
  return schema;
}

// --- 2. Plugin Context and Core Services ---

/**
 * @interface PluginContext
 * @description Provides plugins with access to core Panel1 services and utilities.
 * This context object is passed to lifecycle methods, event hooks, and route handlers.
 */
export interface PluginContext {
  /** The unique ID of the plugin currently being executed. */
  readonly pluginId: string;
  /** A logger instance scoped to the plugin, sending output to Panel1's central logs. */
  readonly logger: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug: (...args: any[]) => void;
  };
  /** Access to Supabase client for database operations */
  readonly supabase: any;
  /** Current authenticated user (if any) */
  readonly user?: {
    id: string;
    email: string;
    role: string;
  };
  /** Event emitter for triggering system events */
  readonly eventEmitter: {
    emit: (eventType: string, data: any, options?: any) => Promise<void>;
  };
  /** Audit logger for compliance tracking */
  readonly auditLogger: {
    log: (entry: any) => Promise<void>;
    logPluginAction: (action: string, pluginId: string, metadata?: any, userId?: string) => Promise<void>;
  };
  /**
   * Retrieves the current configuration settings for a given plugin, validated against its schema.
   * @template TConfig The type of the plugin's configuration.
   * @param {string} pluginId - The ID of the plugin whose configuration to retrieve.
   * @returns {Promise<TConfig>} The plugin's configuration.
   */
  getPluginConfig<TConfig extends z.infer<z.ZodObject<any>>>(pluginId: string): Promise<TConfig>;
  /**
   * Sets or updates the configuration settings for a given plugin.
   * @template TConfig The type of the plugin's configuration.
   * @param {string} pluginId - The ID of the plugin whose configuration to update.
   * @param {Partial<TConfig>} newConfig - The partial new configuration to apply.
   * @returns {Promise<void>}
   */
  setPluginConfig<TConfig extends z.infer<z.ZodObject<any>>>(pluginId: string, newConfig: Partial<TConfig>): Promise<void>;
  /**
   * Creates initial settings for a plugin upon installation.
   * This should typically be called only once during the `onInstall` lifecycle method.
   * @template TConfig The type of the plugin's configuration.
   * @param {TConfig} defaultSettings - The initial default settings.
   * @returns {Promise<void>}
   */
  createSettings<TConfig extends z.infer<z.ZodObject<any>>>(defaultSettings: TConfig): Promise<void>;
  /**
   * Deletes all settings associated with a plugin.
   * This should typically be called only once during the `onUninstall` lifecycle method.
   * @returns {Promise<void>}
   */
  deleteSettings(): Promise<void>;
  /**
   * Translates a given key into the current user's preferred language.
   * @param {string} key - The translation key.
   * @param {Record<string, string>} [replacements] - Optional key-value pairs for placeholders in the translation string.
   * @returns {string} The translated string.
   */
  translate(key: string, replacements?: Record<string, string>): string;
  /**
   * Emit an event to other plugins
   * @param {string} eventName - The event name
   * @param {any} data - The event data
   * @returns {Promise<void>}
   */
  emit(eventName: string, data: any): Promise<void>;
}

// --- 3. Panel1 Event Hooks System ---

/**
 * @typedef Panel1EventMap
 * @description Defines the types of core Panel1 events that plugins can subscribe to.
 * This is a central registry of all available hooks.
 */
export type Panel1EventMap = {
  // User events
  'user.created': (payload: { user: any; context: PluginContext }) => Promise<void> | void;
  'user.updated': (payload: { user: any; oldValues?: any; newValues?: any; context: PluginContext }) => Promise<void> | void;
  'user.deleted': (payload: { user: any; context: PluginContext }) => Promise<void> | void;
  'user.loggedIn': (payload: { user: any; context: PluginContext }) => Promise<void> | void;
  'user.loggedOut': (payload: { user: any; context: PluginContext }) => Promise<void> | void;
  
  // Client events
  'client.created': (payload: { client: any; context: PluginContext }) => Promise<void> | void;
  'client.updated': (payload: { client: any; oldValues?: any; newValues?: any; context: PluginContext }) => Promise<void> | void;
  'client.deleted': (payload: { client: any; context: PluginContext }) => Promise<void> | void;
  
  // Invoice events
  'invoice.created': (payload: { invoice: any; context: PluginContext }) => Promise<void> | void;
  'invoice.paid': (payload: { invoice: any; context: PluginContext }) => Promise<void> | void;
  'invoice.overdue': (payload: { invoice: any; context: PluginContext }) => Promise<void> | void;
  'invoice.cancelled': (payload: { invoice: any; context: PluginContext }) => Promise<void> | void;
  'invoice.beforeGenerate': (payload: { invoice: any; context: PluginContext }) => Promise<any> | any;
  
  // Subscription events
  'subscription.created': (payload: { subscription: any; context: PluginContext }) => Promise<void> | void;
  'subscription.updated': (payload: { subscription: any; oldValues?: any; newValues?: any; context: PluginContext }) => Promise<void> | void;
  'subscription.cancelled': (payload: { subscription: any; context: PluginContext }) => Promise<void> | void;
  'subscription.renewed': (payload: { subscription: any; context: PluginContext }) => Promise<void> | void;
  'subscription.upgraded': (payload: { subscription: any; oldPlan: any; newPlan: any; context: PluginContext }) => Promise<void> | void;
  'subscription.downgraded': (payload: { subscription: any; oldPlan: any; newPlan: any; context: PluginContext }) => Promise<void> | void;
  
  // Payment events
  'payment.completed': (payload: { payment: any; context: PluginContext }) => Promise<void> | void;
  'payment.failed': (payload: { payment: any; context: PluginContext }) => Promise<void> | void;
  'payment.refunded': (payload: { payment: any; context: PluginContext }) => Promise<void> | void;
  
  // System events
  'system.startup': (payload: { context: PluginContext }) => Promise<void> | void;
  'system.shutdown': (payload: { context: PluginContext }) => Promise<void> | void;
  
  // Plugin events
  'plugin.installed': (payload: { plugin: string; context: PluginContext }) => Promise<void> | void;
  'plugin.uninstalled': (payload: { plugin: string; context: PluginContext }) => Promise<void> | void;
  'plugin.enabled': (payload: { plugin: string; context: PluginContext }) => Promise<void> | void;
  'plugin.disabled': (payload: { plugin: string; context: PluginContext }) => Promise<void> | void;
  
  // Webhook events
  'webhook.delivered': (payload: { webhook: any; delivery: any; context: PluginContext }) => Promise<void> | void;
  'webhook.failed': (payload: { webhook: any; delivery: any; error: any; context: PluginContext }) => Promise<void> | void;
  
  // Audit events
  'audit.logged': (payload: { entry: any; context: PluginContext }) => Promise<void> | void;
};

/**
 * @typedef PluginHooks
 * @description A type mapping hook names to their respective handler functions provided by a plugin.
 */
export type PluginHooks = {
  [K in keyof Panel1EventMap]?: Panel1EventMap[K];
};

// --- 4. Custom API Routes ---

/**
 * @typedef ApiRouteHandler
 * @description The signature for a custom API route handler function provided by a plugin.
 */
export type ApiRouteHandler = (req: Request, res: Response, ctx: PluginContext) => Promise<any> | any;

/**
 * @typedef PluginRoutes
 * @description A map of HTTP method and path patterns to their corresponding API route handlers.
 */
export type PluginRoutes = {
  [routePattern: string]: ApiRouteHandler;
};

// --- 5. UI Slot Injection ---

/**
 * @typedef UIComponentFactory
 * @description A function that returns a React component to be rendered in a UI slot.
 */
export type UIComponentFactory = (props: any) => React.ComponentType<any> | JSX.Element;

/**
 * @typedef PluginUIComponents
 * @description A map of UI slot identifiers to their corresponding React component factories.
 */
export type PluginUIComponents = {
  [slotIdentifier: string]: UIComponentFactory;
};

// --- 6. The Plugin Interface and Creation Function ---

/**
 * @interface Plugin
 * @description The main interface defining the structure of a Panel1 plugin object.
 */
export interface Plugin {
  /** The plugin's metadata, matching the plugin.json content. */
  metadata: PluginMetadata;
  /** The Zod schema for the plugin's configuration. */
  configSchema?: z.ZodObject<any>;

  // Lifecycle Methods
  onInstall?: (ctx: PluginContext) => Promise<void> | void;
  onEnable?: (ctx: PluginContext) => Promise<void> | void;
  onDisable?: (ctx: PluginContext) => Promise<void> | void;
  onUninstall?: (ctx: PluginContext) => Promise<void> | void;

  // Event Hooks
  hooks?: PluginHooks;
  
  // Custom API Routes
  routes?: PluginRoutes;
  
  // UI Components
  components?: PluginUIComponents;
}

/**
 * @function createPlugin
 * @description The main entry point for defining a Panel1 plugin.
 */
export function createPlugin(pluginDefinition: Plugin): Plugin {
  // Validate metadata
  PluginManifestSchema.parse(pluginDefinition.metadata);
  
  return pluginDefinition;
}

// --- 7. Asset Management Utilities ---

/**
 * @function getPluginAssetUrl
 * @description Generates a URL for a static asset belonging to a plugin.
 */
export function getPluginAssetUrl(pluginId: string, assetPath: string): string {
  return `/plugins/${pluginId}/assets/${assetPath}`;
}

// --- 8. Plugin Manifest Schema ---

export const PluginManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, "Plugin name must be lowercase alphanumeric with dashes."),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\da-z-]+(?:\.[\da-z-]+)*)?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/),
  description: z.string().max(250),
  author: z.string(),
  panel1: z.string().describe("Semantic version range of Panel1 core required."),
  dependencies: z.record(z.string()).optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().default('MIT'),
  keywords: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  uiSlots: z.array(z.string()).default([]),
  apiRoutes: z.array(z.string()).default([]),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// --- 9. Plugin Registry Types ---

export interface PluginRegistryInterface {
  register(plugin: Plugin): Promise<void>;
  unregister(name: string): Promise<void>;
  get(name: string): Plugin | undefined;
  getAll(): Plugin[];
  getEnabled(): Plugin[];
  isEnabled(name: string): boolean;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
  install(name: string, source: string): Promise<void>;
  uninstall(name: string): Promise<void>;
  executeHook<K extends keyof Panel1EventMap>(
    hook: K,
    payload: Parameters<Panel1EventMap[K]>[0]
  ): Promise<void>;
}

// --- 10. Plugin Status Types ---

export type PluginStatus = 'installed' | 'enabled' | 'disabled' | 'error';

export interface PluginInfo {
  metadata: PluginMetadata;
  status: PluginStatus;
  error?: string;
  installedAt: Date;
  enabledAt?: Date;
}

// --- 11. Plugin Events ---

export interface PluginEvent {
  id: string;
  pluginId: string;
  eventType: keyof Panel1EventMap;
  data: any;
  timestamp: Date;
  processed: boolean;
  error?: string;
}

// --- 12. Plugin Settings ---

export interface PluginSettings {
  id: string;
  pluginId: string;
  settings: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// --- 13. Utility Types ---

export type PluginHookName = keyof Panel1EventMap;
export type PluginLifecycleMethod = 'onInstall' | 'onEnable' | 'onDisable' | 'onUninstall';

// --- 14. Error Types ---

export class PluginError extends Error {
  constructor(
    message: string,
    public pluginId: string,
    public code?: string
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

export class PluginValidationError extends PluginError {
  constructor(message: string, pluginId: string) {
    super(message, pluginId, 'VALIDATION_ERROR');
    this.name = 'PluginValidationError';
  }
}

export class PluginDependencyError extends PluginError {
  constructor(message: string, pluginId: string) {
    super(message, pluginId, 'DEPENDENCY_ERROR');
    this.name = 'PluginDependencyError';
  }
}

// --- 15. Plugin Development Utilities ---

/**
 * @function validatePluginManifest
 * @description Validates a plugin manifest against the schema
 */
export function validatePluginManifest(manifest: any): PluginManifest {
  return PluginManifestSchema.parse(manifest);
}

/**
 * @function createPluginContext
 * @description Creates a plugin context for testing purposes
 */
export function createPluginContext(
  pluginId: string,
  overrides: Partial<PluginContext> = {}
): PluginContext {
  return {
    pluginId,
    logger: {
      info: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    },
    supabase: null,
    eventEmitter: {
      emit: async () => {},
    },
    auditLogger: {
      log: async () => {},
      logPluginAction: async () => {},
    },
    async getPluginConfig() { return {} as any; },
    async setPluginConfig() {},
    async createSettings() {},
    async deleteSettings() {},
    translate: (key: string) => key,
    async emit() {},
    ...overrides,
  };
}

// --- 16. Re-exports ---

export { z } from 'zod';
export type { ZodSchema, ZodObject } from 'zod';