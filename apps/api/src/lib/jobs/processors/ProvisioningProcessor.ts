import { Job } from 'bullmq';
import { ProvisioningManager } from '../../provisioning/ProvisioningManager';

export class ProvisioningProcessor {
  private provisioningManager: ProvisioningManager;

  constructor() {
    this.provisioningManager = ProvisioningManager.getInstance();
  }

  async process(job: Job): Promise<void> {
    const { taskId, operation } = job.data.payload;

    console.log(`🔄 Processing provisioning job: ${operation} (Task: ${taskId})`);

    try {
      // Ensure provisioning manager is initialized
      await this.provisioningManager.initialize();

      // Process the provisioning task
      await this.provisioningManager.processProvisioningJob(taskId);

      console.log(`✅ Provisioning job completed: ${operation} (Task: ${taskId})`);
    } catch (error) {
      console.error(`❌ Provisioning job failed: ${operation} (Task: ${taskId})`, error);
      throw error; // Re-throw to mark job as failed
    }
  }
} 