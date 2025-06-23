import React from 'react';
import type { PluginUIComponents, UIComponentFactory } from '@panel1/plugin-sdk';
import { pluginManager } from './PluginManager';

/**
 * Manages UI slot injection for plugins
 */
export class UISlotManager {
  private static instance: UISlotManager;
  private slotComponents: Map<string, UIComponentFactory[]> = new Map();

  private constructor() {
    this.refreshSlots();
  }

  static getInstance(): UISlotManager {
    if (!UISlotManager.instance) {
      UISlotManager.instance = new UISlotManager();
    }
    return UISlotManager.instance;
  }

  /**
   * Refresh all slot components from enabled plugins
   */
  refreshSlots(): void {
    this.slotComponents.clear();

    const enabledPlugins = pluginManager.getEnabledPlugins();
    
    for (const plugin of enabledPlugins) {
      if (plugin.components) {
        for (const [slotId, component] of Object.entries(plugin.components)) {
          if (!this.slotComponents.has(slotId)) {
            this.slotComponents.set(slotId, []);
          }
          this.slotComponents.get(slotId)!.push(component);
        }
      }
    }
  }

  /**
   * Get all components for a specific slot
   */
  getSlotComponents(slotId: string): UIComponentFactory[] {
    return this.slotComponents.get(slotId) || [];
  }

  /**
   * Check if a slot has any components
   */
  hasSlotComponents(slotId: string): boolean {
    const components = this.slotComponents.get(slotId);
    return components !== undefined && components.length > 0;
  }

  /**
   * Render all components for a slot
   */
  renderSlot(slotId: string, props: any = {}): React.ReactElement[] {
    const components = this.getSlotComponents(slotId);
    
    return components.map((componentFactory, index) => {
      try {
        const Component = componentFactory(props);
        
        // Handle both component types and JSX elements
        if (React.isValidElement(Component)) {
          return React.cloneElement(Component, { key: `${slotId}-${index}` });
        } else {
          // It's a component type
          return React.createElement(Component as React.ComponentType<any>, {
            key: `${slotId}-${index}`,
            ...props,
          });
        }
      } catch (error) {
        console.error(`Error rendering component for slot ${slotId}:`, error);
        return React.createElement('div', {
          key: `${slotId}-error-${index}`,
          className: 'text-red-500 text-sm p-2 border border-red-300 rounded',
        }, `Error rendering plugin component: ${error}`);
      }
    });
  }

  /**
   * Get all available slot IDs
   */
  getAllSlotIds(): string[] {
    return Array.from(this.slotComponents.keys());
  }

  /**
   * Get slot statistics
   */
  getSlotStats(): { [slotId: string]: number } {
    const stats: { [slotId: string]: number } = {};
    
    for (const [slotId, components] of this.slotComponents.entries()) {
      stats[slotId] = components.length;
    }
    
    return stats;
  }

  /**
   * Register a component for a slot (for testing/development)
   */
  registerComponent(slotId: string, component: UIComponentFactory): void {
    if (!this.slotComponents.has(slotId)) {
      this.slotComponents.set(slotId, []);
    }
    this.slotComponents.get(slotId)!.push(component);
  }

  /**
   * Unregister all components for a slot
   */
  unregisterSlot(slotId: string): void {
    this.slotComponents.delete(slotId);
  }

  /**
   * Clear all slots
   */
  clearAllSlots(): void {
    this.slotComponents.clear();
  }
}

// Export singleton instance
export const uiSlotManager = UISlotManager.getInstance();

// React hook for using slots
export function usePluginSlot(slotId: string, props: any = {}) {
  const [components, setComponents] = React.useState<React.ReactElement[]>([]);

  React.useEffect(() => {
    const renderComponents = () => {
      const rendered = uiSlotManager.renderSlot(slotId, props);
      setComponents(rendered);
    };

    renderComponents();

    // Note: Removed setInterval to fix timer-related errors in web environment
    // In the future, this should be replaced with an event-driven mechanism
    // that listens to plugin state changes
  }, [slotId, props]);

  return components;
}

// React component for rendering slots
export interface PluginSlotProps {
  slotId: string;
  props?: any;
  fallback?: React.ReactNode;
  className?: string;
}

export const PluginSlot: React.FC<PluginSlotProps> = ({ 
  slotId, 
  props = {}, 
  fallback = null,
  className 
}) => {
  const components = usePluginSlot(slotId, props);

  if (components.length === 0) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <div className={className}>
      {components}
    </div>
  );
};