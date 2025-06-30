import { db } from '../db';
import { plugins } from '../db/schema';
import { eq } from 'drizzle-orm';
import { Logger } from '../lib/logging/Logger';

const logger = Logger.getInstance();

async function removePlugin(pluginId: string) {
  logger.info(`Attempting to remove plugin: ${pluginId}`);
  try {
    const deleted = await db.delete(plugins).where(eq(plugins.id, pluginId)).returning();
    if (deleted.length > 0) {
      logger.info(`✅ Successfully removed plugin '${pluginId}' from the database.`);
    } else {
      logger.warn(`⚠️ Plugin '${pluginId}' not found in the database. No action taken.`);
    }
  } catch (error) {
    logger.error(`❌ Failed to remove plugin '${pluginId}'`, { error: String(error) });
    process.exit(1);
  }
}

async function main() {
  const pluginId = process.argv[2];
  if (!pluginId) {
    logger.error('Usage: npm run script:remove-plugin <plugin-id>');
    process.exit(1);
  }

  await removePlugin(pluginId);
  process.exit(0);
}

main(); 