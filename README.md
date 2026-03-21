# Panel1

> The Developer-First Billing & Provisioning Platform — a modern open-source WHMCS replacement.

## Quick Start

```bash
# Start infrastructure (PostgreSQL, Redis, MailHog)
docker compose up -d

# Install dependencies
npm install

# Start development servers (API + Web)
npm run dev
```

- API: http://localhost:3001
- Web: http://localhost:5173
- MailHog UI: http://localhost:8025

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full architectural specification.

## License

MIT
