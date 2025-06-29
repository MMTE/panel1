import { ProvisioningManager } from '../lib/provisioning/ProvisioningManager';
import { db } from '../db';
import { tenants } from '../db/schema';

async function testProvisioning() {
  console.log('🚀 Testing Provisioning System...');

  try {
    // Initialize the provisioning manager
    const provisioningManager = ProvisioningManager.getInstance();
    await provisioningManager.initialize();

    // Get a tenant for testing (create one if none exists)
    let tenant = await db.select().from(tenants).limit(1);
    if (!tenant.length) {
      console.log('📝 Creating test tenant...');
      const [newTenant] = await db
        .insert(tenants)
        .values({
          name: 'Test Tenant',
          slug: 'test-tenant',
          isActive: true,
        })
        .returning();
      tenant = [newTenant];
    }

    const tenantId = tenant[0].id;
    console.log(`✅ Using tenant: ${tenant[0].name} (${tenantId})`);

    // Test 1: Create a cPanel provider
    console.log('\n📋 Test 1: Creating cPanel provider...');
    try {
      const providerId = await provisioningManager.createProvider({
        name: 'Test cPanel Server',
        type: 'cpanel',
        hostname: 'cpanel.example.com',
        port: 2087,
        username: 'root',
        apiKey: 'test-api-key',
        useSSL: true,
        verifySSL: false, // For testing
        tenantId,
      });
      console.log(`✅ Created provider: ${providerId}`);

      // Test 2: Get provider status
      console.log('\n📋 Test 2: Getting provider status...');
      const providerStatus = await provisioningManager.getProviderStatus(providerId);
      console.log(`✅ Provider status:`, {
        name: providerStatus.name,
        type: providerStatus.type,
        hostname: providerStatus.hostname,
        isActive: providerStatus.isActive,
        healthStatus: providerStatus.healthStatus,
      });

      // Test 3: List providers
      console.log('\n📋 Test 3: Listing providers...');
      const providers = await provisioningManager.listProviders(tenantId);
      console.log(`✅ Found ${providers.length} provider(s)`);

      // Test 4: Test provider health (this will fail with test credentials, but shows the flow)
      console.log('\n📋 Test 4: Testing provider connection...');
      try {
        const healthResult = await provisioningManager.performHealthCheck(providerId);
        console.log(`✅ Health check result:`, {
          healthy: healthResult.healthy,
          status: healthResult.status,
          message: healthResult.message,
        });
      } catch (error) {
        console.log(`⚠️ Health check failed (expected with test credentials):`, 
          error instanceof Error ? error.message : error);
      }

      console.log('\n🎉 Provisioning system test completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('   1. Configure real provider credentials');
      console.log('   2. Create service instances');
      console.log('   3. Test provisioning operations');
      console.log('   4. Monitor tasks and events');

    } catch (error) {
      console.error('❌ Provider creation failed:', error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup
    try {
      const manager = ProvisioningManager.getInstance();
      await manager.shutdown();
    } catch (error) {
      console.error('⚠️ Shutdown error:', error);
    }
    process.exit(0);
  }
}

// Run the test
testProvisioning().catch(console.error); 