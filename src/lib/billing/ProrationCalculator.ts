/**
 * Proration calculation utilities for subscription changes
 */
export interface ProrationCalculation {
  creditAmount: number;
  chargeAmount: number;
  items: ProrationItem[];
}

export interface ProrationItem {
  description: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  isCredit: boolean;
}

export class ProrationCalculator {
  /**
   * Calculate proration for subscription upgrade/downgrade
   */
  static calculateProration(
    oldPlan: { price: number; interval: string },
    newPlan: { price: number; interval: string },
    changeDate: Date,
    currentPeriodStart: Date,
    currentPeriodEnd: Date
  ): ProrationCalculation {
    const items: ProrationItem[] = [];
    let creditAmount = 0;
    let chargeAmount = 0;

    // Calculate remaining time in current period
    const totalPeriodMs = currentPeriodEnd.getTime() - currentPeriodStart.getTime();
    const remainingMs = currentPeriodEnd.getTime() - changeDate.getTime();
    const remainingRatio = remainingMs / totalPeriodMs;

    // Credit for unused time on old plan
    if (remainingRatio > 0) {
      const creditForOldPlan = oldPlan.price * remainingRatio;
      creditAmount += creditForOldPlan;

      items.push({
        description: `Credit for unused time on ${oldPlan.interval} plan`,
        periodStart: changeDate,
        periodEnd: currentPeriodEnd,
        amount: creditForOldPlan,
        isCredit: true,
      });
    }

    // Charge for remaining time on new plan
    if (remainingRatio > 0) {
      const chargeForNewPlan = newPlan.price * remainingRatio;
      chargeAmount += chargeForNewPlan;

      items.push({
        description: `Charge for remaining time on ${newPlan.interval} plan`,
        periodStart: changeDate,
        periodEnd: currentPeriodEnd,
        amount: chargeForNewPlan,
        isCredit: false,
      });
    }

    return {
      creditAmount,
      chargeAmount,
      items,
    };
  }

  /**
   * Calculate proration for mid-cycle cancellation
   */
  static calculateCancellationProration(
    plan: { price: number; interval: string },
    cancellationDate: Date,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    refundPolicy: 'full' | 'prorated' | 'none' = 'prorated'
  ): ProrationCalculation {
    const items: ProrationItem[] = [];
    let creditAmount = 0;

    if (refundPolicy === 'none') {
      return { creditAmount: 0, chargeAmount: 0, items: [] };
    }

    const totalPeriodMs = currentPeriodEnd.getTime() - currentPeriodStart.getTime();
    const usedMs = cancellationDate.getTime() - currentPeriodStart.getTime();
    const remainingMs = currentPeriodEnd.getTime() - cancellationDate.getTime();

    if (refundPolicy === 'full') {
      creditAmount = plan.price;
      items.push({
        description: `Full refund for ${plan.interval} plan`,
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
        amount: plan.price,
        isCredit: true,
      });
    } else if (refundPolicy === 'prorated' && remainingMs > 0) {
      const remainingRatio = remainingMs / totalPeriodMs;
      creditAmount = plan.price * remainingRatio;

      items.push({
        description: `Prorated refund for unused time on ${plan.interval} plan`,
        periodStart: cancellationDate,
        periodEnd: currentPeriodEnd,
        amount: creditAmount,
        isCredit: true,
      });
    }

    return {
      creditAmount,
      chargeAmount: 0,
      items,
    };
  }

  /**
   * Calculate setup fees and trial periods
   */
  static calculateSetupAndTrial(
    plan: { price: number; setupFee?: number; trialPeriodDays?: number },
    startDate: Date
  ): { setupFee: number; trialEndDate: Date | null; firstBillingDate: Date } {
    const setupFee = plan.setupFee || 0;
    const trialDays = plan.trialPeriodDays || 0;

    let trialEndDate: Date | null = null;
    let firstBillingDate = new Date(startDate);

    if (trialDays > 0) {
      trialEndDate = new Date(startDate);
      trialEndDate.setDate(trialEndDate.getDate() + trialDays);
      firstBillingDate = new Date(trialEndDate);
    }

    return {
      setupFee,
      trialEndDate,
      firstBillingDate,
    };
  }

  /**
   * Calculate next billing date based on interval
   */
  static calculateNextBillingDate(currentDate: Date, interval: string): Date {
    const nextDate = new Date(currentDate);

    switch (interval.toUpperCase()) {
      case 'DAILY':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'WEEKLY':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'MONTHLY':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'YEARLY':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      default:
        throw new Error(`Unsupported billing interval: ${interval}`);
    }

    return nextDate;
  }

  /**
   * Format currency amount for display
   */
  static formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  }
}