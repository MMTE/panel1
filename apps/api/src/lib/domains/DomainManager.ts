import { EventEmitter } from 'events';
import { db } from '../../db';
import { 
  domains, 
  dnsZones, 
  dnsRecords, 
  domainOperations,
  Domain,
  NewDomain,
  DnsZone,
  NewDnsZone,
  DnsRecord,
  NewDnsRecord,
  NewDomainOperation
} from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { JobScheduler } from '../jobs/JobScheduler';

interface DomainContact {
  firstName: string;
  lastName: string;
  organization?: string;
  email: string;
  phone: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

interface DomainRegistrationData {
  domainName: string;
  clientId: string;
  subscriptionId?: string;
  registrar: string;
  registrantContact: DomainContact;
  adminContact?: DomainContact;
  techContact?: DomainContact;
  billingContact?: DomainContact;
  nameservers?: string[];
  autoRenew?: boolean;
  renewalPeriod?: number;
  privacyEnabled?: boolean;
  tenantId: string;
}

interface DnsRecordData {
  zoneId: string;
  name: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'PTR' | 'SRV' | 'CAA';
  value: string;
  ttl?: number;
  priority?: number;
  tenantId: string;
}

export class DomainManager extends EventEmitter {
  private static instance: DomainManager;
  private jobScheduler: JobScheduler;
  private initialized = false;

  private constructor() {
    super();
    this.jobScheduler = JobScheduler.getInstance();
  }

  static getInstance(): DomainManager {
    if (!DomainManager.instance) {
      DomainManager.instance = new DomainManager();
    }
    return DomainManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🌐 Initializing Domain Manager...');

    try {
      // Initialize job scheduler if not already done
      await this.jobScheduler.initialize();

      // Add domain management job queues
      await this.setupJobQueues();

      // Setup event handlers
      this.setupEventHandlers();

      this.initialized = true;
      console.log('✅ Domain Manager initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Domain Manager:', error);
      throw error;
    }
  }

  private async setupJobQueues(): Promise<void> {
    const queues = [
      'domain-register',
      'domain-renew',
      'domain-transfer',
      'domain-sync',
      'dns-update',
      'domain-expiry-check'
    ];

    for (const queueName of queues) {
      console.log(`📋 Queue ${queueName} ready`);
    }
  }

  private setupEventHandlers(): void {
    console.log('📡 Setting up domain event handlers...');
    
    this.on('domain.registered', async (data) => {
      console.log(`✅ Domain registered: ${data.domainName}`);
    });

    this.on('domain.renewal.due', async (data) => {
      console.log(`⏰ Domain renewal due: ${data.domainName}`);
    });

    this.on('dns.record.updated', async (data) => {
      console.log(`🔄 DNS record updated: ${data.name}.${data.zone}`);
    });
  }

  // Domain Registration Methods
  async registerDomain(data: DomainRegistrationData): Promise<string> {
    try {
      console.log(`🌐 Registering domain: ${data.domainName}`);

      // Create domain operation record
      const [operation] = await db
        .insert(domainOperations)
        .values({
          domainId: '', // Will be updated after domain creation
          operation: 'register',
          status: 'pending',
          requestData: data,
          tenantId: data.tenantId,
        })
        .returning();

      // Create domain record
      const [domain] = await db
        .insert(domains)
        .values({
          domainName: data.domainName,
          clientId: data.clientId,
          subscriptionId: data.subscriptionId,
          registrar: data.registrar,
          registrantContact: data.registrantContact,
          adminContact: data.adminContact || data.registrantContact,
          techContact: data.techContact || data.registrantContact,
          billingContact: data.billingContact || data.registrantContact,
          nameservers: data.nameservers || [],
          autoRenew: data.autoRenew ?? true,
          renewalPeriod: data.renewalPeriod ?? 1,
          privacyEnabled: data.privacyEnabled ?? false,
          status: 'active',
          tenantId: data.tenantId,
        })
        .returning();

      // Update operation with domain ID
      await db
        .update(domainOperations)
        .set({ domainId: domain.id })
        .where(eq(domainOperations.id, operation.id));

      // Create default DNS zone
      await this.createDnsZone({
        domainId: domain.id,
        zoneName: data.domainName,
        tenantId: data.tenantId,
      });

      // Schedule domain registration job
      await this.scheduleDomainOperation(domain.id, 'register', data);

      this.emit('domain.registered', { domainName: data.domainName, domainId: domain.id });

      return domain.id;
    } catch (error) {
      console.error('❌ Failed to register domain:', error);
      throw error;
    }
  }

  async renewDomain(domainId: string, years: number = 1): Promise<void> {
    try {
      const domain = await this.getDomainById(domainId);
      if (!domain) {
        throw new Error('Domain not found');
      }

      console.log(`🔄 Renewing domain: ${domain.domainName} for ${years} year(s)`);

      // Create renewal operation
      await db
        .insert(domainOperations)
        .values({
          domainId: domain.id,
          operation: 'renew',
          status: 'pending',
          requestData: { years },
          tenantId: domain.tenantId,
        });

      // Schedule renewal job
      await this.scheduleDomainOperation(domain.id, 'renew', { years });

      this.emit('domain.renewal.started', { domainName: domain.domainName, years });
    } catch (error) {
      console.error('❌ Failed to renew domain:', error);
      throw error;
    }
  }

  // DNS Management Methods
  async createDnsZone(data: { domainId: string; zoneName: string; tenantId: string }): Promise<string> {
    try {
      const [zone] = await db
        .insert(dnsZones)
        .values({
          domainId: data.domainId,
          zoneName: data.zoneName,
          soaRecord: {
            primaryNameserver: `ns1.${data.zoneName}`,
            email: `admin.${data.zoneName}`,
            serial: Date.now(),
            refresh: 3600,
            retry: 1800,
            expire: 604800,
            ttl: 86400,
          },
          tenantId: data.tenantId,
        })
        .returning();

      console.log(`✅ Created DNS zone: ${data.zoneName}`);
      return zone.id;
    } catch (error) {
      console.error('❌ Failed to create DNS zone:', error);
      throw error;
    }
  }

  async createDnsRecord(data: DnsRecordData): Promise<string> {
    try {
      const [record] = await db
        .insert(dnsRecords)
        .values({
          zoneId: data.zoneId,
          name: data.name,
          type: data.type,
          value: data.value,
          ttl: data.ttl || 3600,
          priority: data.priority,
          tenantId: data.tenantId,
        })
        .returning();

      // Get zone info for event
      const zone = await db
        .select()
        .from(dnsZones)
        .where(eq(dnsZones.id, data.zoneId))
        .limit(1);

      this.emit('dns.record.created', { 
        recordId: record.id, 
        name: data.name, 
        type: data.type,
        zone: zone[0]?.zoneName 
      });

      console.log(`✅ Created DNS record: ${data.name} (${data.type})`);
      return record.id;
    } catch (error) {
      console.error('❌ Failed to create DNS record:', error);
      throw error;
    }
  }

  async updateDnsRecord(recordId: string, updates: Partial<DnsRecordData>): Promise<void> {
    try {
      await db
        .update(dnsRecords)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(dnsRecords.id, recordId));

      this.emit('dns.record.updated', { recordId });
      console.log(`✅ Updated DNS record: ${recordId}`);
    } catch (error) {
      console.error('❌ Failed to update DNS record:', error);
      throw error;
    }
  }

  async deleteDnsRecord(recordId: string): Promise<void> {
    try {
      await db
        .delete(dnsRecords)
        .where(eq(dnsRecords.id, recordId));

      this.emit('dns.record.deleted', { recordId });
      console.log(`✅ Deleted DNS record: ${recordId}`);
    } catch (error) {
      console.error('❌ Failed to delete DNS record:', error);
      throw error;
    }
  }

  // Domain Information Methods
  async getDomainById(domainId: string): Promise<Domain | null> {
    try {
      const result = await db
        .select()
        .from(domains)
        .where(eq(domains.id, domainId))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('❌ Failed to get domain:', error);
      throw error;
    }
  }

  async getDomainsByClient(clientId: string, tenantId: string): Promise<Domain[]> {
    try {
      return await db
        .select()
        .from(domains)
        .where(and(
          eq(domains.clientId, clientId),
          eq(domains.tenantId, tenantId)
        ))
        .orderBy(desc(domains.createdAt));
    } catch (error) {
      console.error('❌ Failed to get client domains:', error);
      throw error;
    }
  }

  async getDnsZonesByDomain(domainId: string): Promise<DnsZone[]> {
    try {
      return await db
        .select()
        .from(dnsZones)
        .where(eq(dnsZones.domainId, domainId));
    } catch (error) {
      console.error('❌ Failed to get DNS zones:', error);
      throw error;
    }
  }

  async getDnsRecordsByZone(zoneId: string): Promise<DnsRecord[]> {
    try {
      return await db
        .select()
        .from(dnsRecords)
        .where(eq(dnsRecords.zoneId, zoneId))
        .orderBy(desc(dnsRecords.createdAt));
    } catch (error) {
      console.error('❌ Failed to get DNS records:', error);
      throw error;
    }
  }

  // Domain Operations
  async getDomainsExpiringWithin(days: number, tenantId: string): Promise<Domain[]> {
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      return await db
        .select()
        .from(domains)
        .where(and(
          eq(domains.tenantId, tenantId),
          eq(domains.autoRenew, true)
        ));
        // TODO: Add proper date filtering when Drizzle supports it better
    } catch (error) {
      console.error('❌ Failed to get expiring domains:', error);
      throw error;
    }
  }

  async updateNameservers(domainId: string, nameservers: string[]): Promise<void> {
    try {
      await db
        .update(domains)
        .set({ 
          nameservers,
          updatedAt: new Date()
        })
        .where(eq(domains.id, domainId));

      // Create operation record
      const domain = await this.getDomainById(domainId);
      if (domain) {
        await db
          .insert(domainOperations)
          .values({
            domainId: domain.id,
            operation: 'update_nameservers',
            status: 'pending',
            requestData: { nameservers },
            tenantId: domain.tenantId,
          });

        // Schedule nameserver update job
        await this.scheduleDomainOperation(domain.id, 'update_nameservers', { nameservers });
      }

      console.log(`✅ Updated nameservers for domain: ${domainId}`);
    } catch (error) {
      console.error('❌ Failed to update nameservers:', error);
      throw error;
    }
  }

  private async scheduleDomainOperation(domainId: string, operation: string, data: any): Promise<void> {
    // TODO: Implement job scheduling with BullMQ
    console.log(`📋 Scheduling ${operation} job for domain: ${domainId}`);
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Domain Manager...');
    this.removeAllListeners();
  }
} 