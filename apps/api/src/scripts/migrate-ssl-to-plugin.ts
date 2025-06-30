import { db } from '../db';
import { subscribedComponents, components } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { Logger } from '../lib/logging/Logger';
import { PluginManager } from '../lib/plugins/PluginManager';
import { SslPlugin } from '../lib/plugins/ssl/SslPlugin';

const logger = Logger.getInstance();

async function migrateSslToPlugin() {
  try {
    logger.info('🔄 Starting SSL component handler to plugin migration...');

    // 1. Install and enable the SSL plugin
    const pluginManager = PluginManager.getInstance();
    const sslPlugin = new SslPlugin();

    logger.info('📦 Installing SSL plugin...');
    await pluginManager.installPlugin(sslPlugin, {
      config: {
        enabled: true,
        defaultValidityPeriod: 365,
        defaultCertificateType: 'domain_validated',
        autoRenewal: true,
        renewalThresholdDays: 30
      }
    });

    logger.info('✅ Enabling SSL plugin...');
    await pluginManager.enablePlugin(sslPlugin.metadata.id);

    // 2. Update component definitions to use the new plugin
    logger.info('🔄 Updating SSL component definitions...');
    
    const sslComponents = await db
      .select()
      .from(components)
      .where(eq(components.componentKey, 'ssl'));

    for (const component of sslComponents) {
      await db
        .update(components)
        .set({
          metadata: {
            ...component.metadata,
            provisioningProvider: 'ssl-plugin',
            migratedAt: new Date().toISOString(),
            previousProvider: component.metadata?.provisioningProvider || 'ssl'
          },
          updatedAt: new Date()
        })
        .where(eq(components.id, component.id));
      
      logger.info(`✅ Updated component definition: ${component.name}`);
    }

    // 3. Update subscribed components to use the new plugin
    logger.info('🔄 Updating subscribed SSL components...');
    
    const subscribedSslComponents = await db
      .select()
      .from(subscribedComponents)
      .where(
        and(
          eq(subscribedComponents.isActive, true),
          eq(subscribedComponents.componentKey, 'ssl')
        )
      );

    for (const subscribedComponent of subscribedSslComponents) {
      await db
        .update(subscribedComponents)
        .set({
          metadata: {
            ...subscribedComponent.metadata,
            provisioningProvider: 'ssl-plugin',
            migratedAt: new Date().toISOString(),
            previousProvider: subscribedComponent.metadata?.provisioningProvider || 'ssl'
          },
          updatedAt: new Date()
        })
        .where(eq(subscribedComponents.id, subscribedComponent.id));
      
      logger.info(`✅ Updated subscribed component: ${subscribedComponent.id}`);
    }

    logger.info('✅ SSL migration completed successfully!');
    logger.info(`📊 Migration summary:
      - Components updated: ${sslComponents.length}
      - Subscribed components updated: ${subscribedSslComponents.length}
      - SSL plugin installed and enabled
    `);

  } catch (error) {
    logger.error('❌ SSL migration failed:', error);
    throw error;
  }
}

// Run the migration
if (require.main === module) {
  migrateSslToPlugin()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
} 