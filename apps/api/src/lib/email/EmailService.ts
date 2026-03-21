import { EmailService } from '@panel1/core';
export type { EmailConfig, EmailMessage, EmailTemplate } from '@panel1/core';

export const emailService = EmailService.getInstance();
export { EmailService };
