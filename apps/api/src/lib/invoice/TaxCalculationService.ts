import { db } from '../../db';
import { tenants } from '../../db/schema';
import { eq } from 'drizzle-orm';

interface TaxRate {
  rate: number;
  type: 'VAT' | 'GST' | 'SALES_TAX';
  description: string;
}

interface TaxCalculationResult {
  amount: number;
  rate: number;
  type: string;
  description: string;
}

export class TaxCalculationService {
  /**
   * Calculate tax for a given amount based on tenant settings
   */
  static async calculateTax(
    amount: number,
    tenantId: string,
    options: {
      isB2B?: boolean;
      countryCode?: string;
      stateCode?: string;
    } = {}
  ): Promise<TaxCalculationResult> {
    try {
      // Get tenant settings
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Get tax settings from tenant metadata
      const taxSettings = tenant.metadata?.taxSettings || {
        enabled: false,
        rate: 0,
        type: 'SALES_TAX'
      };

      if (!taxSettings.enabled) {
        return {
          amount: 0,
          rate: 0,
          type: 'NONE',
          description: 'Tax not enabled'
        };
      }

      // Get tax rate based on location and business type
      const taxRate = this.getTaxRate(
        taxSettings,
        options.countryCode || tenant.metadata?.countryCode,
        options.stateCode,
        options.isB2B
      );

      // Calculate tax amount
      const taxAmount = (amount * taxRate.rate) / 100;

      return {
        amount: Math.round(taxAmount * 100) / 100, // Round to 2 decimal places
        rate: taxRate.rate,
        type: taxRate.type,
        description: taxRate.description
      };
    } catch (error) {
      console.error('Tax calculation failed:', error);
      // Default to no tax on error
      return {
        amount: 0,
        rate: 0,
        type: 'ERROR',
        description: 'Tax calculation failed'
      };
    }
  }

  /**
   * Get appropriate tax rate based on location and business type
   */
  private static getTaxRate(
    taxSettings: any,
    countryCode?: string,
    stateCode?: string,
    isB2B: boolean = false
  ): TaxRate {
    // Use tenant's default rate if no specific rules match
    const defaultRate: TaxRate = {
      rate: taxSettings.rate || 0,
      type: taxSettings.type || 'SALES_TAX',
      description: 'Default tax rate'
    };

    if (!countryCode) {
      return defaultRate;
    }

    // EU VAT rules
    if (this.isEUCountry(countryCode)) {
      if (isB2B) {
        return {
          rate: 0,
          type: 'VAT',
          description: 'Reverse-charged EU VAT (B2B)'
        };
      }
      return {
        rate: this.getEUVATRate(countryCode),
        type: 'VAT',
        description: `EU VAT (${countryCode})`
      };
    }

    // US Sales Tax
    if (countryCode === 'US' && stateCode) {
      return {
        rate: this.getUSSalesTaxRate(stateCode),
        type: 'SALES_TAX',
        description: `US Sales Tax (${stateCode})`
      };
    }

    // Australia GST
    if (countryCode === 'AU') {
      return {
        rate: 10,
        type: 'GST',
        description: 'Australia GST'
      };
    }

    return defaultRate;
  }

  private static isEUCountry(countryCode: string): boolean {
    const euCountries = [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
      'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
      'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
    ];
    return euCountries.includes(countryCode);
  }

  private static getEUVATRate(countryCode: string): number {
    const vatRates: Record<string, number> = {
      'DE': 19,
      'FR': 20,
      'IT': 22,
      'ES': 21,
      'NL': 21,
      // Add more EU VAT rates as needed
    };
    return vatRates[countryCode] || 20; // Default to 20% if country not found
  }

  private static getUSSalesTaxRate(stateCode: string): number {
    const salesTaxRates: Record<string, number> = {
      'CA': 7.25,
      'NY': 4,
      'TX': 6.25,
      // Add more state tax rates as needed
    };
    return salesTaxRates[stateCode] || 0;
  }
} 