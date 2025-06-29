import dotenv from 'dotenv';
import { paymentService } from '../lib/payments/PaymentService';
import { db } from '../db';
import { tenants } from '../db/schema';

// Load environment variables
dotenv.config();

/**
 * Setup Payment Gateways
 * This script initializes payment gateways with default configurations
 */
async function setupPaymentGateways() {
  console.log('🔧 Setting up Payment Gateways...\n');

  try {
    // Initialize payment service
    await paymentService.initialize();

    // Get all tenants
    const allTenants = await db.select().from(tenants);
    
    if (allTenants.length === 0) {
      console.log('ℹ️ No tenants found. Please create a tenant first.');
      return;
    }

    // Setup Stripe for each tenant
    for (const tenant of allTenants) {
      console.log(`🏢 Setting up payment gateways for tenant: ${tenant.name}`);
      
      await setupStripeGateway(tenant.id);
      
      // Test the gateway configuration
      await testGatewayConfiguration(tenant.id);
    }

    console.log('\n✅ Payment gateway setup completed successfully!');
    
    // Display summary
    await displayGatewaySummary();

  } catch (error) {
    console.error('❌ Payment gateway setup failed:', error);
  }
}

async function setupStripeGateway(tenantId: string) {
  console.log('   💳 Setting up Stripe gateway...');
  
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    console.log('   ⚠️ STRIPE_SECRET_KEY not found in environment variables');
    console.log('   ℹ️ Please add STRIPE_SECRET_KEY to your .env file');
    return;
  }

  try {
    const gatewayConfig = {
      displayName: 'Stripe',
      isActive: true,
      priority: 1,
      config: {
        secretKey: stripeSecretKey,
        webhookSecret: stripeWebhookSecret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      },
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
      supportedCountries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL'],
    };

    await paymentService.setupGateway(tenantId, 'stripe', gatewayConfig);
    console.log('   ✅ Stripe gateway configured successfully');

  } catch (error) {
    console.error('   ❌ Failed to setup Stripe gateway:', error);
  }
}

async function testGatewayConfiguration(tenantId: string) {
  console.log('   🧪 Testing gateway configuration...');
  
  try {
    const healthResult = await paymentService.testGateway(tenantId, 'stripe');
    
    if (healthResult.healthy) {
      console.log('   ✅ Gateway health check passed');
      console.log(`   ⏱️ Response time: ${healthResult.responseTime}ms`);
    } else {
      console.log('   ⚠️ Gateway health check failed');
      console.log(`   💡 ${healthResult.message}`);
    }
  } catch (error) {
    console.log('   ⚠️ Gateway test failed:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function displayGatewaySummary() {
  console.log('\n📊 Payment Gateway Summary:');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Get all tenants
  const allTenants = await db.select().from(tenants);
  
  for (const tenant of allTenants) {
    console.log(`\n🏢 Tenant: ${tenant.name} (${tenant.id})`);
    
    try {
      const availableGateways = await paymentService.getAvailableGateways(tenant.id);
      
      if (availableGateways.length === 0) {
        console.log('   ⚠️ No payment gateways configured');
      } else {
        availableGateways.forEach(gateway => {
          console.log(`   💳 ${gateway.displayName} (${gateway.name})`);
          console.log(`      - Currencies: ${gateway.supportedCurrencies.slice(0, 5).join(', ')}${gateway.supportedCurrencies.length > 5 ? '...' : ''}`);
          console.log(`      - Countries: ${gateway.supportedCountries.slice(0, 5).join(', ')}${gateway.supportedCountries.length > 5 ? '...' : ''}`);
          console.log(`      - Refunds: ${gateway.capabilities.supportsRefunds ? '✅' : '❌'}`);
          console.log(`      - Recurring: ${gateway.capabilities.supportsRecurring ? '✅' : '❌'}`);
        });
      }
    } catch (error) {
      console.log('   ❌ Error fetching gateway information');
    }
  }
  
  console.log('\n💡 Next steps:');
  console.log('   1. Add your Stripe API keys to .env file');
  console.log('   2. Configure webhook endpoints in Stripe dashboard');
  console.log('   3. Test subscription renewals and refunds');
  console.log('   4. Set up additional payment gateways as needed');
}

// Run the setup
setupPaymentGateways()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  }); 