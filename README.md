# Panel1 🚀

> **The Developer-First Billing & Provisioning Platform**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![tRPC](https://img.shields.io/badge/tRPC-2596BE?logo=trpc&logoColor=white)](https://trpc.io/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?logo=Prisma&logoColor=white)](https://prisma.io/)

Panel1 is a **fully open-source, modular billing and provisioning platform** designed for hosting providers, SaaS companies, and developers who need a modern alternative to legacy billing systems like WHMCS.

## 🎯 Vision

Build a **headless, type-safe, plugin-extensible** platform that puts developers first while providing enterprise-grade billing and provisioning capabilities.

## ✨ Key Features

- 🔧 **API-First Architecture** - Headless backend with tRPC and end-to-end type safety
- 🧩 **Modular Plugin System** - Extensible architecture with plugin hooks and marketplace
- 🛡️ **Enterprise Security** - JWT/OAuth authentication, RBAC, and audit trails
- 💳 **Multi-Gateway Billing** - Stripe, PayPal, and custom payment processors
- 📄 **Professional Invoice System** - Sequential numbering, PDF generation, automated emails
- 🌍 **i18n & Localization** - RTL support, multiple currencies, comprehensive localization
- 🎨 **Modern UI** - React-based admin panel with customizable themes
- 📊 **Standards Compliant** - International invoice standards, audit trails, regional compliance

## 🏗️ Architecture

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Database** | PostgreSQL + Prisma | Type-safe ORM with auto-generated types |
| **Backend** | tRPC + Express/Fastify | Type-safe API with procedural endpoints |
| **Frontend** | React + Vite + TypeScript | Modern SPA with hot reload |
| **Validation** | Zod | Runtime validation with inferred types |
| **Auth** | JWT/OAuth | Secure authentication with SSO support |
| **Deployment** | Docker + Docker Compose | Simple self-hosting with optional Helm |

### Monorepo Structure

```
panel1/
├── apps/
│   ├── api/          # tRPC backend server
│   └── web/          # React frontend application
├── packages/
│   ├── shared-types/ # Shared Zod schemas and types
│   └── plugin-sdk/   # Plugin development kit
└── docs/            # Documentation and guides
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn
- PostgreSQL 14+
- Docker (optional, for containerized setup)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/panel1-org/panel1.git
   cd panel1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Initialize database**
   ```bash
   cd apps/api
   npx prisma migrate dev
   npx prisma generate
   ```

5. **Start development servers**
   ```bash
   # From project root
   npm run dev
   
   # Or individually:
   # Terminal 1: Backend (http://localhost:3001)
   cd apps/api && npm run dev
   
   # Terminal 2: Frontend (http://localhost:5173)
   cd apps/web && npm run dev
   ```

## 📊 Invoice System Highlights

Panel1 features a **comprehensive invoice lifecycle system** that rivals enterprise billing platforms:

### ✅ Professional Invoice Management
- **Sequential numbering** with audit compliance (INV-2025-000001)
- **Multi-tenant isolation** - each tenant maintains separate invoice sequences
- **PDF generation** with professional layouts and company branding
- **Automated email notifications** for all invoice lifecycle events

### ✅ Standards Compliance (85% → 95% target)
- **Database design** - ACID transactions, proper decimal precision
- **International formats** - Support for US, EU, UK, CA, AU standards
- **Tax compliance** - Regional tax display and calculation
- **Audit trails** - Complete invoice history and status tracking

### ✅ Technical Architecture
- **Event-driven design** - Automated notifications using existing infrastructure
- **Type-safe APIs** - Full tRPC integration with TypeScript
- **Atomic operations** - Database transactions ensure data consistency
- **Scalable design** - Optimized for high-volume invoice processing

**Comparison vs WHMCS**: Panel1 offers superior technical architecture with modern development practices while maintaining feature parity in billing capabilities.

## 📋 Roadmap

### 🎯 MVP (v0.1.x) - Core Foundation
- [x] Project structure and monorepo setup
- [x] Authentication & user management
- [x] **Professional Invoice System** - Sequential numbering, PDF generation, email notifications
- [x] **Standards Compliance** - International invoice standards, audit trails, regional support
- [x] Multi-tenant architecture with tenant isolation
- [x] Event-driven invoice lifecycle management
- [x] Stripe integration foundation
- [x] Admin panel interface
- [x] Client management
- [x] API framework with tRPC

### 🚀 Enhanced Features (v0.2.x - v0.5.x)
- [ ] Provisioning engine (cPanel, Docker, custom)
- [ ] Internationalization (i18n) with RTL support
- [ ] Tax handling and coupon system
- [ ] Role-based access control (RBAC)
- [ ] Support ticket system
- [ ] Webhook system
- [ ] Email notifications

### 🌟 Production Launch (v1.0)
- [ ] Multi-tenant SaaS mode
- [ ] Plugin marketplace
- [ ] Theming engine
- [ ] CLI tooling
- [ ] Complete documentation

## 📋 Documentation

- **[Standards Compliance Assessment](docs/STANDARDS_COMPLIANCE.md)** - Detailed analysis of invoice system compliance
- **[Plugin Development Guide](docs/PLUGIN_DEVELOPMENT.md)** - Build custom plugins for Panel1
- **[API Documentation](docs/API.md)** - Complete API reference (coming soon)

## 🤝 Contributing

We welcome contributions from the community! Please read our [Contributing Guide](.github/CONTRIBUTING.md) to get started.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

Panel1 is open-source software licensed under the [MIT License](LICENSE).

## 🌟 Community

- **GitHub Discussions**: [Join the conversation](https://github.com/panel1-org/panel1/discussions)
- **Discord**: [Join our Discord server](https://discord.gg/panel1)
- **Twitter**: [@Panel1Platform](https://twitter.com/Panel1Platform)

## 🙏 Acknowledgments

Panel1 is built with love by the open-source community. Special thanks to all contributors who help make this project possible.

---

**Built with ❤️ by developers, for developers.**