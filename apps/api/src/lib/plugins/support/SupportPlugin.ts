import { BasePlugin } from '../BasePlugin';
import { PluginMetadata, PluginConfig, PluginHook, ExtensionPoint } from '../types';
import { ComponentHandler } from '../../components/ComponentLifecycleService';
import { SupportService } from '../../support/SupportService';
import { SlaManager } from '../../support/SlaManager';
import { SupportAutomationEngine } from '../../support/SupportAutomationEngine';
import { Logger } from '../../logging/Logger';
import { db } from '../../../db';
import { subscribedComponents, supportTickets } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';

interface SupportPluginConfig extends PluginConfig {
  supportLevels: {
    [key: string]: {
      responseTime: string;
      channels: string[];
      businessHours: boolean;
      features: string[];
      automationRules?: string[];
    }
  };
  automationEnabled: boolean;
  knowledgeBaseEnabled: boolean;
  ticketEscalation: {
    enabled: boolean;
    thresholds: {
      warning: number;
      critical: number;
    };
  };
  channels: {
    email?: {
      enabled: boolean;
      inboundAddress?: string;
    };
    chat?: {
      enabled: boolean;
      platform?: string;
    };
    portal?: {
      enabled: boolean;
    };
    api?: {
      enabled: boolean;
    };
  };
}

interface SupportPlanData {
  supportLevel: string;
  responseTime: string;
  channels: string[];
  businessHours: boolean;
  features: string[];
  automationRules?: string[];
}

export class SupportPlugin extends BasePlugin implements ComponentHandler {
  private supportService = SupportService.getInstance();
  private slaManager = SlaManager.getInstance();
  private automationEngine = SupportAutomationEngine.getInstance();
  private logger = Logger.getInstance();
  private slaMonitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    super({
      id: 'support-plugin',
      name: 'Support Management Plugin',
      version: '1.0.0',
      description: 'Manages support plans, tickets, and automation through the component system',
      author: 'Panel1 Team',
      tags: ['support', 'tickets', 'automation'],
    });
  }

  async install(): Promise<void> {
    await super.install();
    this.logger.info('🎧 Installing Support Management Plugin...');
    await this.initializeSupportServices();
  }

  async uninstall(): Promise<void> {
    await super.uninstall();
    this.logger.info('🗑️ Uninstalling Support Management Plugin...');
    this.stopSlaMonitoring();
  }

  async enable(): Promise<void> {
    await super.enable();
    this.logger.info('✅ Enabling Support Management Plugin...');
    
    const config = this.config as SupportPluginConfig;
    
    if (config.automationEnabled) {
      await this.automationEngine.start();
    }
    
    await this.startSlaMonitoring();
  }

  async disable(): Promise<void> {
    await super.disable();
    this.logger.info('⏸️ Disabling Support Management Plugin...');
    await this.automationEngine.stop();
    this.stopSlaMonitoring();
  }

  async configure(config: SupportPluginConfig): Promise<void> {
    if (!this.validateSupportConfig(config)) {
      throw new Error('Invalid support plugin configuration');
    }
    await super.configure(config);
  }

  getExtensionPoints(): ExtensionPoint[] {
    return [
      this.registerExtensionPoint(
        'ticket-automation-rule',
        'Define custom ticket automation rules',
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            conditions: { type: 'array' },
            actions: { type: 'array' },
          },
          required: ['name', 'conditions', 'actions'],
        }
      ),
      this.registerExtensionPoint(
        'support-channel',
        'Add custom support channels',
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            handler: { type: 'function' },
            features: { type: 'array' },
          },
          required: ['name', 'handler', 'features'],
        }
      ),
      this.registerExtensionPoint(
        'knowledge-base-integration',
        'Integrate with external knowledge base systems',
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            handler: { type: 'function' },
            capabilities: { type: 'array' },
          },
          required: ['name', 'handler', 'capabilities'],
        }
      ),
    ];
  }

  getHooks(): PluginHook[] {
    return [
      this.registerHook('ticket.created', this.handleTicketCreated.bind(this), 10),
      this.registerHook('ticket.updated', this.handleTicketUpdated.bind(this), 10),
      this.registerHook('ticket.assigned', this.handleTicketAssigned.bind(this), 10),
      this.registerHook('ticket.resolved', this.handleTicketResolved.bind(this), 10),
      this.registerHook('ticket.reopened', this.handleTicketReopened.bind(this), 10),
      this.registerHook('ticket.sla.breached', this.handleSlaBreached.bind(this), 10),
      this.registerHook('ticket.automation.triggered', this.handleAutomationTriggered.bind(this), 10),
      this.registerHook('knowledge.article.created', this.handleKnowledgeArticleCreated.bind(this), 10),
      this.registerHook('knowledge.article.suggested', this.handleKnowledgeArticleSuggested.bind(this), 10),
    ];
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string; details?: Record<string, any>; }> {
    try {
      const config = this.config as SupportPluginConfig;
      const channelStatus = await this.checkChannelStatus();
      const automationStatus = config.automationEnabled ? await this.automationEngine.checkStatus() : null;
      const slaStatus = await this.slaManager.checkStatus();
      
      const healthy = channelStatus.every(c => c.healthy) && 
        (!automationStatus || automationStatus.healthy) &&
        slaStatus.healthy;
      
      return {
        healthy,
        message: healthy ? 'Support services are operational' : 'Some support services are not working',
        details: {
          channels: channelStatus,
          automation: automationStatus,
          sla: slaStatus,
          activeTickets: await this.getActiveTicketsCount(),
          slaBreaches: await this.getSlaBreachesCount(),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: 'Failed to check support services health',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  // ComponentHandler Implementation

  async provision(data: { subscribedComponentId: string; config: any; }): Promise<{ success: boolean; remoteId?: string; data?: any; }> {
    try {
      this.logger.info(`🎧 Provisioning support plan for component: ${data.subscribedComponentId}`);

      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        throw new Error(`Subscribed component not found: ${data.subscribedComponentId}`);
      }

      const pluginConfig = this.config as SupportPluginConfig;
      const supportLevel = data.config.supportLevel || 'basic';
      
      if (!pluginConfig.supportLevels[supportLevel]) {
        throw new Error(`Invalid support level: ${supportLevel}`);
      }

      const supportPlanData: SupportPlanData = {
        supportLevel,
        ...pluginConfig.supportLevels[supportLevel],
      };

      // Set up SLA rules
      await this.slaManager.configureSla({
        componentId: data.subscribedComponentId,
        responseTime: supportPlanData.responseTime,
        businessHours: supportPlanData.businessHours,
      });

      // Configure automation rules if enabled
      if (pluginConfig.automationEnabled && supportPlanData.automationRules) {
        await this.automationEngine.configureRules(
          data.subscribedComponentId,
          supportPlanData.automationRules
        );
      }

      this.logger.info(`✅ Support plan provisioning successful: ${supportLevel}`, { supportPlanData });

      return {
        success: true,
        remoteId: data.subscribedComponentId,
        data: supportPlanData
      };

    } catch (error) {
      this.logger.error(`❌ Support plan provisioning failed for component ${data.subscribedComponentId}:`, error);
      return {
        success: false,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      };
    }
  }

  async suspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`⏸️ Support plan suspension called for component: ${data.subscribedComponentId}`);

      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        return { success: true };
      }

      // Update SLA configuration for suspended state
      await this.slaManager.updateSla(data.subscribedComponentId, {
        suspended: true,
        responseTime: '48h', // Default suspended response time
      });

      // Disable automation rules
      if ((this.config as SupportPluginConfig).automationEnabled) {
        await this.automationEngine.disableRules(data.subscribedComponentId);
      }

      // Update existing tickets
      await db
        .update(supportTickets)
        .set({
          metadata: {
            suspended: true,
            suspendedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.subscriptionId, subscribedComponent.subscriptionId));

      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Support plan suspension failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }

  async unsuspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`▶️ Support plan unsuspension called for component: ${data.subscribedComponentId}`);

      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        return { success: true };
      }

      // Restore original SLA configuration
      await this.slaManager.updateSla(data.subscribedComponentId, {
        suspended: false,
      });

      // Re-enable automation rules
      if ((this.config as SupportPluginConfig).automationEnabled) {
        await this.automationEngine.enableRules(data.subscribedComponentId);
      }

      // Update existing tickets
      await db
        .update(supportTickets)
        .set({
          metadata: {
            suspended: false,
            unsuspendedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.subscriptionId, subscribedComponent.subscriptionId));

      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Support plan unsuspension failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }

  async terminate(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`🗑️ Support plan termination called for component: ${data.subscribedComponentId}`);

      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        return { success: true };
      }

      // Remove SLA configuration
      await this.slaManager.removeSla(data.subscribedComponentId);

      // Remove automation rules
      if ((this.config as SupportPluginConfig).automationEnabled) {
        await this.automationEngine.removeRules(data.subscribedComponentId);
      }

      // Close all open tickets
      await db
        .update(supportTickets)
        .set({
          status: 'closed',
          metadata: {
            terminatedAt: new Date().toISOString(),
            terminationReason: 'Support plan terminated',
          },
          updatedAt: new Date(),
        })
        .where(and(
          eq(supportTickets.subscriptionId, subscribedComponent.subscriptionId),
          eq(supportTickets.status, 'open')
        ));

      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Support plan termination failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }

  // Private methods

  private validateSupportConfig(config: SupportPluginConfig): boolean {
    if (!config || !config.supportLevels || Object.keys(config.supportLevels).length === 0) {
      return false;
    }

    for (const [level, settings] of Object.entries(config.supportLevels)) {
      if (!settings.responseTime || !settings.channels || settings.channels.length === 0) {
        return false;
      }
    }

    if (config.ticketEscalation?.enabled) {
      const { warning, critical } = config.ticketEscalation.thresholds;
      if (!warning || !critical || warning >= critical) {
        return false;
      }
    }

    return true;
  }

  private async initializeSupportServices(): Promise<void> {
    await this.supportService.initialize();
    await this.slaManager.initialize();
    if ((this.config as SupportPluginConfig).automationEnabled) {
      await this.automationEngine.initialize();
    }
  }

  private async startSlaMonitoring(): Promise<void> {
    if (this.slaMonitoringInterval) return;

    const checkInterval = 5 * 60 * 1000; // Every 5 minutes

    this.slaMonitoringInterval = setInterval(async () => {
      try {
        const breachedTickets = await this.slaManager.checkSlaBreaches();
        
        for (const ticket of breachedTickets) {
          await this.handleSlaBreached({
            ticketId: ticket.id,
            breachType: ticket.breachType,
            timeSinceLastUpdate: ticket.timeSinceLastUpdate,
          });
        }
      } catch (error) {
        this.logger.error('❌ Error checking SLA breaches:', error);
      }
    }, checkInterval);

    // Run initial check
    this.checkSlaBreaches().catch(error => {
      this.logger.error('❌ Error in initial SLA check:', error);
    });
  }

  private stopSlaMonitoring(): void {
    if (this.slaMonitoringInterval) {
      clearInterval(this.slaMonitoringInterval);
      this.slaMonitoringInterval = null;
    }
  }

  private async checkSlaBreaches(): Promise<void> {
    const breachedTickets = await this.slaManager.checkSlaBreaches();
    
    for (const ticket of breachedTickets) {
      await this.handleSlaBreached({
        ticketId: ticket.id,
        breachType: ticket.breachType,
        timeSinceLastUpdate: ticket.timeSinceLastUpdate,
      });
    }
  }

  private async checkChannelStatus(): Promise<Array<{ channel: string; healthy: boolean; error?: string; }>> {
    const config = this.config as SupportPluginConfig;
    const results = [];

    for (const [channel, settings] of Object.entries(config.channels)) {
      if (settings.enabled) {
        try {
          const status = await this.supportService.checkChannelStatus(channel);
          results.push({ channel, healthy: status.healthy });
        } catch (error) {
          results.push({
            channel,
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return results;
  }

  private async getActiveTicketsCount(): Promise<number> {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(supportTickets)
      .where(eq(supportTickets.status, 'open'));
    
    return result[0]?.count || 0;
  }

  private async getSlaBreachesCount(): Promise<number> {
    return await this.slaManager.getBreachesCount();
  }

  private async handleTicketCreated(context: any): Promise<void> {
    this.logger.info('📝 Ticket created:', context);
  }

  private async handleTicketUpdated(context: any): Promise<void> {
    this.logger.info('🔄 Ticket updated:', context);
  }

  private async handleTicketAssigned(context: any): Promise<void> {
    this.logger.info('👤 Ticket assigned:', context);
  }

  private async handleTicketResolved(context: any): Promise<void> {
    this.logger.info('✅ Ticket resolved:', context);
  }

  private async handleTicketReopened(context: any): Promise<void> {
    this.logger.info('🔄 Ticket reopened:', context);
  }

  private async handleSlaBreached(context: any): Promise<void> {
    this.logger.info('⚠️ SLA breached:', context);
  }

  private async handleAutomationTriggered(context: any): Promise<void> {
    this.logger.info('🤖 Automation triggered:', context);
  }

  private async handleKnowledgeArticleCreated(context: any): Promise<void> {
    this.logger.info('📚 Knowledge article created:', context);
  }

  private async handleKnowledgeArticleSuggested(context: any): Promise<void> {
    this.logger.info('💡 Knowledge article suggested:', context);
  }
} 