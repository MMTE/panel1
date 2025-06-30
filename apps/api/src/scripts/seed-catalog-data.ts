import { db } from '../db';
import { 
  components, 
  products, 
  productComponents, 
  billingPlans,
  tenants 
} from '../db/schema';
import { eq } from 'drizzle-orm';

async function seedCatalogData() {
  console.log('🌱 Seeding catalog data...');

  try {
    // Get the first tenant, or create one if it doesn't exist
    let [tenant] = await db.select().from(tenants).limit(1);
    
    if (!tenant) {
      console.log('No tenant found. Creating a default tenant...');
      [tenant] = await db.insert(tenants).values({
        name: 'Default Tenant',
        domain: 'localhost',
        status: 'active',
      }).returning();
      console.log('✅ Default tenant created.');
    }

    console.log(`📋 Using tenant: ${tenant.name} (${tenant.id})`);

    // 1. Create Component Definitions
    console.log('🔧 Creating component definitions...');
    
    const [cpanelHostingComponent] = await db
      .insert(components)
      .values({
        componentKey: 'cpanel_hosting',
        name: 'cPanel Hosting',
        description: 'Shared hosting with cPanel control panel',
        type: 'HOSTING',
        provisioningRequired: true,
        provisioningProvider: 'cpanel',
        configSchema: {
          type: 'object',
          properties: {
            package: { type: 'string', required: true },
            diskQuota: { type: 'number', minimum: 1000 },
            bandwidthQuota: { type: 'number', minimum: 10000 },
            emailAccounts: { type: 'number', minimum: 1 },
            databases: { type: 'number', minimum: 1 }
          }
        },
        defaultConfig: {
          package: 'basic',
          diskQuota: 5000, // 5GB in MB
          bandwidthQuota: 50000, // 50GB in MB
          emailAccounts: 10,
          databases: 5
        },
        tenantId: tenant.id,
      })
      .returning();

    const [sslComponent] = await db
      .insert(components)
      .values({
        componentKey: 'ssl_certificate',
        name: 'SSL Certificate',
        description: 'Domain validated SSL certificate',
        type: 'SSL',
        provisioningRequired: true,
        provisioningProvider: 'ssl',
        configSchema: {
          type: 'object',
          properties: {
            certificateType: { type: 'string', enum: ['domain_validated', 'organization_validated'] },
            validityPeriod: { type: 'number', enum: [365, 730] }
          }
        },
        defaultConfig: {
          certificateType: 'domain_validated',
          validityPeriod: 365
        },
        tenantId: tenant.id,
      })
      .returning();

    const [bandwidthComponent] = await db
      .insert(components)
      .values({
        componentKey: 'bandwidth_usage',
        name: 'Bandwidth Usage',
        description: 'Pay-per-GB bandwidth usage',
        type: 'BANDWIDTH',
        provisioningRequired: false,
        configSchema: {
          type: 'object',
          properties: {
            includedGB: { type: 'number', minimum: 0 }
          }
        },
        defaultConfig: {
          includedGB: 100
        },
        tenantId: tenant.id,
      })
      .returning();

    console.log('✅ Component definitions created');

    // 2. Create Products
    console.log('📦 Creating products...');

    const [basicHostingProduct] = await db
      .insert(products)
      .values({
        name: 'Basic Hosting',
        description: 'Perfect for small websites and blogs',
        shortDescription: 'Shared hosting with 5GB storage',
        category: 'hosting',
        tags: ['shared', 'beginner', 'wordpress'],
        isActive: true,
        isPublic: true,
        sortOrder: 1,
        trialPeriodDays: 30,
        setupRequired: true,
        tenantId: tenant.id,
      })
      .returning();

    const [proHostingProduct] = await db
      .insert(products)
      .values({
        name: 'Pro Hosting',
        description: 'Advanced hosting with SSL and enhanced features',
        shortDescription: 'Shared hosting with SSL included',
        category: 'hosting',
        tags: ['shared', 'ssl', 'professional'],
        isActive: true,
        isPublic: true,
        sortOrder: 2,
        trialPeriodDays: 15,
        setupRequired: true,
        tenantId: tenant.id,
      })
      .returning();

    const [bandwidthProduct] = await db
      .insert(products)
      .values({
        name: 'Extra Bandwidth',
        description: 'Additional bandwidth for high-traffic websites',
        shortDescription: 'Pay-as-you-go bandwidth',
        category: 'addons',
        tags: ['bandwidth', 'payg', 'addon'],
        isActive: true,
        isPublic: true,
        sortOrder: 10,
        setupRequired: false,
        tenantId: tenant.id,
      })
      .returning();

    console.log('✅ Products created');

    // 3. Create Product Components (link products to components with pricing)
    console.log('🔗 Creating product components...');

    // Basic Hosting = cPanel Hosting only
    await db
      .insert(productComponents)
      .values({
        productId: basicHostingProduct.id,
        componentDefinitionId: cpanelHostingComponent.id,
        pricingModel: 'FIXED',
        pricingDetails: {
          fixedPrice: 0, // Base price is in billing plan
          currency: 'USD'
        },
        defaultConfig: {
          package: 'basic',
          diskQuota: 5000,
          bandwidthQuota: 50000,
          emailAccounts: 10,
          databases: 5
        },
        isRequired: true,
        isConfigurable: false,
        sortOrder: 1,
        tenantId: tenant.id,
      });

    // Pro Hosting = cPanel Hosting + SSL Certificate
    await db
      .insert(productComponents)
      .values([
        {
          productId: proHostingProduct.id,
          componentDefinitionId: cpanelHostingComponent.id,
          pricingModel: 'FIXED',
          pricingDetails: {
            fixedPrice: 0, // Base price is in billing plan
            currency: 'USD'
          },
          defaultConfig: {
            package: 'pro',
            diskQuota: 20000, // 20GB
            bandwidthQuota: 200000, // 200GB
            emailAccounts: 50,
            databases: 20
          },
          isRequired: true,
          isConfigurable: false,
          sortOrder: 1,
          tenantId: tenant.id,
        },
        {
          productId: proHostingProduct.id,
          componentDefinitionId: sslComponent.id,
          pricingModel: 'FIXED',
          pricingDetails: {
            fixedPrice: 0, // Included in base price
            currency: 'USD'
          },
          defaultConfig: {
            certificateType: 'domain_validated',
            validityPeriod: 365
          },
          isRequired: true,
          isConfigurable: false,
          sortOrder: 2,
          tenantId: tenant.id,
        }
      ]);

    // Extra Bandwidth = Usage-based bandwidth
    await db
      .insert(productComponents)
      .values({
        productId: bandwidthProduct.id,
        componentDefinitionId: bandwidthComponent.id,
        pricingModel: 'USAGE_BASED',
        pricingDetails: {
          pricePerUnit: 0.10, // $0.10 per GB
          includedQuantity: 0, // No free tier
          billingUnit: 'GB',
          currency: 'USD'
        },
        defaultConfig: {
          includedGB: 0
        },
        isRequired: true,
        isConfigurable: false,
        sortOrder: 1,
        tenantId: tenant.id,
      });

    console.log('✅ Product components created');

    // 4. Create Billing Plans
    console.log('💳 Creating billing plans...');

    // Basic Hosting Plans
    await db
      .insert(billingPlans)
      .values([
        {
          productId: basicHostingProduct.id,
          name: 'Monthly',
          description: 'Pay monthly',
          interval: 'MONTHLY',
          intervalCount: 1,
          basePrice: '9.99',
          currency: 'USD',
          setupFee: '0.00',
          trialPeriodDays: 30,
          isDefault: true,
          isActive: true,
          sortOrder: 1,
          tenantId: tenant.id,
        },
        {
          productId: basicHostingProduct.id,
          name: 'Yearly',
          description: 'Pay yearly (2 months free)',
          interval: 'YEARLY',
          intervalCount: 1,
          basePrice: '99.99',
          currency: 'USD',
          setupFee: '0.00',
          trialPeriodDays: 30,
          isDefault: false,
          isActive: true,
          sortOrder: 2,
          tenantId: tenant.id,
        }
      ]);

    // Pro Hosting Plans
    await db
      .insert(billingPlans)
      .values([
        {
          productId: proHostingProduct.id,
          name: 'Monthly',
          description: 'Pay monthly',
          interval: 'MONTHLY',
          intervalCount: 1,
          basePrice: '24.99',
          currency: 'USD',
          setupFee: '0.00',
          trialPeriodDays: 15,
          isDefault: true,
          isActive: true,
          sortOrder: 1,
          tenantId: tenant.id,
        },
        {
          productId: proHostingProduct.id,
          name: 'Yearly',
          description: 'Pay yearly (2 months free)',
          interval: 'YEARLY',
          intervalCount: 1,
          basePrice: '249.99',
          currency: 'USD',
          setupFee: '0.00',
          trialPeriodDays: 15,
          isDefault: false,
          isActive: true,
          sortOrder: 2,
          tenantId: tenant.id,
        }
      ]);

    // Extra Bandwidth Plan (Pay-as-you-go)
    await db
      .insert(billingPlans)
      .values({
        productId: bandwidthProduct.id,
        name: 'Pay-as-you-go',
        description: 'Pay for what you use',
        interval: 'MONTHLY',
        intervalCount: 1,
        basePrice: '0.00',
        currency: 'USD',
        setupFee: '0.00',
        trialPeriodDays: 0,
        isDefault: true,
        isActive: true,
        sortOrder: 1,
        tenantId: tenant.id,
      });

    console.log('✅ Billing plans created');
    console.log('🎉 Catalog data seeded successfully!');

    // Print summary
    const componentCount = await db.select().from(components).where(eq(components.tenantId, tenant.id));
    const productCount = await db.select().from(products).where(eq(products.tenantId, tenant.id));
    const productComponentCount = await db.select().from(productComponents).where(eq(productComponents.tenantId, tenant.id));
    const billingPlanCount = await db.select().from(billingPlans).where(eq(billingPlans.tenantId, tenant.id));

    console.log('\n📊 Summary:');
    console.log(`   Components: ${componentCount.length}`);
    console.log(`   Products: ${productCount.length}`);
    console.log(`   Product Components: ${productComponentCount.length}`);
    console.log(`   Billing Plans: ${billingPlanCount.length}`);
  } catch (error) {
    console.error('❌ Error seeding catalog data:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url.startsWith('file:') && process.argv[1] === import.meta.url.slice(7)) {
  seedCatalogData()
    .then(() => {
      console.log('✅ Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

export { seedCatalogData };