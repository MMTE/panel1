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
   * Calculate SLA due dates for a ticket, respecting business hours
   */
  calculateSlaDueDates(
    createdAt: Date,
    slaProfile: SupportSlaProfile
  ): {
    firstResponseDue: Date;
    resolutionDue: Date;
  } {
    const businessHours = slaProfile.businessHours;
    
    // Calculate due dates respecting business hours
    const firstResponseDue = this.addBusinessMinutes(createdAt, slaProfile.firstResponseTime, businessHours);
    const resolutionDue = this.addBusinessMinutes(createdAt, slaProfile.resolutionTime, businessHours);

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
    const tz = businessHours.timezone || 'UTC';
    let currentDate = new Date(startDate);
    let remainingMinutes = minutes;

    while (remainingMinutes > 0) {
      // If current time is outside business hours, move to next business hour start
      if (!this.isWithinBusinessHours(currentDate, businessHours)) {
        currentDate = this.getNextBusinessHourStart(currentDate, businessHours);
        continue;
      }

      // Get end of current business day
      const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'lowercase', timeZone: tz });
      const dayHours = businessHours[dayOfWeek as keyof typeof businessHours] as { start: string; end: string; enabled: boolean };
      
      if (!dayHours.enabled) {
        // Move to next day if current day is disabled
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);
        continue;
      }

      const [endHour, endMinute] = dayHours.end.split(':').map(Number);
      const endOfBusinessDay = new Date(currentDate);
      endOfBusinessDay.setHours(endHour, endMinute, 0, 0);

      // Calculate minutes until end of business day
      const minutesUntilEndOfDay = Math.floor((endOfBusinessDay.getTime() - currentDate.getTime()) / 60000);

      if (minutesUntilEndOfDay >= remainingMinutes) {
        // We can add all remaining minutes
        currentDate = new Date(currentDate.getTime() + remainingMinutes * 60000);
        remainingMinutes = 0;
      } else {
        // Add minutes until end of day and continue to next day
        currentDate = new Date(endOfBusinessDay);
        remainingMinutes -= minutesUntilEndOfDay;
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);
      }
    }

    return currentDate;
  }

  private isWithinBusinessHours(date: Date, businessHours: BusinessHours): boolean {
    const tz = businessHours.timezone || 'UTC';
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'lowercase', timeZone: tz });
    const dayHours = businessHours[dayOfWeek as keyof typeof businessHours] as { start: string; end: string; enabled: boolean };

    if (!dayHours.enabled) return false;

    const [startHour, startMinute] = dayHours.start.split(':').map(Number);
    const [endHour, endMinute] = dayHours.end.split(':').map(Number);

    const businessStart = new Date(date);
    businessStart.setHours(startHour, startMinute, 0, 0);

    const businessEnd = new Date(date);
    businessEnd.setHours(endHour, endMinute, 0, 0);

    return date >= businessStart && date <= businessEnd;
  }

  private getNextBusinessHourStart(date: Date, businessHours: BusinessHours): Date {
    const tz = businessHours.timezone || 'UTC';
    let currentDate = new Date(date);
    
    // Try next 7 days (to avoid infinite loop in case all days are disabled)
    for (let i = 0; i < 7; i++) {
      const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'lowercase', timeZone: tz });
      const dayHours = businessHours[dayOfWeek as keyof typeof businessHours] as { start: string; end: string; enabled: boolean };

      if (dayHours.enabled) {
        const [startHour, startMinute] = dayHours.start.split(':').map(Number);
        const businessStart = new Date(currentDate);
        businessStart.setHours(startHour, startMinute, 0, 0);

        if (currentDate < businessStart) {
          return businessStart;
        }

        const [endHour, endMinute] = dayHours.end.split(':').map(Number);
        const businessEnd = new Date(currentDate);
        businessEnd.setHours(endHour, endMinute, 0, 0);

        if (currentDate <= businessEnd) {
          return currentDate;
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }

    throw new Error('No business hours found in the next 7 days');
  }
} 