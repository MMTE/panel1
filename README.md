# Panel1 - Modern Billing & Provisioning Platform

## Overview

Panel1 is an enterprise-grade billing and provisioning platform designed for modern hosting providers. It offers comprehensive features including subscription management, automated provisioning, multi-tenant support, and extensive plugin capabilities.

## Current Implementation Status

### 🟢 Production-Ready Features (95%+ Complete)

1. **Authentication & Security**
   - Production JWT system with secure session management
   - Complete audit logging
   - Encryption service for secrets at rest (AES-256-GCM)

2. **Invoice System**
   - Sequential numbering with tenant isolation
   - PDF generation with professional layouts
   - Multi-currency support (28+ currencies)
   - Automated email notifications

3. **Payment Processing**
   - Stripe integration with 3D Secure
   - Multi-gateway architecture
   - Refund system (full/partial)
   - Payment retry logic

4. **Subscription Automation**
   - BullMQ + Redis job processing
   - Advanced dunning management
   - Proration calculations
   - State change tracking

5. **Provisioning Engine**
   - Plugin architecture
   - cPanel/WHM integration
   - Health monitoring
   - Async job processing

6. **Plugin System**
   - Complete SDK with TypeScript
   - CLI tools
   - Runtime loading
   - UI slot injection

7. **Multi-Tenant Architecture**
   - Complete tenant isolation
   - Branding support
   - Per-tenant configuration

8. **Support System**
   - Ticket lifecycle management
   - SLA management
   - Knowledge base
   - Email integration

### 🟡 In Development (60-80% Complete)

1. **Catalog System**
   - ✅ Product listing and deletion
   - ✅ Basic component registration
   - 🚧 ProductBuilder form (in progress)
   - 🚧 Save/update workflow (pending)

2. **Role-Based Access Control (70%)**
   - ✅ Basic role separation
   - ✅ Authentication middleware
   - 🚧 Granular permissions
   - 🚧 Multi-level access controls

3. **Internationalization (60%)**
   - ✅ i18n framework
   - ✅ RTL support
   - 🚧 Language pack system
   - 🚧 Translation management

## Getting Started

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- PostgreSQL 15+
- Redis 6+

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/your-org/panel1-bolt.git
cd panel1-bolt
```

2. Start infrastructure services:
```bash
docker compose up -d
```

3. Install dependencies:
```bash
npm install
```

4. Start development server:
```bash
npm run dev
```

## Project Structure

- `apps/api/` - Backend API server
- `apps/web/` - Frontend React application
- `packages/` - Shared packages and SDKs
- `plugins/` - Official and example plugins
- `docs/` - Detailed documentation

## Documentation

Detailed documentation is available in the `docs/` directory:

- [Architecture Guide](docs/ARCHITECTURE.md)
- [Plugin Development](docs/PLUGIN_DEVELOPMENT.md)
- [API Standards](docs/API_STANDARDS.md)
- [Security Guidelines](docs/SECURITY.md)

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.