import { db } from '../db';
import { 
  tenants, 
  users, 
  clients, 
  plans, 
  products,
  components,
  productComponents,
  subscriptions,
  subscribedComponents
} from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { SubscriptionService } from '../lib/subscription/SubscriptionService';
import { ComponentLifecycleService } from '../lib/components/ComponentLifecycleService';
import { CpanelPlugin } from '../lib/provisioning/plugins/CpanelPlugin';
import { EventService } from '../lib/events/EventService';
import { Logger } from '../lib/logging/Logger';

/**
 * Phase 2 Integration Test
 * Tests the complete end-to-end flow from subscription creation to provisioning
 */
async function testPhase2Integration() {
  const logger = Logger.getInstance();
  logger.info('🧪 Starting Phase 2 Integration Test');

  let testTenantId: string | null = null;

  try {
    // Step 1: Setup test data
    logger.info('📋 Step 1: Setting up test data');
    const testData = await setupTestData();
    testTenantId = testData.tenantId;
    logger.info('✅ Test data created', { 
      tenantId: testData.tenantId,
      clientId: testData.clientId,
      planId: testData.planId,
      productId: testData.productId
    });

    // Step 2: Initialize services
    logger.info('📋 Step 2: Initializing services');
    const services = await initializeServices();
    logger.info('✅ Services initialized');

    // Step 3: Create a subscription for a product with cPanel component
    logger.info('📋 Step 3: Creating subscription with cPanel component');
    const subscription = await createTestSubscription(testData, services.subscriptionService);
    logger.info('✅ Subscription created', { subscriptionId: subscription.id });

    // Step 4: Wait for event processing and verify provisioning
    logger.info('📋 Step 4: Waiting for event processing...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds for async processing

    // Step 5: Verify provisioning results
    logger.info('📋 Step 5: Verifying provisioning results');
    await verifyProvisioningResults(subscription.id, testData.tenantId);

    // Step 6: Test subscription cancellation
    logger.info('📋 Step 6: Testing subscription cancellation');
    await testSubscriptionCancellation(subscription.id, testData.tenantId, services.subscriptionService);

    // Step 7: Wait for termination processing
    logger.info('📋 Step 7: Waiting for termination processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 8: Verify termination results
    logger.info('📋 Step 8: Verifying termination results');
    await verifyTerminationResults(subscription.id, testData.tenantId);

    logger.info('🎉 Phase 2 Integration Test PASSED - All end-to-end flows working correctly!');

  } catch (error) {
    logger.error('❌ Phase 2 Integration Test FAILED:', { error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  } finally {
    // Cleanup
    if (testTenantId) {
      logger.info('🧹 Cleaning up test data...');
      await cleanupTestData(testTenantId);
      logger.info('✅ Cleanup completed');
    }
  }
}

/**
 * Setup test data including tenant, users, clients, plans, products, and components
 */
async function setupTestData() {
  // Create test tenant
  const [tenant] = await db.insert(tenants).values({
    name: 'Phase2 Test Tenant',
    slug: 'phase2-test',
    domain: 'test.panel1.dev',
    settings: { defaultCurrency: 'USD', timezone: 'UTC' },
    branding: { primaryColor: '#3b82f6' }
  }).returning();

  // Create admin user
  const [adminUser] = await db.insert(users).values({
    email: 'admin@phase2test.dev',
    password: 'hashed_password',
    firstName: 'Test',
    lastName: 'Admin',
    role: 'ADMIN',
    tenantId: tenant.id,
  }).returning();

  // Create client user
  const [clientUser] = await db.insert(users).values({
    email: 'client@phase2test.dev',
    password: 'hashed_password',
    firstName: 'Test',
    lastName: 'Client',
    role: 'CLIENT',
    tenantId: tenant.id,
  }).returning();

  // Create client profile
  const [client] = await db.insert(clients).values({
    userId: clientUser.id,
    companyName: 'Phase2 Test Company',
    address: '123 Test Street',
    city: 'Test City',
    state: 'CA',
    zipCode: '12345',
    country: 'US',
    phone: '+1-555-TEST',
    status: 'ACTIVE',
    tenantId: tenant.id,
  }).returning();

  // Create a plan
  const [plan] = await db.insert(plans).values({
    name: 'Test Hosting Plan',
    description: 'Test plan for Phase 2 integration',
    price: '29.99',
    currency: 'USD',
    interval: 'MONTHLY',
    features: { storage: '100GB', bandwidth: '1TB' },
    tenantId: tenant.id,
  }).returning();

  // Create cPanel component
  const [cpanelComponent] = await db.insert(components).values({
    name: 'cPanel Hosting',
    description: 'cPanel web hosting component',
    componentKey: 'cpanel-hosting',
    version: '1.0.0',
    isActive: true,
    configuration: {
      package: 'default',
      diskQuota: 100,
      bandwidthQuota: 1000
    },
    metadata: {
      supportedPricingModels: ['FIXED'],
      requiredConfigFields: ['package'],
      optionalConfigFields: ['diskQuota', 'bandwidthQuota'],
      usageTrackingSupported: false,
      provisioningRequired: true,
      provisioningProvider: 'cpanel'
    },
    tenantId: tenant.id,
  }).returning();

  // Create a product
  const [product] = await db.insert(products).values({
    name: 'Test Hosting Product',
    description: 'Test hosting product with cPanel',
    category: 'hosting',
    isActive: true,
    isPublic: true,
    tenantId: tenant.id,
  }).returning();

  // Link component to product
  const [productComponent] = await db.insert(productComponents).values({
    productId: product.id,
    componentId: cpanelComponent.id,
    pricingModel: 'FIXED',
    configuration: {
      package: 'starter',
      diskQuota: 50,
      bandwidthQuota: 500
    },
    sortOrder: 1,
    tenantId: tenant.id,
  }).returning();

  return {
    tenantId: tenant.id,
    adminUserId: adminUser.id,
    clientId: client.id,
    planId: plan.id,
    productId: product.id,
    componentId: cpanelComponent.id,
    productComponentId: productComponent.id
  };
}

/**
 * Initialize all required services
 */
async function initializeServices() {
  const subscriptionService = new SubscriptionService();
  const lifecycleService = ComponentLifecycleService.getInstance();
  const cpanelPlugin = new CpanelPlugin();

  // Register the cPanel plugin
  lifecycleService.registerHandler('cpanel', cpanelPlugin);

  // Start the lifecycle service if not already started
  if (!lifecycleService['worker']) {
    await lifecycleService.start();
  }

  return {
    subscriptionService,
    lifecycleService,
    cpanelPlugin
  };
}

/**
 * Create a test subscription
 */
async function createTestSubscription(testData: any, subscriptionService: SubscriptionService) {
  const result = await subscriptionService.createSubscription({
    clientId: testData.clientId,
    planId: testData.planId,
    productId: testData.productId,
    tenantId: testData.tenantId,
    metadata: {
      testRun: true,
      phase: 'phase2-integration'
    }
  });

  if (!result.success) {
    throw new Error(`Failed to create subscription: ${result.error}`);
  }

  return result.subscription;
}

/**
 * Verify that provisioning was successful
 */
async function verifyProvisioningResults(subscriptionId: string, tenantId: string) {
  const logger = Logger.getInstance();

  // Get subscribed components for this subscription
  const subscribedComponentsList = await db.query.subscribedComponents.findMany({
    where: eq(subscribedComponents.subscriptionId, subscriptionId),
    with: {
      component: true
    }
  });

  logger.info(`Found ${subscribedComponentsList.length} subscribed components`);

  for (const subscribedComponent of subscribedComponentsList) {
    const metadata = subscribedComponent.metadata as any;
    
    logger.info('Checking provisioning status', {
      componentName: subscribedComponent.component.name,
      provisioningStatus: metadata?.provisioningStatus,
      remoteId: metadata?.remoteId
    });

    // Verify provisioning status
    if (metadata?.provisioningStatus === 'active') {
      logger.info('✅ Component provisioned successfully', {
        componentId: subscribedComponent.id,
        remoteId: metadata.remoteId
      });
    } else if (metadata?.provisioningStatus === 'failed') {
      throw new Error(`Component provisioning failed: ${metadata.lastProvisioningError}`);
    } else {
      throw new Error(`Component provisioning incomplete. Status: ${metadata?.provisioningStatus}`);
    }
  }

  logger.info('✅ All components provisioned successfully');
}

/**
 * Test subscription cancellation
 */
async function testSubscriptionCancellation(subscriptionId: string, tenantId: string, subscriptionService: SubscriptionService) {
  const result = await subscriptionService.cancelSubscription(subscriptionId, tenantId, {
    cancelAtPeriodEnd: false,
    reason: 'integration_test_cancellation'
  });

  if (!result.success) {
    throw new Error('Failed to cancel subscription');
  }

  Logger.getInstance().info('✅ Subscription cancelled successfully');
}

/**
 * Verify that termination was successful
 */
async function verifyTerminationResults(subscriptionId: string, tenantId: string) {
  const logger = Logger.getInstance();

  // Get subscribed components for this subscription
  const subscribedComponentsList = await db.query.subscribedComponents.findMany({
    where: eq(subscribedComponents.subscriptionId, subscriptionId),
    with: {
      component: true
    }
  });

  for (const subscribedComponent of subscribedComponentsList) {
    const metadata = subscribedComponent.metadata as any;
    
    logger.info('Checking termination status', {
      componentName: subscribedComponent.component.name,
      provisioningStatus: metadata?.provisioningStatus,
      isActive: subscribedComponent.isActive
    });

    // Verify termination status
    if (metadata?.provisioningStatus === 'terminated' && !subscribedComponent.isActive) {
      logger.info('✅ Component terminated successfully', {
        componentId: subscribedComponent.id
      });
    } else {
      throw new Error(`Component termination incomplete. Status: ${metadata?.provisioningStatus}, Active: ${subscribedComponent.isActive}`);
    }
  }

  logger.info('✅ All components terminated successfully');
}

/**
 * Cleanup test data
 */
async function cleanupTestData(tenantId: string) {
  try {
    // Clean up in reverse order of dependencies
    await db.delete(subscribedComponents).where(eq(subscribedComponents.tenantId, tenantId));
    await db.delete(subscriptions).where(eq(subscriptions.tenantId, tenantId));
    await db.delete(productComponents).where(eq(productComponents.tenantId, tenantId));
    await db.delete(products).where(eq(products.tenantId, tenantId));
    await db.delete(components).where(eq(components.tenantId, tenantId));
    await db.delete(plans).where(eq(plans.tenantId, tenantId));
    await db.delete(clients).where(eq(clients.tenantId, tenantId));
    await db.delete(users).where(eq(users.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (error) {
    Logger.getInstance().warn('Some cleanup operations failed (this is normal if test failed early)', { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// Main execution
if (require.main === module) {
  testPhase2Integration()
    .then(() => {
      console.log('🎉 Phase 2 Integration Test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Phase 2 Integration Test failed:', error);
      process.exit(1);
    });
}

export { testPhase2Integration }; 