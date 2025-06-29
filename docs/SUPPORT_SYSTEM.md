# 🎫 Panel1 Support System Documentation

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: January 2025

---

## 🎯 **Overview**

Panel1's Support System is a comprehensive, modular ticketing and knowledge management platform designed to handle customer support operations with enterprise-grade automation, SLA management, and multi-tenant isolation.

### **Key Features**
- **Full-Featured Ticketing System** - Complete ticket lifecycle management
- **Intelligent Automation** - Rule-based ticket processing and responses  
- **SLA Management** - Service level agreements with escalation handling
- **Knowledge Base** - Self-service articles with full-text search
- **Multi-Tenant Architecture** - Complete tenant isolation and branding
- **Plugin Extensibility** - Hooks and extensions for custom functionality
- **Advanced Analytics** - Comprehensive reporting and metrics
- **Email Integration** - Automated notifications and responses

---

## 🏗️ **Architecture**

### **Core Components**

```
Support System Architecture
├── 📊 Database Layer
│   ├── support_tickets (Main ticket storage)
│   ├── ticket_messages (All ticket communications)
│   ├── support_categories (Ticket categorization)
│   ├── knowledge_base_articles (Self-service content)
│   ├── support_automation_rules (Business logic)
│   ├── support_sla_profiles (Service agreements)
│   └── support_agent_profiles (Team member configs)
├── 🔧 Service Layer
│   ├── SupportService (Core ticket operations)
│   ├── SupportEmailService (Email notifications)
│   ├── SupportAutomationEngine (Rule processing)
│   ├── SlaManager (SLA tracking and escalation)
│   └── TicketNumberService (Sequential numbering)
├── 🌐 API Layer
│   └── supportRouter (tRPC endpoints)
├── 🤖 Job Processing
│   └── SupportProcessor (Scheduled automation)
└── 🧩 Plugin Integration
    └── Event hooks for extensibility
```

### **Data Flow**

1. **Ticket Creation** → Sequential numbering → Auto-assignment → SLA calculation
2. **Message Processing** → Automation rules → Email notifications → Plugin hooks
3. **Status Changes** → SLA tracking → Escalation rules → Analytics updates
4. **Scheduled Jobs** → SLA monitoring → Auto-responses → Satisfaction surveys

---

## 🚀 **Getting Started**

### **1. Database Setup**

Run the support system migration:

```bash
# The migration is included in the main migration flow
npm run db:migrate
```

### **2. Environment Configuration**

Add to your `.env` file:

```env
# Support System Settings
ENABLE_EMAIL_SENDING=true
SUPPORT_FROM_EMAIL=support@yourcompany.com
SUPPORT_REPLY_TO_EMAIL=noreply@yourcompany.com

# Knowledge Base Settings
KB_PUBLIC_ACCESS=true
KB_REQUIRE_AUTH=false

# SLA Settings
DEFAULT_FIRST_RESPONSE_TIME=60  # minutes
DEFAULT_RESOLUTION_TIME=1440    # minutes (24 hours)

# Automation Settings
ENABLE_AUTO_RESPONSES=true
ENABLE_ESCALATIONS=true
```

### **3. Initial Setup**

Create default support categories and SLA profiles:

```typescript
import { supportService } from './lib/support/SupportService';
import { SlaManager } from './lib/support/SlaManager';

// Create default SLA profile
const slaManager = SlaManager.getInstance();
await slaManager.createDefaultSlaProfile(tenantId);

// Create support categories
await db.insert(supportCategories).values([
  {
    name: 'Technical Support',
    description: 'Technical issues and bugs',
    color: '#ef4444',
    icon: 'Bug',
    tenantId,
  },
  {
    name: 'Billing',
    description: 'Billing and payment inquiries',
    color: '#22c55e', 
    icon: 'CreditCard',
    tenantId,
  },
  // ... more categories
]);
```

---

## 📝 **API Reference**

### **Ticket Management**

#### Create Ticket
```typescript
const ticket = await trpc.support.createTicket.mutate({
  subject: 'Cannot access my account',
  content: 'I am unable to log into my account...',
  priority: 'HIGH',
  categoryId: 'uuid',
  tags: ['login', 'urgent'],
});
```

#### Get Tickets
```typescript
const result = await trpc.support.getTickets.query({
  filters: {
    status: ['OPEN', 'IN_PROGRESS'],
    priority: ['HIGH', 'URGENT'],
    assignedToId: 'uuid',
    search: 'login issue',
  },
  limit: 20,
  offset: 0,
});
```

#### Add Message
```typescript
const message = await trpc.support.addMessage.mutate({
  ticketId: 'uuid',
  content: 'Thank you for contacting support...',
  messageType: 'STAFF_REPLY',
  timeSpent: 15, // minutes
});
```

#### Update Status
```typescript
const ticket = await trpc.support.updateTicketStatus.mutate({
  id: 'uuid',
  status: 'RESOLVED',
  reason: 'Issue resolved by password reset',
});
```

### **Knowledge Base**

#### Get Articles
```typescript
const articles = await trpc.support.getKnowledgeBaseArticles.query({
  categoryId: 'uuid',
  search: 'password reset',
  limit: 10,
});
```

#### Get Article by Slug
```typescript
const article = await trpc.support.getKnowledgeBaseArticle.query({
  slug: 'how-to-reset-password'
});
```

---

## 🤖 **Automation System**

### **Automation Rules**

Create sophisticated automation rules:

```typescript
const rule = await trpc.support.createAutomationRule.mutate({
  name: 'High Priority Auto-Assignment',
  triggerEvent: 'ticket.created',
  conditions: [
    {
      field: 'priority',
      operator: 'equals',
      value: 'HIGH'
    }
  ],
  actions: [
    {
      type: 'assign_ticket',
      parameters: { assignedToId: 'senior-agent-id' }
    },
    {
      type: 'send_auto_response',
      parameters: { template: 'high_priority_acknowledgment' }
    }
  ]
});
```

### **Available Triggers**
- `ticket.created` - New ticket created
- `ticket.status.changed` - Status updated
- `message.added` - New message/reply
- `ticket.assigned` - Ticket assigned to agent
- `sla.breach` - SLA time exceeded

### **Available Actions**
- `assign_ticket` - Auto-assign to specific agent
- `change_status` - Update ticket status
- `change_priority` - Modify priority level
- `add_tags` - Add classification tags
- `add_internal_note` - Add staff note
- `send_auto_response` - Send templated response
- `escalate_ticket` - Increase escalation level
- `notify_users` - Send notifications

---

## ⏰ **SLA Management**

### **SLA Profiles**

Define service level agreements:

```typescript
const slaProfile = await trpc.support.createSlaProfile.mutate({
  name: 'Premium Support SLA',
  description: 'Premium customers get faster response',
  firstResponseTime: 30, // 30 minutes
  resolutionTime: 480,   // 8 hours
  isDefault: false,
});
```

### **Business Hours Configuration**

```typescript
const businessHours = {
  timezone: 'America/New_York',
  monday: { start: '09:00', end: '17:00', enabled: true },
  tuesday: { start: '09:00', end: '17:00', enabled: true },
  wednesday: { start: '09:00', end: '17:00', enabled: true },
  thursday: { start: '09:00', end: '17:00', enabled: true },
  friday: { start: '09:00', end: '17:00', enabled: true },
  saturday: { start: '10:00', end: '14:00', enabled: false },
  sunday: { start: '10:00', end: '14:00', enabled: false },
};
```

### **Escalation Rules**

```typescript
const escalationRules = [
  {
    afterMinutes: 60,  // 1 hour
    notifyUserIds: ['supervisor-id'],
    changePriority: 'HIGH',
  },
  {
    afterMinutes: 240, // 4 hours  
    assignToId: 'senior-agent-id',
    notifyUserIds: ['manager-id'],
    changePriority: 'URGENT',
  }
];
```

---

## 📊 **Analytics & Reporting**

### **Support Metrics**

```typescript
const stats = await trpc.support.getSupportStats.query();

// Returns:
{
  totalTickets: 1247,
  openTickets: 23,
  inProgressTickets: 15,
  averageFirstResponseTime: 45, // minutes
  averageResolutionTime: 320,   // minutes
  satisfactionScore: 4.2,       // 1-5 scale
  ticketsByPriority: {
    'LOW': 45,
    'MEDIUM': 67,
    'HIGH': 23,
    'URGENT': 5
  },
  ticketsByCategory: {
    'Technical': 89,
    'Billing': 34,
    'Account': 17
  }
}
```

### **SLA Metrics**

```typescript
const slaMetrics = await trpc.support.getSlaMetrics.query({
  dateRange: {
    start: new Date('2025-01-01'),
    end: new Date('2025-01-31')
  }
});

// Returns:
{
  firstResponseSlaRate: 95.2,  // Percentage
  resolutionSlaRate: 87.6,     // Percentage
  breachedTickets: 3,
  atRiskTickets: 7
}
```

---

## 🧩 **Plugin Integration**

### **Available Hooks**

The support system emits events that plugins can subscribe to:

```typescript
// Plugin hook registration
export const MyPlugin: Panel1Plugin = {
  name: 'advanced-support',
  version: '1.0.0',
  
  hooks: {
    'ticket.created': async ({ ticket, tenantId }) => {
      // Custom logic when tickets are created
      console.log(`New ticket: ${ticket.ticketNumber}`);
    },
    
    'ticket.resolved': async ({ ticket, tenantId }) => {
      // Custom logic when tickets are resolved
      await sendToExternalCRM(ticket);
    },
    
    'sla.breach': async ({ ticket, breachType, tenantId }) => {
      // Custom escalation logic
      await notifySlackChannel(`SLA breach: ${ticket.ticketNumber}`);
    }
  }
};
```

### **UI Slot Extensions**

Extend the support interface:

```tsx
// Plugin UI component
const CustomTicketWidget = () => (
  <div className="border rounded-lg p-4">
    <h3>Custom Ticket Analysis</h3>
    {/* Custom UI logic */}
  </div>
);

// Register UI slot
PluginSystem.uiSlots.register('ticket.sidebar', CustomTicketWidget);
```

---

## 🔧 **Configuration Options**

### **Ticket Numbering**

Customize ticket number format:

```typescript
const ticketNumber = await TicketNumberService.generateTicketNumber(
  tenantId,
  {
    prefix: 'SUP',      // Custom prefix
    yearInNumber: true,  // Include year
    padLength: 8,       // Zero-padding length
    suffix: 'PROD'      // Optional suffix
  }
);
// Result: SUP-2025-00000001-PROD
```

### **Email Templates**

Customize email notifications:

```typescript
const emailTemplates = {
  'ticket_created': {
    subject: 'Support Ticket Created: {{ticketNumber}}',
    template: 'custom-ticket-created.html'
  },
  'ticket_resolved': {
    subject: 'Ticket Resolved: {{ticketNumber}}',
    template: 'custom-ticket-resolved.html'
  }
};
```

### **Auto-Response Templates**

```typescript
const autoResponses = {
  'acknowledgment': 'Thank you for contacting {{companyName}} support...',
  'business_hours': 'We are currently outside business hours...',
  'escalation': 'Your ticket has been escalated to our senior team...'
};
```

---

## 🚀 **Advanced Features**

### **Smart Assignment**

Automatic ticket assignment based on:
- Agent workload and availability
- Category expertise and skills
- Language preferences
- Previous customer interactions
- Round-robin or priority-based distribution

### **Satisfaction Surveys**

Automated satisfaction tracking:
```typescript
// Automatically sent when tickets are resolved
const survey = {
  questions: [
    'How satisfied were you with our response time?',
    'How satisfied were you with the solution provided?',
    'How satisfied were you with our support team?'
  ],
  scale: '1-5 stars',
  followUp: true
};
```

### **Knowledge Base AI**

- **Auto-suggestions** based on ticket content
- **Article recommendations** for customers
- **Content analytics** to identify gaps
- **Search optimization** with full-text indexing

### **Multi-Channel Support**

Extensible for multiple communication channels:
- Email integration (built-in)
- Live chat (plugin)
- Social media (plugin)
- Phone integration (plugin)
- Mobile app (API-ready)

---

## 📈 **Performance & Scaling**

### **Database Optimization**

- **Indexed queries** for fast ticket retrieval
- **Partitioning** by tenant and date for large datasets
- **Full-text search** for knowledge base articles
- **Query optimization** for analytics and reporting

### **Caching Strategy**

```typescript
// Redis caching for frequently accessed data
const cacheConfig = {
  knowledgeBaseArticles: '24h',
  supportCategories: '12h', 
  slaProfiles: '6h',
  agentProfiles: '1h'
};
```

### **Job Processing**

Background job processing for:
- SLA monitoring and escalations
- Email sending and notifications  
- Analytics calculation
- Automated responses
- Satisfaction surveys

---

## 🔒 **Security & Compliance**

### **Data Protection**
- **Tenant isolation** - Complete data separation
- **Field-level encryption** for sensitive information
- **Audit logging** for all ticket operations
- **GDPR compliance** with data export/deletion

### **Access Control**
- **Role-based permissions** for different user types
- **Category-based access** for specialized agents
- **Internal notes** visible only to staff
- **Customer portal** with restricted access

### **Email Security**
- **SPF/DKIM** email authentication
- **Attachment scanning** for malware
- **Rate limiting** to prevent abuse
- **Encrypted communications** option

---

## 🎯 **WHMCS Comparison**

| Feature | Panel1 Support | WHMCS |
|---------|---------------|-------|
| **Modern Architecture** | ✅ TypeScript, React, tRPC | ❌ Legacy PHP |
| **Real-time Updates** | ✅ Built-in | ❌ Limited |
| **Plugin System** | ✅ Modern SDK with TypeScript | ✅ PHP-based |
| **SLA Management** | ✅ Advanced with escalations | ✅ Basic |
| **Knowledge Base** | ✅ Full-text search, analytics | ✅ Basic |
| **Automation Rules** | ✅ Visual rule builder | ✅ Limited automation |
| **Multi-tenant** | ✅ Built-in isolation | ❌ Single-tenant |
| **API Quality** | ✅ Type-safe tRPC | ❌ REST only |
| **Email Integration** | ✅ Modern templating | ✅ Basic |
| **Reporting** | ✅ Real-time analytics | ✅ Basic reports |

---

## 🚦 **Implementation Status**

### ✅ **Completed (100%)**
- Core ticket management system
- Message threading and attachments
- Sequential ticket numbering
- Email notification system
- Support categories and organization
- Knowledge base with full-text search
- SLA profiles and escalation rules
- Automation engine with rule processing
- Agent profiles and assignment logic
- tRPC API with full type safety

### 🔧 **In Progress (80%)**
- Advanced UI components
- Satisfaction survey automation
- Knowledge base analytics
- Plugin integration examples

### 📋 **Planned**
- Mobile-optimized interface
- Advanced reporting dashboard
- Multi-language support
- Voice/video call integration
- AI-powered suggestions

---

## 🤝 **Contributing**

The support system follows Panel1's modular architecture. To extend functionality:

1. **Service Extensions** - Add new services in `/lib/support/`
2. **API Endpoints** - Extend the support router in `/routers/support.ts`
3. **Database Schema** - Add migrations for new tables
4. **Plugin Hooks** - Implement new event hooks for extensibility
5. **UI Components** - Create reusable components in `/components/support/`

---

**📧 Questions?** Contact the Panel1 development team or create an issue in the repository.

**🔗 Related Documentation:**
- [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md)
- [Multi-Tenant Architecture](./MULTI_TENANT.md)
- [Job Processing System](./JOB_SYSTEM.md) 