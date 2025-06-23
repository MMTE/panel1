import { db } from './index.js';
import { tenants, users, clients, plans } from './schema/index.js';
import { hashPassword } from '../lib/auth.js';

async function seed() {
  try {
    console.log('🌱 Starting database seed...');

    // Create default tenant
    const [defaultTenant] = await db.insert(tenants).values({
      name: 'Panel1 Demo',
      slug: 'panel1-demo',
      domain: 'localhost',
      settings: {
        defaultCurrency: 'USD',
        timezone: 'UTC',
      },
      branding: {
        primaryColor: '#3b82f6',
        logo: null,
      },
    }).returning();

    console.log('✅ Created default tenant:', defaultTenant.name);

    // Create admin user
    const adminPassword = await hashPassword('admin123');
    const [adminUser] = await db.insert(users).values({
      email: 'admin@panel1.dev',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      tenantId: defaultTenant.id,
    }).returning();

    console.log('✅ Created admin user:', adminUser.email);

    // Create client user
    const clientPassword = await hashPassword('client123');
    const [clientUser] = await db.insert(users).values({
      email: 'client@panel1.dev',
      password: clientPassword,
      firstName: 'Demo',
      lastName: 'Client',
      role: 'CLIENT',
      tenantId: defaultTenant.id,
    }).returning();

    console.log('✅ Created client user:', clientUser.email);

    // Create client profile
    const [clientProfile] = await db.insert(clients).values({
      userId: clientUser.id,
      companyName: 'Demo Company Inc.',
      address: '123 Demo Street',
      city: 'Demo City',
      state: 'CA',
      zipCode: '12345',
      country: 'US',
      phone: '+1-555-123-4567',
      status: 'ACTIVE',
      tenantId: defaultTenant.id,
    }).returning();

    console.log('✅ Created client profile:', clientProfile.companyName);

    // Create sample plans
    const planData = [
      {
        name: 'Starter',
        description: 'Perfect for small projects',
        price: '9.99',
        currency: 'USD',
        interval: 'MONTHLY' as const,
        features: {
          storage: '10GB',
          bandwidth: '100GB',
          domains: 1,
          support: 'Email',
        },
        tenantId: defaultTenant.id,
      },
      {
        name: 'Professional',
        description: 'Great for growing businesses',
        price: '29.99',
        currency: 'USD',
        interval: 'MONTHLY' as const,
        features: {
          storage: '100GB',
          bandwidth: '1TB',
          domains: 10,
          support: '24/7 Chat',
        },
        tenantId: defaultTenant.id,
      },
      {
        name: 'Enterprise',
        description: 'For large scale operations',
        price: '99.99',
        currency: 'USD',
        interval: 'MONTHLY' as const,
        features: {
          storage: 'Unlimited',
          bandwidth: 'Unlimited',
          domains: 'Unlimited',
          support: 'Priority Phone',
        },
        tenantId: defaultTenant.id,
      },
    ];

    const samplePlans = await db.insert(plans).values(planData).returning();
    console.log('✅ Created sample plans:', samplePlans.length);

    console.log('\n🎉 Database seed completed successfully!');
    console.log('\n📋 Demo Credentials:');
    console.log('👤 Admin: admin@panel1.dev / admin123');
    console.log('👤 Client: client@panel1.dev / client123');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seed();