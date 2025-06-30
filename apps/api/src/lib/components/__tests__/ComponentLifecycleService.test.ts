import { ComponentLifecycleService, ComponentHandler } from '../ComponentLifecycleService';
import { EventService } from '../../events/EventService';

// Mock the database and other dependencies
jest.mock('../../db');
jest.mock('../../events/EventService');

describe('ComponentLifecycleService', () => {
  let lifecycleService: ComponentLifecycleService;
  let mockHandler: ComponentHandler;
  let mockEventService: jest.Mocked<EventService>;

  beforeEach(() => {
    lifecycleService = ComponentLifecycleService.getInstance();
    
    // Create a mock handler
    mockHandler = {
      provision: jest.fn().mockResolvedValue({ success: true, remoteId: 'test-remote-id' }),
      suspend: jest.fn().mockResolvedValue({ success: true }),
      unsuspend: jest.fn().mockResolvedValue({ success: true }),
      terminate: jest.fn().mockResolvedValue({ success: true }),
    };

    // Mock EventService
    mockEventService = {
      emit: jest.fn(),
      getInstance: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Handler Registration', () => {
    it('should register a handler for a provider', () => {
      lifecycleService.registerHandler('cpanel', mockHandler);
      
      // Verify handler is registered (we can't directly access the private map, 
      // but we can verify through functionality)
      expect(lifecycleService['handlers'].get('cpanel')).toBe(mockHandler);
    });

    it('should allow multiple handlers for different providers', () => {
      const mockHandler2: ComponentHandler = {
        provision: jest.fn().mockResolvedValue({ success: true }),
        suspend: jest.fn().mockResolvedValue({ success: true }),
        unsuspend: jest.fn().mockResolvedValue({ success: true }),
        terminate: jest.fn().mockResolvedValue({ success: true }),
      };

      lifecycleService.registerHandler('cpanel', mockHandler);
      lifecycleService.registerHandler('plesk', mockHandler2);
      
      expect(lifecycleService['handlers'].get('cpanel')).toBe(mockHandler);
      expect(lifecycleService['handlers'].get('plesk')).toBe(mockHandler2);
    });
  });

  describe('Service Lifecycle', () => {
    it('should start and stop the service', async () => {
      await lifecycleService.start();
      expect(lifecycleService['worker']).toBeDefined();
      
      await lifecycleService.stop();
      expect(lifecycleService['worker']).toBeNull();
    });
  });

  describe('Event Processing', () => {
    beforeEach(() => {
      // Mock database queries
      const mockDb = require('../../db').db;
      mockDb.query = {
        subscribedComponents: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'test-subscribed-component-id',
              component: {
                id: 'test-component-id',
                name: 'Test Component',
                metadata: {
                  provisioningRequired: true,
                  provisioningProvider: 'cpanel'
                }
              },
              configuration: { package: 'test' },
              metadata: {}
            }
          ])
        }
      };
      
      mockDb.update = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined)
        })
      });
    });

    it('should process subscription.activated event', async () => {
      lifecycleService.registerHandler('cpanel', mockHandler);
      
      const mockJob = {
        name: 'subscription.activated',
        data: {
          payload: {
            subscriptionId: 'test-subscription-id'
          }
        }
      };

      await lifecycleService['handleSubscriptionActivated'](mockJob as any);
      
      expect(mockHandler.provision).toHaveBeenCalledWith({
        subscribedComponentId: 'test-subscribed-component-id',
        config: { package: 'test' }
      });
    });

    it('should process subscription.terminated event', async () => {
      lifecycleService.registerHandler('cpanel', mockHandler);
      
      const mockJob = {
        name: 'subscription.terminated',
        data: {
          payload: {
            subscriptionId: 'test-subscription-id'
          }
        }
      };

      await lifecycleService['handleSubscriptionTerminated'](mockJob as any);
      
      expect(mockHandler.terminate).toHaveBeenCalledWith({
        subscribedComponentId: 'test-subscribed-component-id'
      });
    });

    it('should handle missing subscription gracefully', async () => {
      const mockDb = require('../../db').db;
      mockDb.query.subscribedComponents.findMany.mockResolvedValue([]);
      
      const mockJob = {
        name: 'subscription.activated',
        data: {
          payload: {
            subscriptionId: 'non-existent-subscription'
          }
        }
      };

      // Should not throw an error
      await expect(lifecycleService['handleSubscriptionActivated'](mockJob as any))
        .resolves.not.toThrow();
    });

    it('should handle provisioning failure gracefully', async () => {
      const failingHandler: ComponentHandler = {
        provision: jest.fn().mockResolvedValue({ success: false }),
        suspend: jest.fn().mockResolvedValue({ success: true }),
        unsuspend: jest.fn().mockResolvedValue({ success: true }),
        terminate: jest.fn().mockResolvedValue({ success: true }),
      };
      
      lifecycleService.registerHandler('cpanel', failingHandler);
      
      const mockJob = {
        name: 'subscription.activated',
        data: {
          payload: {
            subscriptionId: 'test-subscription-id'
          }
        }
      };

      await lifecycleService['handleSubscriptionActivated'](mockJob as any);
      
      expect(failingHandler.provision).toHaveBeenCalled();
      // Should update with failed status (we'd need to check the database update call)
    });
  });
}); 