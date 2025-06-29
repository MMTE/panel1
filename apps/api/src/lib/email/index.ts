import { EmailService, emailService, EmailConfig } from './EmailService';

/**
 * Initialize email service with environment configuration
 */
export async function initializeEmailService(): Promise<void> {
  try {
    const config = EmailService.getConfigFromEnv();
    
    console.log('🚀 Initializing email service...');
    console.log(`📧 SMTP Host: ${config.host}:${config.port}`);
    console.log(`🔐 Authentication: ${config.auth ? 'Enabled' : 'Disabled'}`);
    console.log(`📨 From Address: ${config.from}`);
    
    await emailService.initialize(config);
    
    // Test connection if in development mode
    if (process.env.NODE_ENV === 'development') {
      const isConnected = await emailService.testConnection();
      if (isConnected) {
        console.log('✅ Email service connection test passed');
      } else {
        console.warn('⚠️ Email service connection test failed, but service is initialized');
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize email service:', error);
    
    // In production, we might want to throw the error to prevent startup
    // In development, we can continue without email functionality
    if (process.env.NODE_ENV === 'production') {
      throw error;
    } else {
      console.warn('⚠️ Continuing without email service in development mode');
    }
  }
}

/**
 * Send a test email to verify email functionality
 */
export async function sendTestEmail(to: string): Promise<boolean> {
  try {
    if (!emailService.isInitialized()) {
      console.error('Email service not initialized');
      return false;
    }
    
    await emailService.sendTestEmail(to);
    console.log(`✅ Test email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send test email to ${to}:`, error);
    return false;
  }
}

/**
 * Get email service health status
 */
export async function getEmailServiceHealth(): Promise<{
  initialized: boolean;
  connected: boolean;
  config: Partial<EmailConfig>;
}> {
  const initialized = emailService.isInitialized();
  let connected = false;
  
  if (initialized) {
    try {
      connected = await emailService.testConnection();
    } catch (error) {
      connected = false;
    }
  }
  
  const config = EmailService.getConfigFromEnv();
  
  return {
    initialized,
    connected,
    config: {
      host: config.host,
      port: config.port,
      secure: config.secure,
      from: config.from,
      replyTo: config.replyTo,
      // Don't expose auth credentials
    }
  };
}

// Re-export the email service instance
export { emailService } from './EmailService'; 