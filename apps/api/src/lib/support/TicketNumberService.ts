import { db } from '../../db';
import { eq, and } from 'drizzle-orm';

// We'll use the existing invoice_counters table with a different prefix
// This maintains consistency with the existing numbering system
interface TicketNumberConfig {
  prefix?: string;
  suffix?: string;
  yearInNumber?: boolean;
  padLength?: number;
}

export class TicketNumberService {
  /**
   * Generate the next ticket number for a tenant
   */
  static async generateTicketNumber(
    tenantId: string,
    config: TicketNumberConfig = {}
  ): Promise<string> {
    const currentYear = new Date().getFullYear();
    const {
      prefix = 'TKT',
      suffix = '',
      yearInNumber = true,
      padLength = 6
    } = config;

    // Import the invoice counters table for reuse
    const { invoiceCounters } = await import('../../db/schema');

    // Use database transaction to ensure atomic increment
    return await db.transaction(async (tx) => {
      // Get or create counter for this tenant and year with ticket prefix
      let counter = await tx
        .select()
        .from(invoiceCounters)
        .where(
          and(
            eq(invoiceCounters.tenantId, tenantId),
            eq(invoiceCounters.year, currentYear),
            eq(invoiceCounters.prefix, prefix)
          )
        )
        .limit(1);

      if (counter.length === 0) {
        // Create new counter for this tenant/year/prefix combination
        const [newCounter] = await tx
          .insert(invoiceCounters)
          .values({
            tenantId,
            year: currentYear,
            lastNumber: 1,
            prefix,
            suffix,
          })
          .returning();
        
        counter = [newCounter];
      } else {
        // Increment existing counter
        const [updatedCounter] = await tx
          .update(invoiceCounters)
          .set({
            lastNumber: counter[0].lastNumber + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(invoiceCounters.tenantId, tenantId),
              eq(invoiceCounters.year, currentYear),
              eq(invoiceCounters.prefix, prefix)
            )
          )
          .returning();
        
        counter = [updatedCounter];
      }

      // Format the ticket number
      const number = counter[0].lastNumber;
      const paddedNumber = number.toString().padStart(padLength, '0');
      
      let ticketNumber = prefix;
      
      if (yearInNumber) {
        ticketNumber += `-${currentYear}`;
      }
      
      ticketNumber += `-${paddedNumber}`;
      
      if (suffix) {
        ticketNumber += `-${suffix}`;
      }

      return ticketNumber;
    });
  }

  /**
   * Validate ticket number format
   */
  static validateTicketNumber(ticketNumber: string): boolean {
    // Basic validation for TKT-YYYY-NNNNNN format
    const ticketRegex = /^[A-Z]{2,4}-\d{4}-\d{6}(-[A-Z0-9]+)?$/;
    return ticketRegex.test(ticketNumber);
  }

  /**
   * Parse ticket number components
   */
  static parseTicketNumber(ticketNumber: string): {
    prefix: string;
    year: number;
    number: number;
    suffix?: string;
  } | null {
    const parts = ticketNumber.split('-');
    
    if (parts.length < 3) {
      return null;
    }

    const prefix = parts[0];
    const year = parseInt(parts[1]);
    const number = parseInt(parts[2]);
    const suffix = parts.length > 3 ? parts.slice(3).join('-') : undefined;

    if (isNaN(year) || isNaN(number)) {
      return null;
    }

    return { prefix, year, number, suffix };
  }
} 