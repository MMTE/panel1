# Panel1 Architecture Guide

## System Architecture

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Database | PostgreSQL + Drizzle | Type-safe ORM with migrations |
| Backend | tRPC + Express | Type-safe API with procedural endpoints |
| Frontend | React + Vite + TypeScript | Modern SPA with hot reload |
| Validation | Zod | Runtime validation with inferred types |
| Auth | JWT/OAuth | Secure authentication with RBAC |
| Jobs | BullMQ + Redis | Background job processing and scheduling |
| Deployment | Docker + Docker Compose | Containerized services |

### Core Components

#### 1. Event System
- Centralized EventService using BullMQ
- Event emission with metadata (source, tenantId, timestamp)
- Worker-based event processing
- Event routing by patterns (subscription.*, component.*, etc.)

#### 2. Security Layer
- AES-256-GCM encryption for secrets at rest
- JWT-based authentication
- Role-based access control
- Comprehensive audit logging

#### 3. Database Layer
- PostgreSQL with Drizzle ORM
- Multi-tenant data isolation
- Optimized query patterns
- Migration management

#### 4. Job Processing
- BullMQ for background tasks
- Multiple queue types for different workloads
- Retry strategies with exponential backoff
- Job monitoring and management

#### 5. Plugin Architecture
- Runtime plugin loading
- Standardized interfaces
- Hook system for event integration
- UI slot injection capability

## Service Architecture

### Core Services

#### 1. Subscription Service
- Lifecycle management
- Billing cycle handling
- Proration calculations
- State change tracking

#### 2. Payment Service
- Multi-gateway support
- Transaction processing
- Refund handling
- Payment method management

#### 3. Provisioning Service
- Provider adapter system
- Health monitoring
- Async operation handling
- Plugin-based extensibility

#### 4. Support Service
- Ticket lifecycle management
- SLA monitoring
- Automation rules
- Email integration

### Integration Points

#### 1. External Services
- Payment gateways (Stripe, etc.)
- Hosting control panels (cPanel/WHM)
- Email delivery services
- Domain registrars

#### 2. Internal Communication
- Event-driven architecture
- Type-safe API contracts
- Real-time updates
- Cache management

## Development Architecture

### Project Structure
```
panel1/
├── apps/
│   ├── api/          # Backend server
│   └── web/          # Frontend application
├── packages/
│   ├── shared-types/ # Shared schemas and types
│   ├── plugin-sdk/   # Plugin development kit
│   └── plugin-cli/   # Plugin development tools
├── plugins/          # Plugin directory
└── docs/            # Documentation
```

### Development Workflow
1. Infrastructure services via Docker Compose
2. Local development with hot reload
3. Type-safe development with TypeScript
4. Automated testing and validation

## Deployment Architecture

### Container Strategy
- PostgreSQL container for database
- Redis container for job processing
- MailHog for email testing
- Application runs locally for development

### Production Considerations
- Database backups and replication
- Redis clustering for job processing
- Load balancing and scaling
- Monitoring and alerting

## Security Architecture

### Data Protection
- AES-256-GCM encryption for sensitive data
- Secure key management
- Data isolation between tenants
- Audit trail for sensitive operations

### Authentication & Authorization
- JWT-based authentication
- Role-based access control
- Permission granularity
- Session management

### API Security
- Rate limiting
- Input validation
- CORS policies
- Error handling

## Future Architecture Considerations

### Planned Enhancements
1. Advanced domain management system
2. SSL certificate automation
3. Enhanced analytics and reporting
4. White-label capabilities

### Scalability Plans
1. Horizontal scaling strategies
2. Cache optimization
3. Query performance tuning
4. Load distribution 