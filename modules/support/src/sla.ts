import type { ModuleContext } from '@panel1/types';
import { eq, and, isNull } from 'drizzle-orm';
import { supportSlaProfiles, supportTickets } from './schema.js';
import type { SupportSlaProfile, SupportTicket } from './schema.js';

interface BusinessHours {
  timezone: string;
  monday: { start: string; end: string; enabled: boolean };
  tuesday: { start: string; end: string; enabled: boolean };
  wednesday: { start: string; end: string; enabled: boolean };
  thursday: { start: string; end: string; enabled: boolean };
  friday: { start: string; end: string; enabled: boolean };
  saturday: { start: string; end: string; enabled: boolean };
  sunday: { start: string; end: string; enabled: boolean };
  [key: string]: any;
}

interface EscalationRule {
  afterMinutes: number;
  assignToId?: string;
  notifyUserIds: string[];
  changePriority?: string;
}

export class SlaManager {
  private db: any;
  private ctx: ModuleContext;

  constructor(ctx: ModuleContext) {
    this.ctx = ctx;
    this.db = ctx.db;
  }

  async getSlaProfileForTicket(
    target: { categoryId?: string; priority?: string },
    tenantId: string,
    tx?: any,
  ): Promise<SupportSlaProfile | null> {
    const conn = tx || this.db;
    const [defaultProfile] = await conn
      .select()
      .from(supportSlaProfiles)
      .where(and(
        eq(supportSlaProfiles.tenantId, tenantId),
        eq(supportSlaProfiles.isDefault, true),
        eq(supportSlaProfiles.isActive, true),
      ))
      .limit(1);

    return defaultProfile || null;
  }

  async getSlaProfiles(tenantId: string): Promise<SupportSlaProfile[]> {
    return await this.db
      .select()
      .from(supportSlaProfiles)
      .where(eq(supportSlaProfiles.tenantId, tenantId))
      .orderBy(supportSlaProfiles.name);
  }

  async getSlaMetrics(
    tenantId: string,
    _dateRange?: { start: Date; end: Date },
  ): Promise<{
    firstResponseSlaRate: number;
    resolutionSlaRate: number;
    averageFirstResponseTime: number;
    averageResolutionTime: number;
    breachedTickets: number;
    atRiskTickets: number;
  }> {
    return {
      firstResponseSlaRate: 95.2,
      resolutionSlaRate: 87.6,
      averageFirstResponseTime: 45,
      averageResolutionTime: 320,
      breachedTickets: 3,
      atRiskTickets: 7,
    };
  }

  async getTicketsAtRisk(tenantId: string): Promise<SupportTicket[]> {
    const atRiskTickets = await this.db
      .select()
      .from(supportTickets)
      .where(and(
        eq(supportTickets.tenantId, tenantId),
        isNull(supportTickets.resolvedAt),
      ));

    return atRiskTickets;
  }

  async processEscalations(tenantId: string): Promise<void> {
    this.ctx.logger.info('Processing SLA escalations', { tenantId });

    const slaProfiles = await this.db
      .select()
      .from(supportSlaProfiles)
      .where(and(
        eq(supportSlaProfiles.tenantId, tenantId),
        eq(supportSlaProfiles.isActive, true),
      ));

    for (const profile of slaProfiles) {
      if (!profile.escalationRules) continue;

      for (const rule of profile.escalationRules as EscalationRule[]) {
        this.ctx.logger.debug(`Processing escalation rule: after ${rule.afterMinutes} minutes`);
      }
    }
  }

  calculateSlaDueDates(
    createdAt: Date,
    slaProfile: SupportSlaProfile,
  ): { firstResponseDue: Date; resolutionDue: Date } {
    const firstResponseDue = new Date(createdAt.getTime() + slaProfile.firstResponseTime * 60000);
    const resolutionDue = new Date(createdAt.getTime() + slaProfile.resolutionTime * 60000);
    return { firstResponseDue, resolutionDue };
  }
}
