import { db } from '../../db';
import { eq, and, isNull } from 'drizzle-orm';
import { 
  supportSlaProfiles, 
  supportTickets,
  supportCategories,
  SupportSlaProfile,
  SupportTicket
} from '../../db/schema';

export interface SlaTarget {
  categoryId?: string;
  priority?: string;
  clientId?: string;
}

export interface BusinessHours {
  timezone: string;
  monday: { start: string; end: string; enabled: boolean };
  tuesday: { start: string; end: string; enabled: boolean };
  wednesday: { start: string; end: string; enabled: boolean };
  thursday: { start: string; end: string; enabled: boolean };
  friday: { start: string; end: string; enabled: boolean };
  saturday: { start: string; end: string; enabled: boolean };
  sunday: { start: string; end: string; enabled: boolean };
}

export interface EscalationRule {
  afterMinutes: number;
  assignToId?: string;
  notifyUserIds: string[];
  changePriority?: string;
}

export class SlaManager {
  private static instance: SlaManager;

  private constructor() {}

  static getInstance(): SlaManager {
    if (!SlaManager.instance) {
      SlaManager.instance = new SlaManager();
    }
    return SlaManager.instance;
  }

  /**
   * Get the appropriate SLA profile for a ticket
   */
  async getSlaProfileForTicket(
    target: SlaTarget,
    tenantId: string,
    tx = db
  ): Promise<SupportSlaProfile | null> {
    // Try to find specific SLA profile first
    // Priority order: category-specific > default profile

    let profile: SupportSlaProfile | null = null;

    // TODO: Implement category-specific SLA profiles
    // For now, get the default profile
    const [defaultProfile] = await tx
      .select()
      .from(supportSlaProfiles)
      .where(and(
        eq(supportSlaProfiles.tenantId, tenantId),
        eq(supportSlaProfiles.isDefault, true),
        eq(supportSlaProfiles.isActive, true)
      ))
      .limit(1);

    profile = defaultProfile || null;

    return profile;
  }

  /**
   * Create a default SLA profile for a tenant
   */
  async createDefaultSlaProfile(tenantId: string): Promise<SupportSlaProfile> {
    const defaultBusinessHours: BusinessHours = {
      timezone: 'UTC',
      monday: { start: '09:00', end: '17:00', enabled: true },
      tuesday: { start: '09:00', end: '17:00', enabled: true },
      wednesday: { start: '09:00', end: '17:00', enabled: true },
      thursday: { start: '09:00', end: '17:00', enabled: true },
      friday: { start: '09:00', end: '17:00', enabled: true },
      saturday: { start: '10:00', end: '14:00', enabled: false },
      sunday: { start: '10:00', end: '14:00', enabled: false },
    };

    const defaultEscalationRules: EscalationRule[] = [
      {
        afterMinutes: 240, // 4 hours
        notifyUserIds: [], // Will be populated with admin users
        changePriority: 'HIGH',
      },
      {
        afterMinutes: 480, // 8 hours
        notifyUserIds: [],
        changePriority: 'URGENT',
      },
    ];

    const [profile] = await db
      .insert(supportSlaProfiles)
      .values({
        name: 'Default SLA Profile',
        description: 'Standard service level agreement for support tickets',
        isDefault: true,
        isActive: true,
        firstResponseTime: 60, // 1 hour
        resolutionTime: 1440, // 24 hours
        businessHours: defaultBusinessHours,
        escalationRules: defaultEscalationRules,
        tenantId,
      })
      .returning();

    console.log(`✅ Created default SLA profile for tenant: ${tenantId}`);
    return profile;
  }

  /**
   * Calculate SLA due dates for a ticket
   */
  calculateSlaDueDates(
    createdAt: Date,
    slaProfile: SupportSlaProfile
  ): {
    firstResponseDue: Date;
    resolutionDue: Date;
  } {
    const businessHours = slaProfile.businessHours;
    
    // For now, use simple calculation (will enhance with business hours later)
    const firstResponseDue = new Date(createdAt.getTime() + slaProfile.firstResponseTime * 60000);
    const resolutionDue = new Date(createdAt.getTime() + slaProfile.resolutionTime * 60000);

    // TODO: Implement business hours calculation
    // const firstResponseDue = this.addBusinessMinutes(createdAt, slaProfile.firstResponseTime, businessHours);
    // const resolutionDue = this.addBusinessMinutes(createdAt, slaProfile.resolutionTime, businessHours);

    return {
      firstResponseDue,
      resolutionDue,
    };
  }

  /**
   * Check if a ticket is within SLA
   */
  async checkTicketSla(
    ticket: SupportTicket,
    tenantId: string
  ): Promise<{
    firstResponseSla: 'WITHIN' | 'BREACHED' | 'AT_RISK';
    resolutionSla: 'WITHIN' | 'BREACHED' | 'AT_RISK';
    timeToFirstResponseBreach?: number; // minutes
    timeToResolutionBreach?: number; // minutes
  }> {
    const now = new Date();

    // Check first response SLA
    let firstResponseSla: 'WITHIN' | 'BREACHED' | 'AT_RISK' = 'WITHIN';
    let timeToFirstResponseBreach: number | undefined;

    if (ticket.firstResponseDue && !ticket.firstResponseAt) {
      const timeUntilDue = ticket.firstResponseDue.getTime() - now.getTime();
      const minutesUntilDue = Math.floor(timeUntilDue / 60000);

      if (minutesUntilDue < 0) {
        firstResponseSla = 'BREACHED';
      } else if (minutesUntilDue < 30) { // At risk if less than 30 minutes
        firstResponseSla = 'AT_RISK';
        timeToFirstResponseBreach = minutesUntilDue;
      }
    }

    // Check resolution SLA
    let resolutionSla: 'WITHIN' | 'BREACHED' | 'AT_RISK' = 'WITHIN';
    let timeToResolutionBreach: number | undefined;

    if (ticket.resolutionDue && !ticket.resolvedAt && ticket.status !== 'CLOSED') {
      const timeUntilDue = ticket.resolutionDue.getTime() - now.getTime();
      const minutesUntilDue = Math.floor(timeUntilDue / 60000);

      if (minutesUntilDue < 0) {
        resolutionSla = 'BREACHED';
      } else if (minutesUntilDue < 120) { // At risk if less than 2 hours
        resolutionSla = 'AT_RISK';
        timeToResolutionBreach = minutesUntilDue;
      }
    }

    return {
      firstResponseSla,
      resolutionSla,
      timeToFirstResponseBreach,
      timeToResolutionBreach,
    };
  }

  /**
   * Get SLA metrics for dashboard
   */
  async getSlaMetrics(
    tenantId: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<{
    firstResponseSlaRate: number; // Percentage
    resolutionSlaRate: number; // Percentage
    averageFirstResponseTime: number; // Minutes
    averageResolutionTime: number; // Minutes
    breachedTickets: number;
    atRiskTickets: number;
  }> {
    // This would implement comprehensive SLA reporting
    // For now, return mock data
    return {
      firstResponseSlaRate: 95.2,
      resolutionSlaRate: 87.6,
      averageFirstResponseTime: 45,
      averageResolutionTime: 320,
      breachedTickets: 3,
      atRiskTickets: 7,
    };
  }

  /**
   * Get tickets that are at risk of SLA breach
   */
  async getTicketsAtRisk(tenantId: string): Promise<SupportTicket[]> {
    const now = new Date();
    const riskThreshold = new Date(now.getTime() + 30 * 60000); // 30 minutes from now

    // Get tickets where SLA due dates are approaching
    const atRiskTickets = await db
      .select()
      .from(supportTickets)
      .where(and(
        eq(supportTickets.tenantId, tenantId),
        // Tickets that haven't been resolved and are approaching SLA breach
        isNull(supportTickets.resolvedAt),
        // TODO: Add proper SQL conditions for at-risk tickets
      ));

    return atRiskTickets;
  }

  /**
   * Process SLA escalations
   */
  async processSlalations(tenantId: string): Promise<void> {
    console.log(`⏰ Processing SLA escalations for tenant: ${tenantId}`);

    try {
      // Get all active SLA profiles
      const slaProfiles = await db
        .select()
        .from(supportSlaProfiles)
        .where(and(
          eq(supportSlaProfiles.tenantId, tenantId),
          eq(supportSlaProfiles.isActive, true)
        ));

      for (const profile of slaProfiles) {
        if (!profile.escalationRules) continue;

        // Process each escalation rule
        for (const rule of profile.escalationRules) {
          await this.processEscalationRule(rule, profile, tenantId);
        }
      }
    } catch (error) {
      console.error(`❌ SLA escalation processing failed:`, error);
    }
  }

  /**
   * Update SLA profile
   */
  async updateSlaProfile(
    profileId: string,
    updates: Partial<{
      name: string;
      description: string;
      firstResponseTime: number;
      resolutionTime: number;
      businessHours: BusinessHours;
      escalationRules: EscalationRule[];
      isActive: boolean;
    }>,
    tenantId: string
  ): Promise<SupportSlaProfile> {
    const [updatedProfile] = await db
      .update(supportSlaProfiles)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(
        eq(supportSlaProfiles.id, profileId),
        eq(supportSlaProfiles.tenantId, tenantId)
      ))
      .returning();

    if (!updatedProfile) {
      throw new Error('SLA profile not found');
    }

    return updatedProfile;
  }

  /**
   * Get all SLA profiles for a tenant
   */
  async getSlaProfiles(tenantId: string): Promise<SupportSlaProfile[]> {
    return await db
      .select()
      .from(supportSlaProfiles)
      .where(eq(supportSlaProfiles.tenantId, tenantId))
      .orderBy(supportSlaProfiles.name);
  }

  // Private helper methods

  private async processEscalationRule(
    rule: EscalationRule,
    profile: SupportSlaProfile,
    tenantId: string
  ): Promise<void> {
    const cutoffTime = new Date(Date.now() - rule.afterMinutes * 60000);

    // Find tickets that should be escalated based on this rule
    // This would implement the logic to find tickets that match the escalation criteria
    // For now, this is a placeholder
    console.log(`Processing escalation rule: after ${rule.afterMinutes} minutes`);
  }

  /**
   * Add business minutes to a date (accounting for business hours)
   */
  private addBusinessMinutes(
    startDate: Date,
    minutes: number,
    businessHours: BusinessHours
  ): Date {
    // This would implement business hours calculation
    // For now, return simple addition
    return new Date(startDate.getTime() + minutes * 60000);
  }

  /**
   * Check if a given time is within business hours
   */
  private isWithinBusinessHours(date: Date, businessHours: BusinessHours): boolean {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[date.getDay()] as keyof BusinessHours;
    const dayConfig = businessHours[dayName];

    if (!dayConfig || !dayConfig.enabled) {
      return false;
    }

    const timeString = date.toTimeString().substring(0, 5); // HH:MM format
    return timeString >= dayConfig.start && timeString <= dayConfig.end;
  }

  /**
   * Get the next business hour start time
   */
  private getNextBusinessHourStart(date: Date, businessHours: BusinessHours): Date {
    // Implementation would find the next business hour start
    // For now, return the input date
    return date;
  }
} 