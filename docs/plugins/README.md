# Panel1 Plugin Development Guide

Welcome to the **Panel1 Plugin Development Guide**. This comprehensive guide covers everything you need to create, configure, and integrate plugins with Panel1, our open-source billing and provisioning platform.

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Plugin Architecture](#plugin-architecture)
4. [Development Workflow](#development-workflow)
5. [API Reference](#api-reference)
6. [Examples](#examples)
7. [Best Practices](#best-practices)
8. [Publishing](#publishing)

## Introduction

Panel1's plugin system allows you to extend the platform's functionality without modifying the core codebase. Plugins can:

- React to system events (hooks)
- Provide custom API endpoints
- Inject UI components
- Store configuration data
- Integrate with external services

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- TypeScript knowledge
- React familiarity (for UI components)
- Panel1 development environment

### Installation

```bash
npm install @panel1/plugin-sdk
```

### Your First Plugin

Create a new plugin project:

```bash
mkdir my-plugin
cd my-plugin
npm init -y
npm install @panel1/plugin-sdk zod react
```

Create `plugin.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My first Panel1 plugin",
  "author": "Your Name",
  "panel1": ">=0.2.0"
}
```

Create `src/index.ts`:

```typescript
import { createPlugin, definePluginConfig, z } from '@panel1/plugin-sdk';

const ConfigSchema = definePluginConfig(
  z.object({
    enabled: z.boolean().default(true),
    apiKey: z.string().optional(),
  })
);

export default createPlugin({
  metadata: {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'My first Panel1 plugin',
    author: 'Your Name',
    panel1: '>=0.2.0',
  },
  configSchema: ConfigSchema,

  async onEnable(ctx) {
    ctx.logger.info('My plugin is enabled!');
  },

  hooks: {
    'invoice.paid': async ({ invoice, context }) => {
      context.logger.info(`Invoice ${invoice.id} was paid!`);
    },
  },
});
```

## Plugin Architecture

### Core Components

1. **Plugin Metadata** - Basic information about your plugin
2. **Configuration Schema** - Zod schema for settings validation
3. **Lifecycle Methods** - Install, enable, disable, uninstall hooks
4. **Event Hooks** - React to Panel1 system events
5. **API Routes** - Custom backend endpoints
6. **UI Components** - Frontend component injection

### Plugin Context

Every plugin receives a context object with access to:

- Logger for debugging
- Supabase client for database access
- Configuration management
- Translation utilities
- Event emission

## Development Workflow

### 1. Setup Development Environment

```bash
# Clone plugin template
git clone https://github.com/panel1-org/plugin-template my-plugin
cd my-plugin
npm install
```

### 2. Develop Your Plugin

- Implement lifecycle methods
- Add event hooks
- Create API routes
- Build UI components
- Write tests

### 3. Test Your Plugin

```bash
# Run tests
npm test

# Test in Panel1 development environment
npm run dev
```

### 4. Build and Package

```bash
# Build for production
npm run build

# Package for distribution
npm run package
```

## API Reference

### Plugin Interface

```typescript
interface Plugin {
  metadata: PluginMetadata;
  configSchema?: z.ZodObject<any>;
  onInstall?(ctx: PluginContext): Promise<void>;
  onEnable?(ctx: PluginContext): Promise<void>;
  onDisable?(ctx: PluginContext): Promise<void>;
  onUninstall?(ctx: PluginContext): Promise<void>;
  hooks?: PluginHooks;
  routes?: PluginRoutes;
  components?: PluginUIComponents;
}
```

### Available Hooks

- `user.created`, `user.updated`, `user.deleted`
- `client.created`, `client.updated`, `client.deleted`
- `invoice.created`, `invoice.paid`, `invoice.overdue`
- `subscription.created`, `subscription.cancelled`
- `payment.completed`, `payment.failed`

### UI Slots

- `admin.dashboard.widgets` - Admin dashboard widgets
- `admin.nav.sidebar` - Admin navigation items
- `client.dashboard.widgets` - Client dashboard widgets
- `settings.plugin.page` - Plugin settings pages

## Examples

See the `examples/plugins/` directory for complete plugin examples:

- **Analytics Plugin** - Event tracking and dashboard widgets
- **Notification Plugin** - Email and SMS notifications
- **Backup Plugin** - Automated backup management

## Best Practices

### Security

- Validate all inputs with Zod schemas
- Use environment variables for sensitive data
- Implement proper error handling
- Follow principle of least privilege

### Performance

- Avoid blocking operations in hooks
- Use background jobs for heavy tasks
- Cache frequently accessed data
- Optimize database queries

### User Experience

- Provide clear configuration options
- Include helpful error messages
- Follow Panel1 design patterns
- Support internationalization

### Code Quality

- Write comprehensive tests
- Use TypeScript strictly
- Follow consistent naming conventions
- Document your code thoroughly

## Publishing

### 1. Prepare for Release

- Update version in `plugin.json`
- Write changelog
- Test thoroughly
- Update documentation

### 2. Publish to Registry

```bash
# Publish to npm
npm publish

# Or submit to Panel1 marketplace
panel1 plugin submit
```

### 3. Distribution

Users can install your plugin via:

```bash
# From npm
panel1 plugin install my-plugin

# From GitHub
panel1 plugin install github:username/my-plugin

# From URL
panel1 plugin install https://example.com/my-plugin.zip
```

## Support

- [Plugin SDK Documentation](https://docs.panel1.dev/plugins/sdk)
- [Community Discord](https://discord.gg/panel1)
- [GitHub Discussions](https://github.com/panel1-org/panel1/discussions)
- [Plugin Examples](https://github.com/panel1-org/plugin-examples)

---

Happy plugin development! 🚀