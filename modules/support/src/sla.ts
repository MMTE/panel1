import type { ModuleContext } from '@panel1/types';
import {
  eq,
  and,
  or,
  isNull,
  isNotNull,
  sql,
  lte,
  gte,
  inArray,
  notInArray,
  lt,
  gt,
} from 'drizzle-orm';
import { supportSlaProfiles, supportTickets, ticketMessages } from './schema.js';
import type { SupportSlaProfile, SupportTicket } from './schema.js';

interface EscalationRule {
  afterMinutes: number;
  assignToId?: string;
  notifyUserIds?: string[];
  changePriority?: string;
}

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_STAFF'] as const;

function minutesSince(createdAt: Date | null): number {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
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
      .where(
        and(
          eq(supportSlaProfiles.tenantId, tenantId),
          eq(supportSlaProfiles.isDefault, true),
          eq(supportSlaProfiles.isActive, true),
        ),
      )
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
    dateRange?: { start: Date; end: Date },
  ): Promise<{
    firstResponseSlaRate: number;
    resolutionSlaRate: number;
    averageFirstResponseTime: number;
    averageResolutionTime: number;
    breachedTickets: number;
    atRiskTickets: number;
  }> {
    const start = dateRange?.start ?? new Date(0);
    const end = dateRange?.end ?? new Date();
    const cohort = and(
      eq(supportTickets.tenantId, tenantId),
      gte(supportTickets.createdAt, start),
      lte(supportTickets.createdAt, end),
    );

    const [frAnswered] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        and(cohort, isNotNull(supportTickets.firstResponseDue), isNotNull(supportTickets.firstResponseAt)),
      );

    const [frMet] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        and(
          cohort,
          isNotNull(supportTickets.firstResponseDue),
          isNotNull(supportTickets.firstResponseAt),
          lte(supportTickets.firstResponseAt, supportTickets.firstResponseDue),
        ),
      );

    const [resDone] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        and(cohort, isNotNull(supportTickets.resolutionDue), isNotNull(supportTickets.resolvedAt)),
      );

    const [resMet] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        and(
          cohort,
          isNotNull(supportTickets.resolutionDue),
          isNotNull(supportTickets.resolvedAt),
          lte(supportTickets.resolvedAt, supportTickets.resolutionDue),
        ),
      );

    const [avgFr] = await this.db
      .select({
        avg: sql<number>`coalesce(avg(extract(epoch from (${supportTickets.firstResponseAt} - ${supportTickets.createdAt})) / 60), 0)`,
      })
      .from(supportTickets)
      .where(and(cohort, isNotNull(supportTickets.firstResponseAt)));

    const [avgRes] = await this.db
      .select({
        avg: sql<number>`coalesce(avg(extract(epoch from (${supportTickets.resolvedAt} - ${supportTickets.createdAt})) / 60), 0)`,
      })
      .from(supportTickets)
      .where(and(cohort, isNotNull(supportTickets.resolvedAt)));

    const frN = Number(frAnswered?.c ?? 0);
    const resN = Number(resDone?.c ?? 0);
    const firstResponseSlaRate = frN > 0 ? Math.round((Number(frMet?.c ?? 0) / frN) * 1000) / 10 : 100;
    const resolutionSlaRate = resN > 0 ? Math.round((Number(resMet?.c ?? 0) / resN) * 1000) / 10 : 100;

    const ref = end;
    const [breachRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        and(
          cohort,
          or(
            and(
              isNotNull(supportTickets.firstResponseDue),
              isNull(supportTickets.firstResponseAt),
              lt(supportTickets.firstResponseDue, ref),
            ),
            and(
              isNotNull(supportTickets.firstResponseDue),
              isNotNull(supportTickets.firstResponseAt),
              sql`${supportTickets.firstResponseAt} > ${supportTickets.firstResponseDue}`,
            ),
            and(
              isNotNull(supportTickets.resolutionDue),
              isNull(supportTickets.resolvedAt),
              lt(supportTickets.resolutionDue, ref),
              inArray(supportTickets.status, [...OPEN_STATUSES]),
            ),
            and(
              isNotNull(supportTickets.resolutionDue),
              isNotNull(supportTickets.resolvedAt),
              sql`${supportTickets.resolvedAt} > ${supportTickets.resolutionDue}`,
            ),
          ),
        ),
      );

    const [atRiskRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.tenantId, tenantId),
          inArray(supportTickets.status, [...OPEN_STATUSES]),
          or(
            and(
              isNotNull(supportTickets.firstResponseDue),
              isNull(supportTickets.firstResponseAt),
              gt(supportTickets.firstResponseDue, sql`now()`),
              lte(supportTickets.firstResponseDue, sql`now() + interval '2 hours'`),
            ),
            and(
              isNotNull(supportTickets.resolutionDue),
              isNull(supportTickets.resolvedAt),
              gt(supportTickets.resolutionDue, sql`now()`),
              lte(supportTickets.resolutionDue, sql`now() + interval '2 hours'`),
            ),
          ),
        ),
      );

    return {
      firstResponseSlaRate,
      resolutionSlaRate,
      averageFirstResponseTime: Math.round(Number(avgFr?.avg ?? 0)),
      averageResolutionTime: Math.round(Number(avgRes?.avg ?? 0)),
      breachedTickets: Number(breachRow?.c ?? 0),
      atRiskTickets: Number(atRiskRow?.c ?? 0),
    };
  }

  async getTicketsAtRisk(tenantId: string): Promise<SupportTicket[]> {
    return await this.db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.tenantId, tenantId), isNull(supportTickets.resolvedAt)));
  }

  /** Distinct tenants that have support data (for cron). */
  async listSupportTenantIds(): Promise<string[]> {
    const rows = await this.db
      .select({ tenantId: supportTickets.tenantId })
      .from(supportTickets)
      .groupBy(supportTickets.tenantId);
    return rows.map((r: { tenantId: string }) => r.tenantId);
  }

  /**
   * Overdue tickets, SLA profile escalation rules, and `support.sla.breached` / `support.ticket.escalated` emits.
   */
  async processEscalations(tenantId: string): Promise<void> {
    const candidates = await this.db
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.tenantId, tenantId),
          notInArray(supportTickets.status, ['RESOLVED', 'CLOSED']),
          or(
            and(
              isNotNull(supportTickets.firstResponseDue),
              isNull(supportTickets.firstResponseAt),
              sql`${supportTickets.firstResponseDue} < NOW()`,
            ),
            and(
              isNotNull(supportTickets.resolutionDue),
              isNull(supportTickets.resolvedAt),
              sql`${supportTickets.resolutionDue} < NOW()`,
            ),
          ),
        ),
      );

    for (const ticket of candidates) {
      await this.processTicketSlaPass(ticket, tenantId);
    }
  }

  private async processTicketSlaPass(ticket: SupportTicket, tenantId: string): Promise<void> {
    const frOverdue =
      ticket.firstResponseDue &&
      !ticket.firstResponseAt &&
      new Date(ticket.firstResponseDue) < new Date();
    const resOverdue =
      ticket.resolutionDue &&
      !ticket.resolvedAt &&
      new Date(ticket.resolutionDue) < new Date();

    if (!frOverdue && !resOverdue) return;

    const profile = await this.getSlaProfileForTicket(
      { categoryId: ticket.categoryId ?? undefined, priority: ticket.priority ?? undefined },
      tenantId,
    );
    const rules = (profile?.escalationRules as EscalationRule[] | null)?.filter(Boolean) ?? [];
    const cf = { ...(ticket.customFields || {}) } as Record<string, unknown>;
    const emitted = { ...(cf._slaBreachesEmitted as { first_response?: boolean; resolution?: boolean } | undefined) };
    let maxApplied = typeof cf._slaMaxRuleApplied === 'number' ? cf._slaMaxRuleApplied : -1;

    if (frOverdue && !emitted.first_response) {
      await this.ctx.emit('support.sla.breached', {
        ticketId: ticket.id,
        tenantId,
        breachType: 'first_response',
      });
      emitted.first_response = true;
    }
    if (resOverdue && !emitted.resolution) {
      await this.ctx.emit('support.sla.breached', {
        ticketId: ticket.id,
        tenantId,
        breachType: 'resolution',
      });
      emitted.resolution = true;
    }

    const elapsed = minutesSince(ticket.createdAt);
    let escalationLevel = ticket.escalationLevel ?? 0;

    for (let i = 0; i < rules.length; i++) {
      if (i <= maxApplied) continue;
      const rule = rules[i];
      if (elapsed < rule.afterMinutes) break;

      escalationLevel += 1;
      const updates: Record<string, unknown> = {
        lastActivityAt: new Date(),
        updatedAt: new Date(),
        escalationLevel,
      };

      if (rule.assignToId) {
        updates.assignedToId = rule.assignToId;
        updates.assignedAt = new Date();
      }
      if (rule.changePriority) {
        updates.priority = rule.changePriority;
      }

      await this.db
        .update(supportTickets)
        .set(updates as any)
        .where(and(eq(supportTickets.id, ticket.id), eq(supportTickets.tenantId, tenantId)));

      await this.db.insert(ticketMessages).values({
        ticketId: ticket.id,
        content: `SLA escalation rule ${i + 1} applied (after ${rule.afterMinutes} minutes).`,
        messageType: 'SYSTEM_MESSAGE',
        isInternal: true,
        tenantId,
      });

      await this.ctx.emit('support.ticket.escalated', {
        ticketId: ticket.id,
        level: escalationLevel,
        reason: `sla_rule_${i + 1}`,
      });

      if (rule.notifyUserIds?.length) {
        this.ctx.logger.info('SLA rule notifyUserIds (no-op until notifications wired)', {
          ticketId: ticket.id,
          userIds: rule.notifyUserIds,
        });
      }

      maxApplied = i;
    }

    cf._slaBreachesEmitted = emitted;
    cf._slaMaxRuleApplied = maxApplied;

    await this.db
      .update(supportTickets)
      .set({
        customFields: cf as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(and(eq(supportTickets.id, ticket.id), eq(supportTickets.tenantId, tenantId)));
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
