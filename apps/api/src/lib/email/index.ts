import { EmailService, emailService, EmailConfig } from './EmailService';
import { logger } from '../logging/Logger';

/**
 * Initialize email service with environment configuration
 */
export async function initializeEmailService(): Promise<void> {
  try {
    const config = EmailService.getConfigFromEnv();

    logger.info('Initializing email service', {
      smtpHost: config.host,
      smtpPort: config.port,
      auth: config.auth ? 'enabled' : 'disabled',
      from: config.from,
    });

    await emailService.initialize(config);

    if (process.env.NODE_ENV === 'development') {
      const isConnected = await emailService.testConnection();
      if (isConnected) {
        logger.info('Email service connection test passed');
      } else {
        logger.warn('Email service connection test failed; SMTP may be down (e.g. start MailHog: docker compose up -d mailhog)');
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to initialize email service', undefined, err);

    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    logger.warn('Continuing without working email transport (non-production)');
  }
}

/**
 * Send a test email to verify email functionality
 */
export async function sendTestEmail(to: string): Promise<boolean> {
  try {
    if (!emailService.isInitialized()) {
      logger.error('Email service not initialized');
      return false;
    }

    await emailService.sendTestEmail(to);
    logger.info('Test email sent successfully', { to });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to send test email', { to }, err);
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