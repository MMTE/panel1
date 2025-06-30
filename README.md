# Panel1 - Modern Hosting Control Panel

Panel1 is a next-generation hosting control panel built with modern technologies and a focus on extensibility.

## Version 0.1.0 Release Notes

This is the initial release of Panel1, focusing on core functionality and establishing the foundation for future development.

### Key Features

- **Multi-tenant Architecture**: Complete isolation with tenant management and branding support
- **Professional Invoice System**: Sequential numbering, PDF generation, multi-currency support
- **Advanced Payment Processing**: Stripe integration, multi-gateway architecture, refund system
- **Subscription Automation**: BullMQ + Redis job processing, dunning management
- **Provisioning Engine**: cPanel/WHM integration, plugin architecture
- **Plugin System**: Complete SDK, CLI tools, runtime loading
- **Support System**: Ticket lifecycle management, SLA management

### Known Limitations

1. **Type System**: Some TypeScript strict checks are temporarily disabled for this release. See `docs/TECHNICAL_DEBT.md` for details.
2. **Role-based Access**: Basic roles implemented, granular permissions in development
3. **Internationalization**: Framework ready, translations in progress

### Technology Stack

- **Backend**: Node.js with TypeScript
- **Frontend**: React with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **API Layer**: tRPC
- **Job Processing**: BullMQ + Redis
- **Container Support**: Docker for development

### Quick Start

1. Clone the repository:
```bash
git clone https://github.com/yourusername/panel1-bolt.git
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

4. Start development servers:
```bash
npm run dev
```

### Development Environment

The development environment uses Docker for infrastructure services:
- PostgreSQL
- Redis
- MailHog

The application code runs locally for fast development iteration.

### Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Standards](docs/API_STANDARDS.md)
- [Plugin Development](docs/PLUGIN_DEVELOPMENT.md)
- [Security Guidelines](docs/SECURITY.md)
- [Technical Debt](docs/TECHNICAL_DEBT.md)

### Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### License

This project is licensed under the [MIT License](LICENSE).