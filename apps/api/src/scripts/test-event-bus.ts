import { eventService, EventPayload } from '../lib/events/EventService';

async function testEventBus() {
  console.log('🧪 Starting Event Bus Test...');

  try {
    // Initialize the event service
    await eventService.initialize();

    // Set up test event handlers
    eventService.on('test.component.created', async (event: EventPayload) => {
      console.log('📥 Received component.created event:', event);
    });

    eventService.on('test.component.updated', async (event: EventPayload) => {
      console.log('📥 Received component.updated event:', event);
    });

    // Set up an error handler
    eventService.on('test.error', async (event: EventPayload) => {
      console.log('❌ Received error event:', event);
      throw new Error('Test error handler');
    });

    // Emit test events
    console.log('📤 Emitting test events...');

    // Test component lifecycle events
    await eventService.emit('test.component.created', {
      componentId: 'test-component-1',
      name: 'Test Component',
      type: 'hosting'
    }, {
      source: 'test-script',
      tenantId: 'test-tenant',
      userId: 'test-user'
    });

    await eventService.emit('test.component.updated', {
      componentId: 'test-component-1',
      changes: {
        name: 'Updated Test Component'
      }
    }, {
      source: 'test-script',
      tenantId: 'test-tenant',
      userId: 'test-user'
    });

    // Test error handling
    console.log('🧪 Testing error handling...');
    try {
      await eventService.emit('test.error', {
        message: 'Test error'
      }, {
        source: 'test-script'
      });
    } catch (error) {
      console.log('✅ Error handler worked as expected');
    }

    // Test event correlation
    const correlationId = crypto.randomUUID();
    await eventService.emit('test.correlated.event1', {
      step: 1
    }, {
      source: 'test-script',
      correlationId
    });

    await eventService.emit('test.correlated.event2', {
      step: 2
    }, {
      source: 'test-script',
      correlationId
    });

    // Wait for events to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Clean up
    console.log('🧹 Cleaning up...');
    await eventService.shutdown();

    console.log('✅ Event Bus Test completed successfully');
  } catch (error) {
    console.error('❌ Event Bus Test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testEventBus()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
} 