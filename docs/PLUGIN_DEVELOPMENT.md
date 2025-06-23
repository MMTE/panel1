# Panel1 Plugin Development Guide

Welcome to the **Panel1 Plugin Development Guide**. This comprehensive guide covers everything you need to create, configure, register, test, and publish plugins for Panel1, our open-source billing and provisioning platform. With plugins, you can extend core functionality, integrate third-party services, and customize the user experience—all without touching the core codebase.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Core Concepts](#core-concepts)
3. [Plugin Manifest (`plugin.json`)](#plugin-manifest-pluginjson)
4. [Directory Structure & Boilerplate](#directory-structure--boilerplate)
5. [Building Your First Plugin](#building-your-first-plugin)
   * Lifecycle Methods
   * Event Hooks
   * Custom API Routes
   * UI Slot Injection
6. [Configuration & Persistence](#configuration--persistence)
7. [Asset Hosting](#asset-hosting)
8. [CLI Tooling & Scaffold](#cli-tooling--scaffold)
9. [Testing Plugins](#testing-plugins)
10. [Publishing & Distribution](#publishing--distribution)
11. [Best Practices & Advanced Patterns](#best-practices--advanced-patterns)

---

## Prerequisites

Before you begin, ensure you have:

* **Node.js ≥ 18** and **npm** or **yarn**
* A working **Panel1** instance with plugin loading enabled
* Familiarity with **TypeScript**, **React**, and basic **Zod** schemas
* **Git** and a code editor (VSCode recommended)

Install the core SDK in your plugin project:

```bash
npm install @panel1/plugin-sdk zod
# or
yarn add @panel1/plugin-sdk zod
```

---

## Core Concepts

1. **Plugin Manifest**: `plugin.json` declares metadata, compatibility, and dependencies.
2. **Plugin Entry**: `src/index.ts` exports the plugin object via `createPlugin()`.
3. **PluginRegistry**: Scans, validates, and manages plugin lifecycle in Panel1.
4. **Hooks**: Event-driven callbacks for system events (e.g., `invoice.paid`).
5. **Routes**: Custom backend endpoints under `/plugins/{plugin}/...`.
6. **UI Slots**: Named injection points in the React frontend.
7. **Settings Store**: JSON-based persistence for plugin configurations.
8. **Asset Host**: Serve plugin static files (icons, CSS, etc.) from `/plugins/{plugin}/assets`.

---

## Plugin Manifest (`plugin.json`)

The manifest must be located at the plugin root:

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "An example plugin for Panel1",
  "author": "Your Name <you@example.com>",
  "panel1": ">=0.2.0 <0.3.0",
  "dependencies": {
    "analytics-plugin": "^1.2.0"
  },
  "permissions": ["read:users", "write:invoices"],
  "uiSlots": ["admin.dashboard.widgets"],
  "apiRoutes": ["GET /status", "POST /webhook"]
}
```

* **panel1** supports semver ranges for compatibility checks.
* **dependencies** ensure correct load order; unresolved dependencies block plugin enable.
* **permissions** declare what the plugin needs access to.
* **uiSlots** and **apiRoutes** document what the plugin provides.

Validate at runtime using Zod's `PluginMetadataSchema`.

---

## Directory Structure & Boilerplate

```
my-plugin/
├── plugin.json
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── hooks.ts        # Optional: split hooks here
│   ├── routes.ts       # Optional: separate routes file
│   └── components/     # Optional: custom React components
│       └── MyWidget.tsx
├── assets/
│   ├── icon.svg
│   └── styles.css
├── tests/
│   └── index.test.ts
└── README.md
```

Scaffold your project:

```bash
npm install -g @panel1/plugin-cli
panel1 plugin scaffold my-plugin
cd my-plugin
npm install
```

This creates `plugin.json`, `src/index.ts`, and example files.

---

## Building Your First Plugin

In `src/index.ts`:

```ts
import React from 'react';
import {
  createPlugin,
  definePluginConfig,
  PluginContext,
  Plugin
} from '@panel1/plugin-sdk';
import { z } from 'zod';

const ConfigSchema = definePluginConfig(
  z.object({ 
    apiKey: z.string(), 
    enabled: z.boolean().default(true) 
  })
);

const MyPlugin: Plugin = createPlugin({
  metadata: {
    name: 'my-plugin',
    version: '0.1.0',
    description: 'An example plugin',
    author: 'Your Name',
    panel1: '>=0.2.0',
    permissions: ['read:users'],
    uiSlots: ['admin.dashboard.widgets'],
    apiRoutes: ['GET /status']
  },
  configSchema: ConfigSchema,

  // Lifecycle Hooks
  async onInstall(ctx: PluginContext) {
    await ctx.createSettings({ apiKey: '', enabled: false });
    ctx.auditLogger.logPluginAction('install', ctx.pluginId);
  },
  async onEnable(ctx) {
    console.log('MyPlugin enabled');
    ctx.auditLogger.logPluginAction('enable', ctx.pluginId);
  },
  async onDisable(ctx) {
    console.log('MyPlugin disabled');
    ctx.auditLogger.logPluginAction('disable', ctx.pluginId);
  },
  async onUninstall(ctx) {
    await ctx.deleteSettings();
    ctx.auditLogger.logPluginAction('uninstall', ctx.pluginId);
  },

  // Event Hooks
  hooks: {
    'invoice.paid': async ({ invoice, context }) => {
      // Example: send data to external API
      const config = await context.getPluginConfig('my-plugin');
      if (config.enabled && config.apiKey) {
        await fetch('https://api.example.com/notify', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.apiKey}` },
          body: JSON.stringify({ invoiceId: invoice.id })
        });
        
        // Emit custom event
        await context.eventEmitter.emit('my-plugin.notification.sent', {
          invoiceId: invoice.id,
          timestamp: new Date().toISOString()
        });
      }
    }
  },

  // Custom API Routes
  routes: {
    'GET /status': async (req, res, ctx) => {
      const settings = await ctx.getPluginConfig('my-plugin');
      return res.json({ 
        plugin: 'my-plugin',
        enabled: settings.enabled,
        timestamp: new Date().toISOString()
      });
    },
    
    'POST /webhook': async (req, res, ctx) => {
      const { event, data } = req.body;
      
      // Log the webhook event
      ctx.auditLogger.logPluginAction('webhook_received', ctx.pluginId, {
        event,
        data
      });
      
      return res.json({ success: true });
    }
  },

  // UI Slot Injection
  components: {
    'admin.dashboard.widgets': () => React.createElement('div', {
      className: 'bg-white rounded-lg shadow p-6'
    }, [
      React.createElement('h3', {
        key: 'title',
        className: 'text-lg font-semibold text-gray-900 mb-2'
      }, 'My Plugin Widget'),
      React.createElement('p', {
        key: 'content',
        className: 'text-gray-600'
      }, 'This widget is provided by my-plugin.')
    ])
  }
});

export default MyPlugin;
```

### Lifecycle Methods

* **onInstall**: Setup defaults, DB migrations, initial configuration
* **onEnable**: Activate jobs, schedule tasks, register event listeners
* **onDisable**: Pause jobs, clean caches, unregister listeners
* **onUninstall**: Remove data, cleanup resources

### Event Hooks

Map core events to plugin logic. Available hooks include:

- **User Events**: `user.created`, `user.updated`, `user.deleted`, `user.loggedIn`, `user.loggedOut`
- **Client Events**: `client.created`, `client.updated`, `client.deleted`
- **Invoice Events**: `invoice.created`, `invoice.paid`, `invoice.overdue`, `invoice.cancelled`
- **Subscription Events**: `subscription.created`, `subscription.updated`, `subscription.cancelled`, `subscription.upgraded`, `subscription.downgraded`
- **Payment Events**: `payment.completed`, `payment.failed`, `payment.refunded`
- **System Events**: `system.startup`, `system.shutdown`
- **Plugin Events**: `plugin.installed`, `plugin.uninstalled`, `plugin.enabled`, `plugin.disabled`
- **Webhook Events**: `webhook.delivered`, `webhook.failed`
- **Audit Events**: `audit.logged`

### Custom Routes

Expose new endpoints; use `ctx` for auth, DB access, and audit logging.

### UI Slots

Inject React components into core UI. Available slots include:

- **Admin Dashboard**: `admin.dashboard.widgets`, `admin.dashboard.quick.actions`
- **Admin Header**: `admin.header.left`, `admin.header.right`
- **Admin Navigation**: `admin.nav.sidebar`, `admin.nav.footer`
- **Admin Pages**: `admin.page.top`, `admin.page.bottom`
- **User Management**: `admin.page.users.header.actions`, `admin.page.users.list.actions`, `admin.page.users.list.footer`

---

## Configuration & Persistence

Persist settings via SDK:

```ts
// Read config
const cfg = await ctx.getPluginConfig('my-plugin');

// Update config
await ctx.setPluginConfig('my-plugin', { ...cfg, apiKey: 'new-key' });

// Create initial settings (usually in onInstall)
await ctx.createSettings({
  apiKey: '',
  enabled: false,
  webhookUrl: ''
});

// Delete all settings (usually in onUninstall)
await ctx.deleteSettings();
```

Internally stores JSON in `plugin_settings` table with automatic audit logging.

---

## Asset Hosting

Serve assets under `/plugins/{plugin}/assets`:

```ts
import { getPluginAssetUrl } from '@panel1/plugin-sdk';

const icon = getPluginAssetUrl('my-plugin', 'icon.svg');
const stylesheet = getPluginAssetUrl('my-plugin', 'styles.css');
```

Ensure `assets/` files are copied to the build output.

---

## CLI Tooling & Scaffold

Install the CLI globally:

```bash
npm install -g @panel1/plugin-cli
```

Commands:

* `panel1 plugin scaffold <name>`: Create new plugin boilerplate
* `panel1 plugin build`: Compile TypeScript to JS in `dist/`
* `panel1 plugin build --watch`: Build in watch mode for development
* `panel1 plugin validate`: Check manifest and schema
* `panel1 plugin test`: Run plugin tests
* `panel1 plugin install <source>`: Install plugin from various sources
* `panel1 plugin publish`: Publish plugin to marketplace

### Scaffold Templates

Choose from multiple templates:

- **Basic Plugin**: Simple plugin with lifecycle methods and basic hooks
- **UI Widget Plugin**: Plugin focused on dashboard widgets and UI components
- **API Integration Plugin**: Plugin for integrating with external APIs
- **Billing Hook Plugin**: Plugin for handling billing events and workflows

---

## Testing Plugins

### Unit Tests

Use **Vitest** for TypeScript tests with mocked `PluginContext`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createPluginContext } from '@panel1/plugin-sdk';
import MyPlugin from '../src/index';

describe('MyPlugin hooks', () => {
  it('should handle invoice.paid', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    const ctx = createPluginContext('my-plugin', {
      getPluginConfig: vi.fn().mockResolvedValue({ 
        enabled: true, 
        apiKey: 'test-key' 
      }),
      eventEmitter: {
        emit: vi.fn()
      }
    });

    const hook = MyPlugin.hooks?.['invoice.paid'];
    expect(hook).toBeDefined();

    if (hook) {
      await hook({
        invoice: { id: 'inv_123', total: 100 },
        context: ctx,
      });
    }

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/notify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-key' },
        body: JSON.stringify({ invoiceId: 'inv_123' })
      })
    );
  });
});
```

### Integration Tests

Test plugin installation and UI injection:

```ts
import { test, expect } from '@playwright/test';

test('plugin installs and shows widget', async ({ page }) => {
  // Install plugin
  await page.goto('/admin/plugins');
  await page.click('[data-testid="install-my-plugin"]');
  
  // Check dashboard widget appears
  await page.goto('/admin');
  await expect(page.locator('[data-testid="my-plugin-widget"]')).toBeVisible();
});
```

### Running Tests

```bash
# Run all tests
panel1 plugin test

# Run tests in watch mode
panel1 plugin test --watch

# Run tests with coverage
panel1 plugin test --coverage
```

---

## Publishing & Distribution

### 1. Prepare for Release

```bash
# Validate plugin
panel1 plugin validate

# Run tests
panel1 plugin test

# Build for production
panel1 plugin build
```

### 2. Publish to Marketplace

```bash
# Dry run to see what would be published
panel1 plugin publish --dry-run

# Publish to npm and marketplace
panel1 plugin publish
```

### 3. Distribution Methods

Users can install via:

```bash
# From npm
panel1 plugin install my-plugin

# From GitHub
panel1 plugin install github:username/my-plugin

# From URL
panel1 plugin install https://example.com/my-plugin.zip

# From local path
panel1 plugin install ./my-plugin
```

---

## Best Practices & Advanced Patterns

### Security

* **Validate Input**: Use Zod schemas for all route inputs
* **Audit Everything**: Use `ctx.auditLogger` for compliance tracking
* **Permissions**: Declare required permissions in manifest
* **Sanitize Output**: Prevent XSS in UI components

```ts
// Route input validation
const InputSchema = z.object({
  email: z.string().email(),
  amount: z.number().positive()
});

routes: {
  'POST /process': async (req, res, ctx) => {
    const input = InputSchema.parse(req.body);
    
    // Log the action
    ctx.auditLogger.logPluginAction('process_request', ctx.pluginId, input);
    
    // Process safely
    return res.json({ success: true });
  }
}
```

### Performance

* **Avoid Blocking**: Use background jobs for heavy operations
* **Cache Data**: Store frequently accessed data in plugin settings
* **Optimize Queries**: Use efficient database queries
* **Lazy Loading**: Load UI components only when needed

### Error Handling

* **Graceful Degradation**: Handle errors without breaking core functionality
* **Logging**: Use structured logging for debugging
* **User Feedback**: Provide clear error messages

```ts
hooks: {
  'invoice.paid': async ({ invoice, context }) => {
    try {
      await processInvoice(invoice);
    } catch (error) {
      context.logger.error('Failed to process invoice:', error);
      
      // Don't throw - let other plugins continue
      context.auditLogger.logPluginAction('error', context.pluginId, {
        error: error.message,
        invoiceId: invoice.id
      });
    }
  }
}
```

### Internationalization

Use the translation system for user-facing text:

```ts
components: {
  'admin.dashboard.widgets': () => {
    const { translate } = usePluginContext();
    
    return React.createElement('div', {}, [
      React.createElement('h3', {}, translate('my-plugin.widget.title')),
      React.createElement('p', {}, translate('my-plugin.widget.description'))
    ]);
  }
}
```

### Advanced UI Patterns

* **Conditional Rendering**: Show components based on user permissions
* **State Management**: Use React hooks for component state
* **Event Communication**: Use plugin events for component communication

### Plugin Dependencies

Declare and manage plugin dependencies:

```json
{
  "dependencies": {
    "analytics-plugin": "^1.2.0",
    "notification-plugin": ">=2.0.0 <3.0.0"
  }
}
```

### Versioning Strategy

* **Semantic Versioning**: Use semver for plugin versions
* **Breaking Changes**: Increment major version for breaking changes
* **Migration Scripts**: Provide migration logic for major updates

---

## Infrastructure Extension Plan

Panel1's core infrastructure now supports key enterprise capabilities. The plugin system provides:

### 1. Multi‑Tenant Support
- Plugins automatically inherit tenant isolation
- `ctx.tenantId` available in plugin context
- Settings scoped by tenant

### 2. Event-Driven Architecture
- Comprehensive event system with 20+ event types
- Webhook dispatch for external integrations
- Audit logging for compliance

### 3. Advanced Security
- Permission-based access control
- Audit trails for all plugin actions
- Row-level security in database

### 4. Developer Experience
- Full CLI tooling for development lifecycle
- Multiple plugin templates
- Comprehensive testing framework
- Hot reload during development

### 5. Marketplace Ecosystem
- Plugin discovery and installation
- User reviews and ratings
- Download statistics
- Verified plugin program

---

This plugin system provides a solid foundation for building a vibrant ecosystem around Panel1, enabling developers to extend the platform while maintaining security, performance, and user experience standards.