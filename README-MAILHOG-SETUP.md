# MailHog Email Testing Setup

This guide shows how to set up [MailHog](https://github.com/mailhog/MailHog) for testing subscription automation emails in your Panel1 application.

## What is MailHog?

MailHog is an email testing tool for developers that provides:
- **SMTP server** for catching emails sent by your application
- **Web UI** for viewing and managing test emails
- **API** for programmatic email testing
- **No actual email delivery** - perfect for development and testing

## Quick Start with Docker

### 1. Start MailHog and Services

```bash
# Start all services including MailHog
docker-compose up -d

# Or start only MailHog
docker run -d \
  -p 1025:1025 \
  -p 8025:8025 \
  --name mailhog \
  mailhog/mailhog
```

### 2. Configure Environment

Copy the environment file and set up email configuration:

```bash
# Copy example environment file
cp apps/api/.env.example apps/api/.env

# Edit the .env file with these settings:
# SMTP_HOST=localhost
# SMTP_PORT=1025
# SMTP_USER=test@panel1.dev
# SMTP_PASS=
# SMTP_FROM=Panel1 <noreply@panel1.dev>
# ENABLE_EMAIL_SENDING=true
```

### 3. Start the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### 4. Access MailHog Web UI

Open your browser and navigate to:
- **MailHog Web UI**: http://localhost:8025
- **Your Application**: http://localhost:3000

## Alternative Installation Methods

### macOS (Homebrew)

```bash
brew update && brew install mailhog
mailhog
```

### Ubuntu/Debian

```bash
# Go >= v1.17
sudo apt-get -y install golang-go
go install github.com/mailhog/MailHog@latest
~/go/bin/MailHog
```

### Manual Download

1. Download the latest release from: https://github.com/mailhog/MailHog/releases
2. Make it executable: `chmod +x MailHog`
3. Run: `./MailHog`

## Testing Subscription Automation Emails

### 1. Run the Test Script

```bash
# Test all subscription automation features
npm run test:subscription-automation
```

### 2. Test Email Types

The system will send various types of emails that you can view in MailHog:

#### Invoice Emails
- **Invoice Created**: When a new invoice is generated
- **Invoice Paid**: When payment is confirmed
- **Invoice Overdue**: When payment is past due

#### Dunning Campaign Emails
- **Payment Failed Day 1**: First failed payment notification
- **Payment Failed Day 3**: Second reminder
- **Payment Failed Day 7**: Final notice
- **Grace Period Notice**: When grace period is activated
- **Suspension Notice**: When service is suspended
- **Cancellation Notice**: When subscription is cancelled

### 3. Trigger Specific Email Scenarios

#### Test Invoice Emails
```bash
# Create a test subscription and trigger renewal
curl -X POST http://localhost:3001/api/subscriptions/test-renewal \
  -H "Content-Type: application/json" \
  -d '{"subscriptionId": "test-sub-1"}'
```

#### Test Dunning Emails
```bash
# Simulate failed payment
curl -X POST http://localhost:3001/api/subscriptions/test-failed-payment \
  -H "Content-Type: application/json" \
  -d '{"subscriptionId": "test-sub-1"}'
```

## MailHog Configuration Options

### Environment Variables

```bash
# MailHog SMTP server binding
MH_SMTP_BIND_ADDR=0.0.0.0:1025

# MailHog HTTP server binding  
MH_UI_BIND_ADDR=0.0.0.0:8025
MH_API_BIND_ADDR=0.0.0.0:8025

# Storage options
MH_STORAGE=memory          # memory, mongodb, or maildir
MH_MONGO_URI=mongodb://... # if using mongodb storage
MH_MAILDIR_PATH=/tmp/mailhog # if using maildir storage

# Authentication (optional)
MH_AUTH_FILE=/path/to/auth-file
```

### Docker Compose Configuration

Our `docker-compose.yml` includes:

```yaml
mailhog:
  image: mailhog/mailhog:latest
  ports:
    - "1025:1025"  # SMTP server
    - "8025:8025"  # Web UI
  environment:
    - MH_STORAGE=memory
```

## Email Templates and Content

### Dunning Email Strategies

The system includes three pre-configured dunning strategies:

1. **Default Strategy** (30 days)
   - Day 1: Payment failed reminder
   - Day 3: Second reminder  
   - Day 7: Final notice
   - Day 14: Grace period (3 days)
   - Day 17: Service suspension
   - Day 30: Cancellation

2. **Gentle Strategy** (45 days)
   - Day 2: Gentle reminder
   - Day 7: Second gentle reminder
   - Day 14: Third reminder
   - Day 21: Grace period (7 days)
   - Day 28: Service suspension
   - Day 45: Cancellation

3. **Aggressive Strategy** (14 days)
   - Day 0: Immediate payment required
   - Day 1: Urgent payment notice
   - Day 3: Final urgent notice
   - Day 5: Grace period (2 days)
   - Day 7: Service suspension
   - Day 14: Cancellation

### Email Templates

All emails use responsive HTML templates with:
- Professional styling
- Clear call-to-action buttons
- Urgency indicators (color-coded borders)
- Customer-friendly language
- Mobile-responsive design

## API Testing

### MailHog API Endpoints

```bash
# Get all messages
curl http://localhost:8025/api/v1/messages

# Get specific message
curl http://localhost:8025/api/v1/messages/{message-id}

# Delete all messages
curl -X DELETE http://localhost:8025/api/v1/messages

# Search messages
curl "http://localhost:8025/api/v1/messages?query=subject:Invoice"
```

### Panel1 Email Testing Endpoints

```bash
# Test invoice email
curl -X POST http://localhost:3001/api/test/invoice-email \
  -H "Content-Type: application/json" \
  -d '{"type": "created", "invoiceId": "test-invoice-1"}'

# Test dunning email
curl -X POST http://localhost:3001/api/test/dunning-email \
  -H "Content-Type: application/json" \
  -d '{"template": "payment_failed_day_1", "subscriptionId": "test-sub-1"}'
```

## Troubleshooting

### Common Issues

1. **Emails not appearing in MailHog**
   - Check SMTP configuration in `.env`
   - Verify MailHog is running on port 1025
   - Ensure `ENABLE_EMAIL_SENDING=true`

2. **Connection refused errors**
   - Check if MailHog is running: `docker ps` or `ps aux | grep mailhog`
   - Verify port 1025 is not blocked by firewall
   - Try connecting: `telnet localhost 1025`

3. **Template rendering issues**
   - Check browser console for JavaScript errors
   - Verify email HTML is valid
   - Test with simple text emails first

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=mailhog*,panel1:email*

# Or in .env file
DEBUG=mailhog*,panel1:email*
```

### Health Check

```bash
# Check MailHog status
curl http://localhost:8025/api/v1/messages | jq '.'

# Test SMTP connection
npm run test:smtp-connection
```

## Production Considerations

### Security

- MailHog is for **development/testing only**
- Never use MailHog in production
- Use proper SMTP services (SendGrid, AWS SES, etc.) for production

### Email Service Switching

The system supports easy switching between email services:

```bash
# Development (MailHog)
SMTP_HOST=localhost
SMTP_PORT=1025

# Production (SendGrid example)  
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

## Next Steps

1. **Customize Email Templates**: Edit templates in `DunningEmailService.ts`
2. **Add New Email Types**: Extend the dunning system with custom triggers
3. **Integration Testing**: Write automated email tests using MailHog API
4. **Performance Testing**: Test with high email volumes
5. **Production Setup**: Configure proper SMTP service for production deployment

## Resources

- [MailHog GitHub Repository](https://github.com/mailhog/MailHog)
- [MailHog API Documentation](https://github.com/mailhog/MailHog/blob/master/docs/APIv1.md)
- [Panel1 Subscription Automation Documentation](./docs/SUBSCRIPTION_AUTOMATION.md) 