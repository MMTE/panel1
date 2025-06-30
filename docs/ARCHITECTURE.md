# Panel1 Architecture Overview

This document provides a high-level overview of the Panel1 system architecture, its key components, and the technologies used.

## Core Philosophy

The architecture is designed around a **modular, scalable, and plugin-driven** philosophy. The goal is to create a robust core system for billing and provisioning that can be easily extended and customized through plugins, without modifying the core codebase.

## System Components

Panel1 is a monorepo managed with `pnpm` and `Turborepo`, containing two primary applications:

1.  **`apps/api` (Backend)**: A Node.js application built with **tRPC** that serves as the system's backbone. It handles:
    -   Business logic for all core features (invoicing, payments, subscriptions).
    -   Database interactions via **Drizzle ORM**.
    -   User authentication and authorization (RBAC).
    -   Job scheduling and processing with **BullMQ and Redis**.
    -   Serving the tRPC API to the frontend.

2.  **`apps/web` (Frontend)**: A **React (Vite)** single-page application that provides the user interface for both administrators and clients. It features:
    -   A modern UI built with **Tailwind CSS** and **Shadcn UI**.
    -   Type-safe API communication with the backend via `tRPC`.
    -   A plugin-friendly UI that allows new pages and components to be dynamically registered.
    -   Client-side state management and logic for interacting with the core system.

## Technology Stack

| Category          | Technology                                       | Notes                                                              |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| Monorepo          | `pnpm`, `Turborepo`                              | For managing workspaces and optimizing build/test pipelines.       |
| Backend Framework | `tRPC`                                           | For creating end-to-end typesafe APIs without code generation.     |
| Frontend          | `React`, `Vite`, `TypeScript`                    | For a fast, modern, and type-safe web application.                 |
| Database          | `PostgreSQL`                                     | A robust and scalable relational database.                         |
| ORM               | `Drizzle ORM`                                    | A modern, lightweight, and type-safe TypeScript ORM.               |
| Job Queue         | `BullMQ`, `Redis`                                | For handling background jobs like subscription renewals and emails. |
| UI                | `Tailwind CSS`, `Shadcn UI`                      | For building a modern and consistent user interface.               |
| Authentication    | `JWT` (JSON Web Tokens)                          | For secure and stateless session management.                       |

## Database Schema

The database schema is defined and managed using Drizzle ORM. The schema files are located in `apps/api/src/db/schema/`. Key entities include:

-   `users`, `roles`, `permissions`: For the RBAC system.
-   `tenants`: For multi-tenancy and data isolation.
-   `clients`: The end-customers of the hosting provider.
-   `invoices`, `payments`: For the billing system.
-   `subscriptions`: For recurring billing and services.
-   `products`, `components`: For the product catalog.
-   `plugins`: For managing installed plugins.

Migrations are handled by `drizzle-kit` and are located in `apps/api/src/db/migrations/`.

## Plugin Architecture

The plugin system is a cornerstone of Panel1. It allows for extending the platform's functionality in a safe and isolated manner.

-   **Plugin Manager**: Located in `apps/api/src/lib/plugins`, it handles the loading, registration, and lifecycle of plugins.
-   **Plugin SDK**: A dedicated package (`packages/plugin-sdk`) provides types and interfaces for developing new plugins.
-   **UI Integration**: The frontend's `UISlotManager` (`apps/web/src/lib/plugins/UISlotManager.tsx`) allows plugins to inject custom UI components and routes into the main application.

This architecture ensures that Panel1 remains a flexible and adaptable platform for a wide range of hosting and service-based businesses.

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