import { db } from '../../db';
import { paymentGatewayConfigs, NewPaymentGatewayConfig, PaymentGatewayConfig } from '../../db/schema';
import { encryptionService } from '../security/EncryptionService';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export class PaymentGatewayService {
  private static instance: PaymentGatewayService;

  private constructor() {}

  static getInstance(): PaymentGatewayService {
    if (!PaymentGatewayService.instance) {
      PaymentGatewayService.instance = new PaymentGatewayService();
    }
    return PaymentGatewayService.instance;
  }

  private decryptConfig(gateway: PaymentGatewayConfig): PaymentGatewayConfig {
    if (gateway.config && typeof gateway.config === 'string' && encryptionService.isEncrypted(gateway.config)) {
      try {
        const decryptedConfig = encryptionService.decrypt(gateway.config);
        return { ...gateway, config: JSON.parse(decryptedConfig) };
      } catch (error) {
        console.error(`Failed to decrypt config for gateway ${gateway.id}`, error);
        // Return with a marker that decryption failed
        return { ...gateway, config: { error: 'Decryption failed' } };
      }
    }
    return gateway;
  }
  
  async getGateway(id: string, tenantId: string): Promise<PaymentGatewayConfig | null> {
    const gateway = await db.query.paymentGatewayConfigs.findFirst({
      where: and(eq(paymentGatewayConfigs.id, id), eq(paymentGatewayConfigs.tenantId, tenantId))
    });

    if (!gateway) {
      return null;
    }
    
    return this.decryptConfig(gateway);
  }
  
  async getGateways(tenantId: string): Promise<PaymentGatewayConfig[]> {
    const gateways = await db.query.paymentGatewayConfigs.findMany({
        where: eq(paymentGatewayConfigs.tenantId, tenantId)
    });
    
    return gateways.map(g => this.decryptConfig(g));
  }
  
  async createGateway(
    data: Omit<NewPaymentGatewayConfig, 'tenantId' | 'config'> & { config: object },
    tenantId: string
  ): Promise<PaymentGatewayConfig> {
    if (data.isDefault) {
      await db.update(paymentGatewayConfigs).set({ isDefault: false }).where(eq(paymentGatewayConfigs.tenantId, tenantId));
    }

    const encryptedConfig = encryptionService.encrypt(JSON.stringify(data.config));

    const [gateway] = await db.insert(paymentGatewayConfigs).values({
      ...data,
      config: encryptedConfig,
      tenantId
    }).returning();
    
    return gateway;
  }
  
  async updateGateway(
    id: string,
    data: Partial<Omit<NewPaymentGatewayConfig, 'tenantId' | 'config'>> & { config?: object },
    tenantId: string
  ): Promise<PaymentGatewayConfig> {
    if (data.isDefault) {
        await db.update(paymentGatewayConfigs).set({ isDefault: false }).where(and(eq(paymentGatewayConfigs.tenantId, tenantId), eq(paymentGatewayConfigs.id, id)));
    }
    
    const updatePayload: any = { ...data };
    
    if (data.config) {
        updatePayload.config = encryptionService.encrypt(JSON.stringify(data.config));
    }
    
    const [gateway] = await db.update(paymentGatewayConfigs)
        .set(updatePayload)
        .where(and(eq(paymentGatewayConfigs.id, id), eq(paymentGatewayConfigs.tenantId, tenantId)))
        .returning();
        
    if (!gateway) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Gateway not found' });
    }
    
    return gateway;
  }
  
  async deleteGateway(id: string, tenantId: string): Promise<{ success: boolean }> {
      const [gateway] = await db.delete(paymentGatewayConfigs)
        .where(and(eq(paymentGatewayConfigs.id, id), eq(paymentGatewayConfigs.tenantId, tenantId)))
        .returning();
        
      if (!gateway) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Gateway not found' });
      }
      
      return { success: true };
  }
}

export const paymentGatewayService = PaymentGatewayService.getInstance(); 