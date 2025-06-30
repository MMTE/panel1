# Panel1 Plugin Development Guide

## Overview

Panel1's plugin system allows developers to extend the platform's functionality through a standardized SDK and development workflow.

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