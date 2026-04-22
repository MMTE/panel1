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

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — authoritative architectural specification
- [docs/roadmap.md](./docs/roadmap.md) — migration roadmap and execution tracker

## License

MIT
