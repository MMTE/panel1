#!/usr/bin/env tsx

import { db } from '../db';
import { paymentGatewayConfigs } from '../db/schema';
import { encryptionService } from '../lib/security/EncryptionService';
import { eq } from 'drizzle-orm';

/**
 * Migration script to encrypt existing plaintext credentials
 * Run this once after implementing encryption in the API
 */
async function encryptExistingSecrets() {
  console.log('🔐 Starting encryption of existing payment gateway credentials...\n');

  try {
    // Fetch all payment gateway configurations
    const allConfigs = await db.select().from(paymentGatewayConfigs);
    console.log(`📋 Found ${allConfigs.length} payment gateway configurations to process`);

    let processedCount = 0;
    let alreadyEncryptedCount = 0;
    let errorCount = 0;

    for (const config of allConfigs) {
      try {
        console.log(`\n🔍 Processing gateway: ${config.displayName} (${config.gatewayName})`);
        
        // Check if config exists and is not already encrypted
        if (!config.config) {
          console.log(`  ⚠️  No config found for gateway ${config.id}, skipping`);
          continue;
        }

        // Check if already encrypted
        if (typeof config.config === 'string' && encryptionService.isEncrypted(config.config)) {
          console.log(`  ✅ Config already encrypted for gateway ${config.id}`);
          alreadyEncryptedCount++;
        continue;
      }

        // Convert to string if it's an object (this handles both JSON objects and strings)
        const configString = typeof config.config === 'string' 
          ? config.config 
          : JSON.stringify(config.config);

        // Validate that we have valid JSON
        let parsedConfig;
        try {
          parsedConfig = JSON.parse(configString);
        } catch (jsonError) {
          console.log(`  ❌ Invalid JSON config for gateway ${config.id}, skipping`);
          errorCount++;
          continue;
        }

        // Encrypt the configuration
        const encryptedConfig = encryptionService.encrypt(configString);
        
        // Update the database record
          await db
            .update(paymentGatewayConfigs)
          .set({ 
            config: encryptedConfig,
            updatedAt: new Date()
          })
          .where(eq(paymentGatewayConfigs.id, config.id));

        console.log(`  🔒 Successfully encrypted config for gateway ${config.id}`);
        processedCount++;

      } catch (error) {
        console.error(`  ❌ Failed to process gateway ${config.id}:`, error);
        errorCount++;
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`  ✅ Successfully encrypted: ${processedCount} configurations`);
    console.log(`  ⚠️  Already encrypted: ${alreadyEncryptedCount} configurations`);
    console.log(`  ❌ Errors encountered: ${errorCount} configurations`);
    console.log(`  📋 Total processed: ${allConfigs.length} configurations`);

    if (errorCount > 0) {
      console.log(`\n⚠️  WARNING: ${errorCount} configurations had errors and were not encrypted.`);
      console.log(`Please review the errors above and handle them manually if needed.`);
    }

    if (processedCount > 0) {
      console.log(`\n🎉 Migration completed successfully!`);
      console.log(`All payment gateway credentials are now encrypted at rest.`);
    } else if (alreadyEncryptedCount === allConfigs.length) {
      console.log(`\n✅ All credentials were already encrypted. No migration needed.`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
      process.exit(1);
  }
}

// Run the migration
if (import.meta.url === `file://${process.argv[1]}`) {
  encryptExistingSecrets()
    .then(() => {
      console.log('\n🏁 Migration script completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export default encryptExistingSecrets; 