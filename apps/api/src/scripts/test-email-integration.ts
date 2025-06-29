import dotenv from 'dotenv';
import { InvoiceEmailService } from '../lib/invoice/InvoiceEmailService';
import { DunningEmailService } from '../lib/dunning/DunningEmailService';

// Load environment variables
dotenv.config();

/**
 * Test script for MailHog email integration
 * This tests both invoice and dunning emails
 */
async function testEmailIntegration() {
  console.log('📧 Testing MailHog Email Integration...\n');

  // Email configuration for MailHog
  const emailConfig = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || 'test@panel1.dev',
      pass: process.env.SMTP_PASS || '',
    },
    from: process.env.SMTP_FROM || 'Panel1 <noreply@panel1.dev>',
  };

  console.log('📋 Email Configuration:');
  console.log(`   Host: ${emailConfig.host}:${emailConfig.port}`);
  console.log(`   From: ${emailConfig.from}`);
  console.log(`   Secure: ${emailConfig.secure}\n`);

  try {
    // Test 1: Invoice Created Email
    console.log('1️⃣ Testing Invoice Created Email...');
    await testInvoiceEmail('created', emailConfig);
    console.log('✅ Invoice created email test completed\n');

    // Test 2: Invoice Paid Email
    console.log('2️⃣ Testing Invoice Paid Email...');
    await testInvoiceEmail('paid', emailConfig);
    console.log('✅ Invoice paid email test completed\n');

    // Test 3: Invoice Overdue Email
    console.log('3️⃣ Testing Invoice Overdue Email...');
    await testInvoiceEmail('overdue', emailConfig);
    console.log('✅ Invoice overdue email test completed\n');

    // Test 4: Dunning Email - Payment Failed Day 1
    console.log('4️⃣ Testing Dunning Email - Payment Failed Day 1...');
    await testDunningEmail('payment_failed_day_1', emailConfig);
    console.log('✅ Dunning email test completed\n');

    // Test 5: Dunning Email - Grace Period Notice
    console.log('5️⃣ Testing Dunning Email - Grace Period Notice...');
    await testDunningEmail('grace_period_notice', emailConfig, { graceDays: 3 });
    console.log('✅ Grace period email test completed\n');

    // Test 6: Dunning Email - Suspension Notice
    console.log('6️⃣ Testing Dunning Email - Suspension Notice...');
    await testDunningEmail('suspension_notice', emailConfig);
    console.log('✅ Suspension email test completed\n');

    console.log('🎉 All email tests completed successfully!');
    console.log('🌐 Check MailHog Web UI at: http://localhost:8025');
    console.log('📧 Total emails sent: 6');

  } catch (error) {
    console.error('❌ Email test failed:', error);
    process.exit(1);
  }
}

async function testInvoiceEmail(type: 'created' | 'paid' | 'overdue' | 'reminder', emailConfig: any) {
  const mockInvoiceData = {
    id: `test-invoice-${Date.now()}`,
    invoiceNumber: `INV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    total: '99.99',
    currency: 'USD',
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    createdAt: new Date(),
    client: {
      companyName: 'Test Company Ltd',
      user: {
        email: 'test.customer@example.com',
        firstName: 'John',
        lastName: 'Doe',
      },
    },
    tenant: {
      name: 'Panel1 Test',
      domain: 'panel1.test',
    },
  };

  await InvoiceEmailService.sendInvoiceEmail(mockInvoiceData, type, emailConfig);
  console.log(`   📧 ${type} email sent to ${mockInvoiceData.client.user.email}`);
}

async function testDunningEmail(
  template: any,
  emailConfig: any,
  metadata?: Record<string, any>
) {
  const mockSubscriptionData = {
    id: `test-subscription-${Date.now()}`,
    unitPrice: '29.99',
    status: 'PAST_DUE',
    clientId: 'test-client-1',
  };

  const mockClientData = {
    id: 'test-client-1',
    companyName: 'Acme Corporation',
    user: {
      email: 'billing@acme.com',
      firstName: 'Jane',
      lastName: 'Smith',
    },
  };

  await DunningEmailService.sendDunningEmail(
    mockSubscriptionData,
    mockClientData,
    template,
    emailConfig,
    metadata
  );
  console.log(`   📧 ${template} email sent to ${mockClientData.user.email}`);
}

// Health check function
async function checkMailHogConnection() {
  console.log('🔍 Checking MailHog connection...');
  
  try {
    const response = await fetch('http://localhost:8025/api/v1/messages');
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ MailHog is running - ${data.total} messages in queue`);
      return true;
    } else {
      console.log(`❌ MailHog API returned status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Cannot connect to MailHog: ${error.message}`);
    console.log('💡 Make sure MailHog is running: docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog');
    return false;
  }
}

// Main execution
async function main() {
  const isMailHogRunning = await checkMailHogConnection();
  
  if (!isMailHogRunning) {
    console.log('\n❌ MailHog is not running. Please start it first.');
    console.log('Run: docker run -d -p 1025:1025 -p 8025:8025 --name mailhog mailhog/mailhog');
    process.exit(1);
  }

  await testEmailIntegration();
}

// Run the tests
main(); 