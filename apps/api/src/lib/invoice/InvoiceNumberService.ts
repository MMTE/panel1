import { db, invoiceCounters } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';

export interface InvoiceNumberConfig {
  prefix?: string;
  suffix?: string;
  yearInNumber?: boolean;
  padLength?: number;
}

export class InvoiceNumberService {
  /**
   * Generate the next invoice number for a tenant
   */
  static async generateInvoiceNumber(
    tenantId: string,
    config: InvoiceNumberConfig = {}
  ): Promise<string> {
    const currentYear = new Date().getFullYear();
    const {
      prefix = 'INV',
      suffix = '',
      yearInNumber = true,
      padLength = 6
    } = config;

    // Use database transaction to ensure atomic increment
    return await db.transaction(async (tx) => {
      // Get or create counter for this tenant and year
      let counter = await tx
        .select()
        .from(invoiceCounters)
        .where(
          and(
            eq(invoiceCounters.tenantId, tenantId),
            eq(invoiceCounters.year, currentYear)
          )
        )
        .limit(1);

      if (counter.length === 0) {
        // Create new counter for this tenant/year
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
              eq(invoiceCounters.year, currentYear)
            )
          )
          .returning();
        
        counter = [updatedCounter];
      }

      // Format the invoice number
      const number = counter[0].lastNumber;
      const paddedNumber = number.toString().padStart(padLength, '0');
      
      let invoiceNumber = prefix;
      
      if (yearInNumber) {
        invoiceNumber += `-${currentYear}`;
      }
      
      invoiceNumber += `-${paddedNumber}`;
      
      if (suffix) {
        invoiceNumber += `-${suffix}`;
      }

      return invoiceNumber;
    });
  }

  /**
   * Get current counter for a tenant and year
   */
  static async getCurrentCounter(tenantId: string, year?: number): Promise<number> {
    const targetYear = year || new Date().getFullYear();
    
    const counter = await db
      .select()
      .from(invoiceCounters)
      .where(
        and(
          eq(invoiceCounters.tenantId, tenantId),
          eq(invoiceCounters.year, targetYear)
        )
      )
      .limit(1);

    return counter.length > 0 ? counter[0].lastNumber : 0;
  }

  /**
   * Update invoice number configuration for a tenant
   */
  static async updateConfig(
    tenantId: string,
    config: InvoiceNumberConfig
  ): Promise<void> {
    const currentYear = new Date().getFullYear();
    
    await db
      .update(invoiceCounters)
      .set({
        prefix: config.prefix || 'INV',
        suffix: config.suffix || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoiceCounters.tenantId, tenantId),
          eq(invoiceCounters.year, currentYear)
        )
      );
  }

  /**
   * Validate invoice number format
   */
  static validateInvoiceNumber(invoiceNumber: string): boolean {
    // Basic validation - should contain at least prefix and number
    const pattern = /^[A-Z]{2,}-\d{4}-\d{4,}(-.*)?$/;
    return pattern.test(invoiceNumber);
  }
} 