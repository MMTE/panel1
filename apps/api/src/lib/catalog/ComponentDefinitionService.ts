import { db } from '../../db';
import { logger } from '../logging/Logger';
import { EventService } from '../events/EventService';
import { ComponentProviderRegistry, IComponentProvisioningModule } from './ComponentProviderRegistry';
import { eq } from 'drizzle-orm';
import { components } from '../../db/schema/catalog';

export interface IComponentDefinition {
  id: string;
  name: string;
  description: string;
  componentKey: string;
  version: string;
  isActive: boolean;
  configuration: Record<string, any>;
  dependencies?: IComponentDependency[];
  metadata: {
    supportedPricingModels: string[];
    requiredConfigFields: string[];
    optionalConfigFields: string[];
    usageTrackingSupported: boolean;
    compatibilityRequirements?: {
      minSystemVersion?: string;
      requiredFeatures?: string[];
      incompatibleWith?: string[];
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IComponentDependency {
  componentKey: string;
  minVersion?: string;
  maxVersion?: string;
  required: boolean;
  description?: string;
}

export interface ICreateComponentDefinitionParams {
  name: string;
  description: string;
  componentKey: string;
  configuration: Record<string, any>;
  dependencies?: IComponentDependency[];
  isActive?: boolean;
}

export interface IUpdateComponentDefinitionParams {
  name?: string;
  description?: string;
  configuration?: Record<string, any>;
  dependencies?: IComponentDependency[];
  isActive?: boolean;
}

export class ComponentDefinitionService {
  private static instance: ComponentDefinitionService;
  private providerRegistry: ComponentProviderRegistry;
  private eventService: EventService;

  private constructor() {
    this.providerRegistry = ComponentProviderRegistry.getInstance();
    this.eventService = new EventService();
  }

  static getInstance(): ComponentDefinitionService {
    if (!ComponentDefinitionService.instance) {
      ComponentDefinitionService.instance = new ComponentDefinitionService();
    }
    return ComponentDefinitionService.instance;
  }

  /**
   * Create a new component definition
   */
  async createComponentDefinition(
    params: ICreateComponentDefinitionParams
  ): Promise<IComponentDefinition> {
    const provider = this.providerRegistry.getProvider(params.componentKey);
    if (!provider) {
      throw new Error(`Provider not found for component key: ${params.componentKey}`);
    }

    // Validate configuration against provider requirements
    await this.validateConfiguration(provider, params.configuration);

    // Validate dependencies if provided
    if (params.dependencies && params.dependencies.length > 0) {
      await this.validateDependencies(params.dependencies);
    }

    try {
      const metadata = provider.getComponentMetadata?.() || {
        supportedPricingModels: [],
        requiredConfigFields: [],
        optionalConfigFields: [],
        usageTrackingSupported: false
      };

      const [component] = await db.insert(components).values({
        name: params.name,
        description: params.description,
        componentKey: params.componentKey,
        version: provider.version,
        isActive: params.isActive ?? true,
        configuration: params.configuration,
        dependencies: params.dependencies || [],
        metadata: metadata
      }).returning();

      const componentDefinition: IComponentDefinition = {
        ...component,
        createdAt: new Date(component.createdAt),
        updatedAt: new Date(component.updatedAt)
      };

      this.eventService.emit('COMPONENT_DEFINITION_CREATED', {
        componentId: componentDefinition.id,
        componentKey: componentDefinition.componentKey
      });

      return componentDefinition;
    } catch (error) {
      logger.error('Failed to create component definition', { error, params });
      throw error;
    }
  }

  /**
   * Update an existing component definition
   */
  async updateComponentDefinition(
    id: string,
    params: IUpdateComponentDefinitionParams
  ): Promise<IComponentDefinition> {
    const existingComponent = await this.getComponentDefinition(id);
    if (!existingComponent) {
      throw new Error(`Component definition not found: ${id}`);
    }

    const provider = this.providerRegistry.getProvider(existingComponent.componentKey);
    if (!provider) {
      throw new Error(`Provider not found for component key: ${existingComponent.componentKey}`);
    }

    // Validate new configuration if provided
    if (params.configuration) {
      await this.validateConfiguration(provider, params.configuration);
    }

    // Validate dependencies if provided
    if (params.dependencies && params.dependencies.length > 0) {
      await this.validateDependencies(params.dependencies);
    }

    try {
      const [updatedComponent] = await db.update(components)
        .set({
          name: params.name ?? existingComponent.name,
          description: params.description ?? existingComponent.description,
          configuration: params.configuration ?? existingComponent.configuration,
          dependencies: params.dependencies ?? existingComponent.dependencies,
          isActive: params.isActive ?? existingComponent.isActive,
          updatedAt: new Date()
        })
        .where(eq(components.id, id))
        .returning();

      const componentDefinition: IComponentDefinition = {
        ...updatedComponent,
        createdAt: new Date(updatedComponent.createdAt),
        updatedAt: new Date(updatedComponent.updatedAt)
      };

      this.eventService.emit('COMPONENT_DEFINITION_UPDATED', {
        componentId: componentDefinition.id,
        componentKey: componentDefinition.componentKey
      });

      return componentDefinition;
    } catch (error) {
      logger.error('Failed to update component definition', { error, id, params });
      throw error;
    }
  }

  /**
   * Get a component definition by ID
   */
  async getComponentDefinition(id: string): Promise<IComponentDefinition | null> {
    try {
      const component = await db.query.components.findFirst({
        where: eq(components.id, id)
      });

      if (!component) {
        return null;
      }

      return {
        ...component,
        createdAt: new Date(component.createdAt),
        updatedAt: new Date(component.updatedAt)
      };
    } catch (error) {
      logger.error('Failed to get component definition', { error, id });
      throw error;
    }
  }

  /**
   * List all component definitions
   */
  async listComponentDefinitions(): Promise<IComponentDefinition[]> {
    try {
      const componentsList = await db.query.components.findMany();

      return componentsList.map(component => ({
        ...component,
        createdAt: new Date(component.createdAt),
        updatedAt: new Date(component.updatedAt)
      }));
    } catch (error) {
      logger.error('Failed to list component definitions', { error });
      throw error;
    }
  }

  /**
   * Delete a component definition
   */
  async deleteComponentDefinition(id: string): Promise<void> {
    try {
      const component = await this.getComponentDefinition(id);
      if (!component) {
        throw new Error(`Component definition not found: ${id}`);
      }

      await db.delete(components).where(eq(components.id, id));

      this.eventService.emit('COMPONENT_DEFINITION_DELETED', {
        componentId: id,
        componentKey: component.componentKey
      });
    } catch (error) {
      logger.error('Failed to delete component definition', { error, id });
      throw error;
    }
  }

  /**
   * Validate component configuration against provider requirements
   */
  private async validateConfiguration(
    provider: IComponentProvisioningModule,
    configuration: Record<string, any>
  ): Promise<void> {
    // Get provider metadata
    const metadata = provider.getComponentMetadata?.();
    if (!metadata) {
      return; // No validation requirements
    }

    // Check required fields
    const missingFields = metadata.requiredConfigFields.filter(
      field => !(field in configuration)
    );

    if (missingFields.length > 0) {
      throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`);
    }

    // Validate configuration if provider supports it
    if (provider.validateComponentConfig) {
      const isValid = await provider.validateComponentConfig(configuration);
      if (!isValid) {
        throw new Error('Component configuration validation failed');
      }
    }
  }

  /**
   * Validate component dependencies
   */
  private async validateDependencies(dependencies: IComponentDependency[]): Promise<void> {
    for (const dependency of dependencies) {
      // Check if the dependency component exists
      const dependencyProvider = this.providerRegistry.getProvider(dependency.componentKey);
      if (!dependencyProvider) {
        throw new Error(`Dependency component provider not found: ${dependency.componentKey}`);
      }

      // Validate version constraints if specified
      if (dependency.minVersion || dependency.maxVersion) {
        const providerVersion = dependencyProvider.version;
        
        if (dependency.minVersion && this.compareVersions(providerVersion, dependency.minVersion) < 0) {
          throw new Error(
            `Dependency ${dependency.componentKey} version ${providerVersion} is below minimum required version ${dependency.minVersion}`
          );
        }

        if (dependency.maxVersion && this.compareVersions(providerVersion, dependency.maxVersion) > 0) {
          throw new Error(
            `Dependency ${dependency.componentKey} version ${providerVersion} is above maximum allowed version ${dependency.maxVersion}`
          );
        }
      }
    }
  }

  /**
   * Check for circular dependencies in component definitions
   */
  async checkCircularDependencies(
    componentKey: string, 
    dependencies: IComponentDependency[], 
    visited = new Set<string>()
  ): Promise<void> {
    if (visited.has(componentKey)) {
      throw new Error(`Circular dependency detected involving component: ${componentKey}`);
    }

    visited.add(componentKey);

    for (const dependency of dependencies) {
      // Get the dependency component definition
      const existingComponents = await this.listComponentDefinitions();
      const dependencyComponent = existingComponents.find(c => c.componentKey === dependency.componentKey);
      
      if (dependencyComponent && dependencyComponent.dependencies) {
        await this.checkCircularDependencies(
          dependency.componentKey,
          dependencyComponent.dependencies,
          new Set(visited)
        );
      }
    }
  }

  /**
   * Get all components that depend on a specific component
   */
  async getDependentComponents(componentKey: string): Promise<IComponentDefinition[]> {
    const allComponents = await this.listComponentDefinitions();
    
    return allComponents.filter(component => 
      component.dependencies?.some(dep => dep.componentKey === componentKey)
    );
  }

  /**
   * Simple semantic version comparison
   * Returns: -1 if v1 < v2, 0 if v1 = v2, 1 if v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const normalize = (v: string) => v.split('.').map(n => parseInt(n, 10));
    const [major1, minor1, patch1] = normalize(v1);
    const [major2, minor2, patch2] = normalize(v2);

    if (major1 !== major2) return major1 - major2;
    if (minor1 !== minor2) return minor1 - minor2;
    return patch1 - patch2;
  }
} 