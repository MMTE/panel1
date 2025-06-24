import { InvoiceData } from './InvoicePDFService.js';

/**
 * Invoice PDF Standards Compliance Module
 * Implements international invoice standards and best practices
 */
export class InvoicePDFStandards {
  
  /**
   * Validate invoice data against international standards
   */
  static validateInvoiceForPDF(invoice: InvoiceData): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields per international standards
    if (!invoice.invoiceNumber) errors.push('Invoice number is required');
    if (!invoice.dueDate) errors.push('Due date is required');
    if (!invoice.createdAt) errors.push('Invoice date is required');
    if (!invoice.total || parseFloat(invoice.total) <= 0) errors.push('Total amount must be greater than 0');
    
    // Client information requirements
    if (!invoice.client.user.email) errors.push('Client email is required');
    if (!invoice.client.companyName && !invoice.client.user.firstName && !invoice.client.user.lastName) {
      errors.push('Client name or company name is required');
    }

    // Business information requirements
    if (!invoice.tenant.name) errors.push('Business name is required');

    // Tax compliance warnings
    if (!invoice.tax || parseFloat(invoice.tax) === 0) {
      warnings.push('No tax amount specified - ensure tax compliance');
    }

    // Currency validation
    if (!invoice.currency || invoice.currency.length !== 3) {
      warnings.push('Currency should be ISO 4217 3-letter code');
    }

    // Line items validation
    if (!invoice.items || invoice.items.length === 0) {
      errors.push('At least one line item is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Format invoice according to regional standards
   */
  static formatForRegion(invoice: InvoiceData, region: 'US' | 'EU' | 'UK' | 'CA' | 'AU'): InvoiceData {
    switch (region) {
      case 'EU':
        return this.formatForEU(invoice);
      case 'UK':
        return this.formatForUK(invoice);
      case 'CA':
        return this.formatForCanada(invoice);
      case 'AU':
        return this.formatForAustralia(invoice);
      default:
        return this.formatForUS(invoice);
    }
  }

  /**
   * EU Invoice Standards (EN 16931)
   */
  private static formatForEU(invoice: InvoiceData): InvoiceData {
    // EU requires VAT number display if applicable
    // Date format: DD/MM/YYYY
    // Currency: EUR typically
    return {
      ...invoice,
      // Add EU-specific fields here
    };
  }

  /**
   * US Invoice Standards
   */
  private static formatForUS(invoice: InvoiceData): InvoiceData {
    // Date format: MM/DD/YYYY
    // Tax display: Sales tax
    return {
      ...invoice,
      // Add US-specific formatting
    };
  }

  /**
   * UK Invoice Standards
   */
  private static formatForUK(invoice: InvoiceData): InvoiceData {
    // Date format: DD/MM/YYYY
    // VAT requirements
    return {
      ...invoice,
      // Add UK-specific formatting
    };
  }

  /**
   * Canada Invoice Standards
   */
  private static formatForCanada(invoice: InvoiceData): InvoiceData {
    // GST/HST requirements
    // Bilingual support (EN/FR)
    return {
      ...invoice,
      // Add Canada-specific formatting
    };
  }

  /**
   * Australia Invoice Standards
   */
  private static formatForAustralia(invoice: InvoiceData): InvoiceData {
    // GST requirements
    // ABN display
    return {
      ...invoice,
      // Add Australia-specific formatting
    };
  }

  /**
   * Get required legal text for region
   */
  static getLegalText(region: string): {
    paymentTerms: string;
    lateFeesNotice: string;
    disputeProcess: string;
  } {
    const legalTexts = {
      US: {
        paymentTerms: 'Payment is due within the specified time period. Late payments may incur additional fees.',
        lateFeesNotice: 'A service charge of 1.5% per month may be added to overdue accounts.',
        disputeProcess: 'Questions about this invoice? Contact us within 30 days.'
      },
      EU: {
        paymentTerms: 'Payment terms as specified. Late payment may result in interest charges.',
        lateFeesNotice: 'Interest on overdue accounts may be charged as permitted by law.',
        disputeProcess: 'Disputes must be raised within 30 days of invoice date.'
      },
      UK: {
        paymentTerms: 'Payment due as specified. Late Payment of Commercial Debts regulations apply.',
        lateFeesNotice: 'Interest and compensation may be charged on overdue accounts.',
        disputeProcess: 'Invoice queries should be raised within 30 days.'
      }
    };

    return legalTexts[region as keyof typeof legalTexts] || legalTexts.US;
  }

  /**
   * Calculate payment terms based on region and business type
   */
  static getStandardPaymentTerms(region: string, businessType: 'B2B' | 'B2C'): number {
    const terms = {
      US: { B2B: 30, B2C: 15 },
      EU: { B2B: 30, B2C: 14 },
      UK: { B2B: 30, B2C: 14 },
      CA: { B2B: 30, B2C: 15 },
      AU: { B2B: 30, B2C: 14 }
    };

    return terms[region as keyof typeof terms]?.[businessType] || 30;
  }

  /**
   * Validate business tax ID format by region
   */
  static validateTaxId(taxId: string, region: string): boolean {
    const patterns = {
      US: /^\d{2}-\d{7}$/, // EIN format
      EU: /^[A-Z]{2}\d{8,12}$/, // EU VAT format
      UK: /^GB\d{9}(\d{3})?$/, // UK VAT format
      CA: /^\d{9}RT\d{4}$/, // GST/HST format
      AU: /^\d{11}$/ // ABN format
    };

    const pattern = patterns[region as keyof typeof patterns];
    return pattern ? pattern.test(taxId) : true;
  }
} 