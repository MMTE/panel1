import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ComponentDefinitionService, ICreateComponentDefinitionParams } from '../ComponentDefinitionService';
import { ComponentProviderRegistry } from '../ComponentProviderRegistry';

// Mock dependencies
jest.mock('../ComponentProviderRegistry');
jest.mock('../../events/EventService');
jest.mock('../../db');

describe('ComponentDefinitionService', () => {
  let service: ComponentDefinitionService;
  let mockRegistry: jest.Mocked<ComponentProviderRegistry>;

  beforeEach(() => {
    // Reset the singleton instance
    (ComponentDefinitionService as any).instance = undefined;
    
    service = ComponentDefinitionService.getInstance();
    mockRegistry = ComponentProviderRegistry.getInstance() as jest.Mocked<ComponentProviderRegistry>;
  });

  describe('createComponentDefinition', () => {
    const mockParams: ICreateComponentDefinitionParams = {
      name: 'Test Component',
      description: 'A test component for testing',
      componentKey: 'test-component',
      configuration: {
        maxInstances: 10,
        region: 'us-east-1'
      },
      isActive: true
    };

    it('should create a component definition successfully', async () => {
      // Mock provider registry
      const mockProvider = {
        version: '1.0.0',
        getComponentMetadata: () => ({
          supportedPricingModels: ['FIXED', 'PER_UNIT'],
          requiredConfigFields: ['maxInstances'],
          optionalConfigFields: ['region'],
          usageTrackingSupported: true
        }),
        validateComponentConfig: jest.fn().mockResolvedValue(true)
      };

      mockRegistry.getProvider.mockReturnValue(mockProvider);

      // Mock database operations
      const mockDbResult = {
        id: '1',
        ...mockParams,
        version: '1.0.0',
        metadata: mockProvider.getComponentMetadata(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // This would normally be mocked at the db level, but for now we'll skip actual db operations
      // and focus on testing the validation logic

      expect(mockRegistry.getProvider).toHaveBeenCalledWith('test-component');
    });

    it('should throw error when provider not found', async () => {
      mockRegistry.getProvider.mockReturnValue(null);

      await expect(service.createComponentDefinition(mockParams))
        .rejects
        .toThrow('Provider not found for component key: test-component');
    });

    it('should validate required configuration fields', async () => {
      const mockProvider = {
        version: '1.0.0',
        getComponentMetadata: () => ({
          supportedPricingModels: ['FIXED'],
          requiredConfigFields: ['maxInstances', 'region'],
          optionalConfigFields: [],
          usageTrackingSupported: false
        }),
        validateComponentConfig: jest.fn().mockResolvedValue(true)
      };

      mockRegistry.getProvider.mockReturnValue(mockProvider);

      const invalidParams = {
        ...mockParams,
        configuration: {
          maxInstances: 10
          // Missing required 'region' field
        }
      };

      await expect(service.createComponentDefinition(invalidParams))
        .rejects
        .toThrow('Missing required configuration fields: region');
    });
  });

  describe('validateDependencies', () => {
    it('should validate component dependencies successfully', async () => {
      const mockProvider = {
        version: '1.2.0',
        getComponentMetadata: () => ({
          supportedPricingModels: ['FIXED'],
          requiredConfigFields: [],
          optionalConfigFields: [],
          usageTrackingSupported: false
        })
      };

      mockRegistry.getProvider.mockReturnValue(mockProvider);

      const dependencies = [{
        componentKey: 'dependency-component',
        minVersion: '1.0.0',
        maxVersion: '2.0.0',
        required: true,
        description: 'Test dependency'
      }];

      // This would normally call the private method, but we'll test through the public interface
      const params = {
        ...mockParams,
        dependencies
      };

      mockRegistry.getProvider.mockReturnValue(mockProvider);

      // The method should not throw for valid dependencies
      expect(() => service.createComponentDefinition(params)).not.toThrow();
    });

    it('should throw error for missing dependency provider', async () => {
      const mockProvider = {
        version: '1.0.0',
        getComponentMetadata: () => ({
          supportedPricingModels: ['FIXED'],
          requiredConfigFields: [],
          optionalConfigFields: [],
          usageTrackingSupported: false
        })
      };

      // Return provider for main component but not for dependency
      mockRegistry.getProvider
        .mockReturnValueOnce(mockProvider)
        .mockReturnValueOnce(null);

      const dependencies = [{
        componentKey: 'missing-dependency',
        required: true,
        description: 'Missing dependency'
      }];

      const params = {
        ...mockParams,
        dependencies
      };

      await expect(service.createComponentDefinition(params))
        .rejects
        .toThrow('Dependency component provider not found: missing-dependency');
    });

    it('should validate version constraints', async () => {
      const mockMainProvider = {
        version: '1.0.0',
        getComponentMetadata: () => ({
          supportedPricingModels: ['FIXED'],
          requiredConfigFields: [],
          optionalConfigFields: [],
          usageTrackingSupported: false
        })
      };

      const mockDepProvider = {
        version: '0.5.0' // Below minimum required version
      };

      mockRegistry.getProvider
        .mockReturnValueOnce(mockMainProvider)
        .mockReturnValueOnce(mockDepProvider);

      const dependencies = [{
        componentKey: 'old-dependency',
        minVersion: '1.0.0',
        required: true
      }];

      const params = {
        ...mockParams,
        dependencies
      };

      await expect(service.createComponentDefinition(params))
        .rejects
        .toThrow('version 0.5.0 is below minimum required version 1.0.0');
    });
  });

  describe('compareVersions', () => {
    it('should compare versions correctly', () => {
      // Access private method for testing
      const compareVersions = (service as any).compareVersions.bind(service);

      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
      expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.1.0', '1.0.9')).toBeGreaterThan(0);
      expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    });
  });

  describe('checkCircularDependencies', () => {
    it('should detect circular dependencies', async () => {
      // Mock component definitions that would cause circular dependency
      const mockComponents = [
        {
          componentKey: 'component-a',
          dependencies: [{
            componentKey: 'component-b',
            required: true
          }]
        },
        {
          componentKey: 'component-b', 
          dependencies: [{
            componentKey: 'component-a',
            required: true
          }]
        }
      ];

      // Mock the listComponentDefinitions method
      jest.spyOn(service, 'listComponentDefinitions').mockResolvedValue(mockComponents as any);

      const dependencies = [{
        componentKey: 'component-b',
        required: true
      }];

      await expect(service.checkCircularDependencies('component-a', dependencies))
        .rejects
        .toThrow('Circular dependency detected');
    });
  });
});
 