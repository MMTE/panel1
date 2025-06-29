import type { PluginRoutes, ApiRouteHandler, PluginContext } from '@panel1/plugin-sdk';
import { pluginManager } from './PluginManager';

/**
 * Manages plugin API routes and UI routes
 */
export class RouteManager {
  private static instance: RouteManager;
  private apiRoutes: Map<string, { handler: ApiRouteHandler; pluginId: string }> = new Map();
  private uiRoutes: Map<string, { component: React.ComponentType<any>; pluginId: string }> = new Map();

  private constructor() {
    this.refreshRoutes();
  }

  static getInstance(): RouteManager {
    if (!RouteManager.instance) {
      RouteManager.instance = new RouteManager();
    }
    return RouteManager.instance;
  }

  /**
   * Refresh all routes from enabled plugins
   */
  refreshRoutes(): void {
    this.apiRoutes.clear();
    this.uiRoutes.clear();

    const enabledPlugins = pluginManager.getEnabledPlugins();
    
    for (const plugin of enabledPlugins) {
      if (plugin.routes) {
        for (const [routePattern, handler] of Object.entries(plugin.routes)) {
          const fullRoute = `/plugins/${plugin.metadata.name}${routePattern.replace(/^[A-Z]+\s+/, '')}`;
          const method = routePattern.split(' ')[0];
          const routeKey = `${method} ${fullRoute}`;
          
          this.apiRoutes.set(routeKey, {
            handler,
            pluginId: plugin.metadata.name,
          });
        }
      }

      // Handle UI routes if plugin defines them
      if (plugin.components) {
        for (const [slotId, componentFactory] of Object.entries(plugin.components)) {
          // Check if this is a page route (starts with admin.page.route.)
          if (slotId.startsWith('admin.page.route.')) {
            const routePath = slotId.replace('admin.page.route.', '');
            const fullPath = `/admin/${routePath}`;
            
            this.uiRoutes.set(fullPath, {
              component: componentFactory as React.ComponentType<any>,
              pluginId: plugin.metadata.name,
            });
          }
        }
      }
    }
  }

  /**
   * Handle a plugin API route request
   */
  async handleApiRoute(
    method: string,
    path: string,
    req: Request,
    res: Response,
    context: PluginContext
  ): Promise<any> {
    const routeKey = `${method.toUpperCase()} ${path}`;
    const route = this.apiRoutes.get(routeKey);

    if (!route) {
      throw new Error(`API route not found: ${routeKey}`);
    }

    try {
      return await route.handler(req, res, context);
    } catch (error) {
      console.error(`Error handling API route ${routeKey} for plugin ${route.pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Get UI route component
   */
  getUIRoute(path: string): { component: React.ComponentType<any>; pluginId: string } | undefined {
    return this.uiRoutes.get(path);
  }

  /**
   * Get all registered API routes
   */
  getAllRoutes(): Array<{ route: string; pluginId: string; type: 'api' | 'ui' }> {
    const apiRoutes = Array.from(this.apiRoutes.entries()).map(([route, { pluginId }]) => ({
      route,
      pluginId,
      type: 'api' as const,
    }));

    const uiRoutes = Array.from(this.uiRoutes.entries()).map(([route, { pluginId }]) => ({
      route: `GET ${route}`,
      pluginId,
      type: 'ui' as const,
    }));

    return [...apiRoutes, ...uiRoutes];
  }

  /**
   * Get all UI routes
   */
  getAllUIRoutes(): Array<{ path: string; component: React.ComponentType<any>; pluginId: string }> {
    return Array.from(this.uiRoutes.entries()).map(([path, { component, pluginId }]) => ({
      path,
      component,
      pluginId,
    }));
  }

  /**
   * Get API routes for a specific plugin
   */
  getPluginApiRoutes(pluginId: string): string[] {
    return Array.from(this.apiRoutes.entries())
      .filter(([, { pluginId: pid }]) => pid === pluginId)
      .map(([route]) => route);
  }

  /**
   * Get UI routes for a specific plugin
   */
  getPluginUIRoutes(pluginId: string): Array<{ path: string; component: React.ComponentType<any> }> {
    return Array.from(this.uiRoutes.entries())
      .filter(([, { pluginId: pid }]) => pid === pluginId)
      .map(([path, { component }]) => ({ path, component }));
  }

  /**
   * Check if an API route exists
   */
  hasApiRoute(method: string, path: string): boolean {
    const routeKey = `${method.toUpperCase()} ${path}`;
    return this.apiRoutes.has(routeKey);
  }

  /**
   * Check if a UI route exists
   */
  hasUIRoute(path: string): boolean {
    return this.uiRoutes.has(path);
  }

  /**
   * Get route statistics
   */
  getRouteStats(): { [pluginId: string]: { api: number; ui: number } } {
    const stats: { [pluginId: string]: { api: number; ui: number } } = {};
    
    for (const [, { pluginId }] of this.apiRoutes.entries()) {
      if (!stats[pluginId]) stats[pluginId] = { api: 0, ui: 0 };
      stats[pluginId].api++;
    }

    for (const [, { pluginId }] of this.uiRoutes.entries()) {
      if (!stats[pluginId]) stats[pluginId] = { api: 0, ui: 0 };
      stats[pluginId].ui++;
    }
    
    return stats;
  }

  /**
   * Register an API route (for testing/development)
   */
  registerApiRoute(
    method: string,
    path: string,
    handler: ApiRouteHandler,
    pluginId: string
  ): void {
    const routeKey = `${method.toUpperCase()} ${path}`;
    this.apiRoutes.set(routeKey, { handler, pluginId });
  }

  /**
   * Register a UI route (for testing/development)
   */
  registerUIRoute(
    path: string,
    component: React.ComponentType<any>,
    pluginId: string
  ): void {
    this.uiRoutes.set(path, { component, pluginId });
  }

  /**
   * Unregister routes for a plugin
   */
  unregisterPluginRoutes(pluginId: string): void {
    // Remove API routes
    for (const [routeKey, route] of this.apiRoutes.entries()) {
      if (route.pluginId === pluginId) {
        this.apiRoutes.delete(routeKey);
      }
    }

    // Remove UI routes
    for (const [routePath, route] of this.uiRoutes.entries()) {
      if (route.pluginId === pluginId) {
        this.uiRoutes.delete(routePath);
      }
    }
  }

  /**
   * Clear all routes
   */
  clearAllRoutes(): void {
    this.apiRoutes.clear();
    this.uiRoutes.clear();
  }
}

// Export singleton instance
export const routeManager = RouteManager.getInstance();