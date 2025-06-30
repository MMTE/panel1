# Plugin Development Guide

This guide provides developers with the necessary information to build, test, and publish plugins for Panel1.

## Overview

The Panel1 plugin system allows you to extend and customize the platform's functionality. Plugins can introduce new features, integrate with third-party services, or modify existing behaviors. They are first-class citizens in the Panel1 ecosystem.

## Core Concepts

-   **Isolation**: Plugins operate in an isolated manner to ensure they do not interfere with the core system's stability.
-   **Lifecycle Hooks**: Plugins can execute code at specific points in the application lifecycle (e.g., on activation, deactivation).
-   **Extensibility**: Plugins can register new API endpoints, add UI components, and listen to system-wide events.

## Getting Started: Creating a Plugin

The easiest way to start is by using the `plugin-cli` to scaffold a new project.

```bash
# Install the CLI globally (or use npx)
pnpm install -g @panel1/plugin-cli

# Scaffold a new plugin
p1-cli scaffold
```

Follow the prompts to create a new plugin. This will generate a directory with a standard structure, including a `plugin.json` manifest and a basic `index.ts`.

## The `plugin.json` Manifest

This file is the entry point for your plugin. It contains metadata that Panel1 uses to load and manage it.

```json
{
  "name": "My Awesome Plugin",
  "version": "1.0.0",
  "description": "A brief description of what this plugin does.",
  "author": "Your Name",
  "panel1Version": "^1.0.0",
  "main": "dist/index.js"
}
```

## Plugin Structure (`index.ts`)

Your main plugin file must export a class that extends `BasePlugin` from the `@panel1/plugin-sdk`.

```typescript
import { BasePlugin, PluginContext } from '@panel1/plugin-sdk';

export default class MyAwesomePlugin extends BasePlugin {
  constructor(context: PluginContext) {
    super(context);
    this.logger.info('My Awesome Plugin has been initialized!');
  }

  async onActivate() {
    this.logger.info('Plugin activated!');
    // Register routes, event listeners, etc.
  }

  async onDeactivate() {
    this.logger.info('Plugin deactivated!');
    // Clean up resources.
  }
}
```

### The `PluginContext`

The `PluginContext` object is passed to your plugin's constructor and provides access to core Panel1 services:
-   `logger`: A dedicated logger instance for your plugin.
-   `eventBus`: For subscribing to and emitting system events.
-   `api`: For registering new tRPC routes.
-   `ui`: For registering frontend components and routes.

## Extending the Backend

You can extend the tRPC API by defining new routers and registering them within your plugin.

```typescript
// Inside your onActivate method
this.context.api.registerRouter('myPlugin', myPluginRouter);
```

## Extending the Frontend

The frontend can be extended by registering new UI components or routes. This is typically done to add new pages to the admin dashboard or inject components into existing pages.

### UI Slots

The `UISlotManager` allows you to inject components into predefined "slots" in the UI.

```typescript
// Inside your onActivate method
this.context.ui.registerComponent('DASHBOARD_WIDGET', {
  id: 'my-awesome-widget',
  component: () => import('./components/MyWidget'),
});
```

### Custom Routes

You can add new top-level routes to the admin area.

```typescript
// Inside your onActivate method
this.context.ui.registerRoute({
  path: '/my-plugin',
  component: () => import('./pages/MyPluginPage'),
  exact: true,
  sidebar: {
    label: 'My Plugin',
    icon: 'PuzzlePieceIcon',
  },
});
```

## Development Workflow

1.  **Build your plugin**: Run `pnpm build` within your plugin directory. This will compile your TypeScript code.
2.  **Install the plugin**: Use the CLI to install the plugin into your local Panel1 instance.
    ```bash
    p1-cli install --path /path/to/your/plugin
    ```
3.  **Activate the plugin**: Navigate to the Plugins page in the Panel1 admin UI and activate your new plugin.
4.  **Test**: Verify that your plugin's functionality is working as expected.

This guide covers the basics of plugin development. For more advanced topics, refer to the example plugins in the `/plugins` directory of the main Panel1 repository.

## Plugin Architecture

### 1. Core Concepts
- Runtime plugin loading
- Standardized interfaces
- Event-driven architecture
- UI slot injection

### 2. Plugin Types
- Service plugins (provisioning, domain, SSL)
- UI plugins (admin, client portals)
- Integration plugins (external services)
- Automation plugins (workflows)

## Development Setup

### 1. Prerequisites
```bash
# Install plugin CLI globally
npm install -g @panel1/plugin-cli

# Create new plugin
panel1 plugin create my-plugin

# Build plugin
cd my-plugin
npm run build
```

### 2. Project Structure
```
my-plugin/
├── src/
│   ├── index.ts        # Plugin entry point
│   ├── components/     # UI components
│   ├── services/       # Business logic
│   └── types/         # Type definitions
├── plugin.json        # Plugin metadata
├── package.json       # Dependencies
└── tsconfig.json     # TypeScript config
```

## Plugin Configuration

### 1. Plugin Metadata
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My awesome plugin",
  "entry": "dist/index.js",
  "type": "service",
  "hooks": [
    "onActivate",
    "onDeactivate"
  ],
  "slots": [
    "admin.dashboard",
    "client.overview"
  ],
  "permissions": [
    "read:resources",
    "write:resources"
  ]
}
```

### 2. TypeScript Configuration
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "declaration": true,
    "outDir": "./dist",
    "strict": true
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

## Plugin Development

### 1. Basic Plugin Structure
```typescript
import { BasePlugin, PluginContext } from '@panel1/plugin-sdk';

export default class MyPlugin extends BasePlugin {
  async onActivate(context: PluginContext) {
    // Plugin activation logic
  }

  async onDeactivate(context: PluginContext) {
    // Cleanup logic
  }
}
```

### 2. Service Integration
```typescript
import { ServicePlugin, ServiceContext } from '@panel1/plugin-sdk';

export default class MyServicePlugin extends ServicePlugin {
  async provision(context: ServiceContext) {
    // Provisioning logic
  }

  async deprovision(context: ServiceContext) {
    // Cleanup logic
  }
}
```

### 3. UI Integration
```typescript
import { UIPlugin, UIContext } from '@panel1/plugin-sdk';
import MyDashboardWidget from './components/MyDashboardWidget';

export default class MyUIPlugin extends UIPlugin {
  slots = {
    'admin.dashboard': MyDashboardWidget
  };
}
```

## Plugin Features

### 1. Hook System
- Lifecycle hooks (activate, deactivate)
- Event hooks (onEvent, beforeEvent)
- Action hooks (beforeAction, afterAction)
- Filter hooks (filterData)

### 2. UI Slots
- Admin dashboard widgets
- Client portal sections
- Settings pages
- Custom pages

### 3. Service Integration
- Provisioning handlers
- Resource management
- Status monitoring
- Configuration UI

## Plugin Testing

### 1. Unit Testing
```typescript
import { TestContext } from '@panel1/plugin-sdk/testing';

describe('MyPlugin', () => {
  let plugin: MyPlugin;
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    plugin = new MyPlugin();
  });

  it('should activate successfully', async () => {
    await plugin.onActivate(context);
    expect(context.isActive).toBe(true);
  });
});
```

### 2. Integration Testing
```typescript
import { IntegrationTestContext } from '@panel1/plugin-sdk/testing';

describe('MyPlugin Integration', () => {
  let context: IntegrationTestContext;

  beforeAll(async () => {
    context = await IntegrationTestContext.create();
  });

  it('should handle events', async () => {
    await context.emitEvent('test.event');
    expect(context.eventHandled).toBe(true);
  });
});
```

## Plugin Deployment

### 1. Building
```bash
# Build plugin
npm run build

# Package plugin
panel1 plugin package

# Validate plugin
panel1 plugin validate
```

### 2. Installation
```bash
# Install in development
panel1 plugin install --dev

# Install in production
panel1 plugin install --prod
```

## Best Practices

### 1. Development
- Follow TypeScript best practices
- Use proper error handling
- Implement logging
- Write comprehensive tests

### 2. Security
- Validate inputs
- Handle sensitive data
- Follow security guidelines
- Implement proper error handling

### 3. Performance
- Optimize resource usage
- Cache when appropriate
- Handle cleanup properly
- Monitor performance

## Plugin Guidelines

### 1. Code Quality
- Use TypeScript
- Follow coding standards
- Document code
- Write tests

### 2. User Experience
- Consistent UI design
- Proper error messages
- Loading states
- Responsive design

### 3. Maintenance
- Version compatibility
- Update documentation
- Monitor issues
- Provide support

## Example Plugins

### 1. Service Plugin
```typescript
import { ServicePlugin, ServiceContext } from '@panel1/plugin-sdk';

export default class CpanelPlugin extends ServicePlugin {
  async provision(context: ServiceContext) {
    const { domain, username } = context.data;
    // Provision cPanel account
  }

  async getStatus(context: ServiceContext) {
    // Return service status
  }
}
```

### 2. UI Plugin
```typescript
import { UIPlugin } from '@panel1/plugin-sdk';
import DashboardWidget from './components/DashboardWidget';

export default class AnalyticsPlugin extends UIPlugin {
  slots = {
    'admin.dashboard': DashboardWidget
  };

  async getData() {
    // Fetch analytics data
  }
}
```

## Troubleshooting

### 1. Common Issues
- Plugin loading failures
- Hook registration issues
- UI slot conflicts
- Type errors

### 2. Debugging
- Enable debug logging
- Check plugin logs
- Validate configuration
- Test in isolation

## Resources

### 1. Documentation
- API reference
- Hook documentation
- UI slot catalog
- Example plugins

### 2. Tools
- Plugin CLI
- Development tools
- Testing utilities
- Debugging tools