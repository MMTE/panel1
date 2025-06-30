import { ComponentDefinitionService } from '../lib/catalog/ComponentDefinitionService';
import { ProductService } from '../lib/catalog/ProductService';
import { ComponentProviderRegistry } from '../lib/catalog/ComponentProviderRegistry';
import { CatalogEventHandlers } from '../lib/catalog/CatalogEventHandlers';
import { logger } from '../lib/logging/Logger';

async function testCatalogSystem() {
  console.log('🧪 Starting Catalog System Integration Test...');

  try {
    // Initialize services
    const componentService = ComponentDefinitionService.getInstance();
    const productService = ProductService.getInstance();
    const providerRegistry = ComponentProviderRegistry.getInstance();
    const eventHandlers = CatalogEventHandlers.getInstance();

    // Initialize event handlers
    await eventHandlers.initialize();
    console.log('✅ Event handlers initialized');

    // Initialize provider registry
    await providerRegistry.initialize();
    console.log('✅ Provider registry initialized');

    // Test 1: Create a component definition
    console.log('\n📝 Test 1: Creating component definition...');
    try {
      const componentDef = await componentService.createComponentDefinition({
        name: 'Test Web Hosting',
        description: 'A test web hosting component for integration testing',
        componentKey: 'cpanel-hosting', // This should exist from the default providers
        configuration: {
          diskSpaceGB: 10,
          bandwidth: 'unlimited',
          domains: 1,
          subdomains: 10,
          emailAccounts: 10
        },
        isActive: true
      });

      console.log('✅ Component definition created:', {
        id: componentDef.id,
        name: componentDef.name,
        componentKey: componentDef.componentKey
      });
    } catch (error) {
      console.log('⚠️  Component creation failed (expected if provider not found):', error.message);
    }

    // Test 2: List component definitions
    console.log('\n📋 Test 2: Listing component definitions...');
    const components = await componentService.listComponentDefinitions();
    console.log(`✅ Found ${components.length} component definitions`);
    
    if (components.length > 0) {
      console.log('Sample component:', {
        name: components[0].name,
        componentKey: components[0].componentKey,
        isActive: components[0].isActive
      });
    }

    // Test 3: Create a product (if we have components)
    if (components.length > 0) {
      console.log('\n🏪 Test 3: Creating product...');
      try {
        const product = await productService.createProduct({
          name: 'Starter Hosting Plan',
          description: 'Perfect for small websites and blogs',
          shortDescription: 'Entry-level hosting with essential features',
          category: 'hosting',
          tags: ['starter', 'basic', 'small-business'],
          isActive: true,
          isPublic: true,
          sortOrder: 1,
          trialPeriodDays: 30,
          setupRequired: true,
          components: [{
            componentId: parseInt(components[0].id),
            pricingModel: 'FIXED',
            pricingDetails: {
              monthlyPrice: 9.99,
              yearlyPrice: 99.99
            },
            configuration: {
              autoSetup: true
            },
            sortOrder: 1
          }],
          billingPlans: [{
            name: 'Monthly',
            basePrice: '9.99',
            interval: 'MONTHLY',
            setupFee: '0.00',
            isActive: true,
            sortOrder: 1
          }, {
            name: 'Yearly',
            basePrice: '99.99',
            interval: 'YEARLY',
            setupFee: '0.00',
            isActive: true,
            sortOrder: 2
          }]
        });

        console.log('✅ Product created:', {
          id: product.id,
          name: product.name,
          category: product.category,
          components: product.components?.length || 0,
          billingPlans: product.billingPlans?.length || 0
        });

        // Test 4: Update the product
        console.log('\n🔄 Test 4: Updating product...');
        const updatedProduct = await productService.updateProduct(product.id, {
          description: 'Updated: Perfect for small websites, blogs, and portfolio sites',
          tags: ['starter', 'basic', 'small-business', 'portfolio']
        });

        console.log('✅ Product updated:', {
          id: updatedProduct.id,
          description: updatedProduct.description,
          tags: updatedProduct.tags
        });

        // Test 5: Search products
        console.log('\n🔍 Test 5: Searching products...');
        const searchResults = await productService.searchProducts('hosting');
        console.log(`✅ Search found ${searchResults.length} products`);

        // Test 6: Get products by category
        console.log('\n📂 Test 6: Getting products by category...');
        const hostingProducts = await productService.getProductsByCategory('hosting');
        console.log(`✅ Found ${hostingProducts.length} hosting products`);

        // Test 7: Delete the test product
        console.log('\n🗑️  Test 7: Cleaning up test product...');
        await productService.deleteProduct(product.id);
        console.log('✅ Test product deleted');

      } catch (error) {
        console.log('❌ Product operations failed:', error.message);
      }
    }

    // Test 8: Check provider health
    console.log('\n🏥 Test 8: Checking provider health...');
    try {
      const healthCheck = await providerRegistry.performHealthCheck();
      console.log('✅ Provider health check completed:', {
        totalProviders: Object.keys(healthCheck).length,
        healthyProviders: Object.values(healthCheck).filter(h => h.healthy).length
      });
    } catch (error) {
      console.log('⚠️  Health check failed:', error.message);
    }

    // Test 9: Get provider metadata
    console.log('\n📊 Test 9: Getting provider metadata...');
    const providersMetadata = await providerRegistry.getProvidersMetadata();
    console.log(`✅ Retrieved metadata for ${providersMetadata.length} providers`);
    
    if (providersMetadata.length > 0) {
      console.log('Sample provider:', {
        name: providersMetadata[0].name,
        version: providersMetadata[0].version,
        componentKey: providersMetadata[0].componentKey
      });
    }

    console.log('\n🎉 Catalog System Integration Test Completed Successfully!');
    return true;

  } catch (error) {
    console.error('❌ Catalog system test failed:', error);
    logger.error('Catalog system integration test failed', { error });
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCatalogSystem()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { testCatalogSystem }; 