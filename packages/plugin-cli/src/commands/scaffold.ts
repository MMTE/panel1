import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

interface ScaffoldOptions {
  template?: string;
  directory?: string;
}

export async function scaffoldCommand(name: string, options: ScaffoldOptions) {
  console.log(chalk.blue('🚀 Creating new Panel1 plugin:'), chalk.bold(name));

  // Validate plugin name
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error('Plugin name must be lowercase alphanumeric with dashes only');
  }

  const targetDir = options.directory || `./${name}`;

  // Check if directory exists
  if (await fs.pathExists(targetDir)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `Directory ${targetDir} already exists. Overwrite?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('Cancelled.'));
      return;
    }

    await fs.remove(targetDir);
  }

  // Gather plugin information
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'description',
      message: 'Plugin description:',
      default: `A Panel1 plugin for ${name}`,
    },
    {
      type: 'input',
      name: 'author',
      message: 'Author name:',
    },
    {
      type: 'input',
      name: 'email',
      message: 'Author email:',
    },
    {
      type: 'list',
      name: 'template',
      message: 'Choose a template:',
      choices: [
        { name: 'Basic Plugin', value: 'basic' },
        { name: 'UI Widget Plugin', value: 'ui-widget' },
        { name: 'API Integration Plugin', value: 'api-integration' },
        { name: 'Billing Hook Plugin', value: 'billing-hook' },
      ],
      default: options.template || 'basic',
    },
  ]);

  // Create directory structure
  await fs.ensureDir(targetDir);
  await fs.ensureDir(path.join(targetDir, 'src'));
  await fs.ensureDir(path.join(targetDir, 'assets'));
  await fs.ensureDir(path.join(targetDir, 'tests'));

  // Create plugin.json
  const pluginManifest = {
    name,
    version: '0.1.0',
    description: answers.description,
    author: answers.email ? `${answers.author} <${answers.email}>` : answers.author,
    panel1: '>=0.2.0 <0.3.0',
    dependencies: {},
    permissions: [],
    uiSlots: [],
    apiRoutes: [],
  };

  await fs.writeJSON(path.join(targetDir, 'plugin.json'), pluginManifest, { spaces: 2 });

  // Create package.json
  const packageJson = {
    name: `@panel1/${name}`,
    version: '0.1.0',
    description: answers.description,
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    scripts: {
      build: 'panel1 plugin build',
      dev: 'panel1 plugin build --watch',
      test: 'panel1 plugin test',
      validate: 'panel1 plugin validate',
    },
    dependencies: {
      '@panel1/plugin-sdk': '^0.1.0',
      zod: '^3.22.4',
    },
    devDependencies: {
      '@types/react': '^18.2.43',
      typescript: '^5.5.3',
      vitest: '^1.1.0',
    },
  };

  await fs.writeJSON(path.join(targetDir, 'package.json'), packageJson, { spaces: 2 });

  // Create TypeScript config
  const tsConfig = {
    compilerOptions: {
      target: 'ES2020',
      lib: ['ES2020', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      declaration: true,
      outDir: './dist',
      rootDir: './src',
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      jsx: 'react-jsx',
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist', 'tests'],
  };

  await fs.writeJSON(path.join(targetDir, 'tsconfig.json'), tsConfig, { spaces: 2 });

  // Create template files based on selection
  await createTemplateFiles(targetDir, answers.template, name);

  // Create README
  const readme = generateReadme(name, answers.description);
  await fs.writeFile(path.join(targetDir, 'README.md'), readme);

  console.log(chalk.green('✅ Plugin scaffolded successfully!'));
  console.log(chalk.blue('\nNext steps:'));
  console.log(chalk.gray(`  cd ${targetDir}`));
  console.log(chalk.gray('  npm install'));
  console.log(chalk.gray('  npm run dev'));
}

async function createTemplateFiles(targetDir: string, template: string, name: string) {
  const templates = {
    basic: () => createBasicTemplate(targetDir, name),
    'ui-widget': () => createUIWidgetTemplate(targetDir, name),
    'api-integration': () => createAPIIntegrationTemplate(targetDir, name),
    'billing-hook': () => createBillingHookTemplate(targetDir, name),
  };

  const createTemplate = templates[template as keyof typeof templates];
  if (createTemplate) {
    await createTemplate();
  } else {
    await createBasicTemplate(targetDir, name);
  }
}

async function createBasicTemplate(targetDir: string, name: string) {
  const indexContent = `import React from 'react';
import {
  createPlugin,
  definePluginConfig,
  PluginContext,
  z,
} from '@panel1/plugin-sdk';

// Define configuration schema
const ConfigSchema = definePluginConfig(
  z.object({
    enabled: z.boolean().default(true),
    message: z.string().default('Hello from ${name}!'),
  })
);

// Create the plugin
const ${toPascalCase(name)}Plugin = createPlugin({
  metadata: {
    name: '${name}',
    version: '0.1.0',
    description: 'A basic Panel1 plugin',
    author: 'Your Name',
    panel1: '>=0.2.0',
  },
  configSchema: ConfigSchema,

  // Lifecycle methods
  async onInstall(ctx: PluginContext) {
    ctx.logger.info('${name} plugin installed');
    await ctx.createSettings({
      enabled: true,
      message: 'Hello from ${name}!',
    });
  },

  async onEnable(ctx: PluginContext) {
    ctx.logger.info('${name} plugin enabled');
  },

  async onDisable(ctx: PluginContext) {
    ctx.logger.info('${name} plugin disabled');
  },

  async onUninstall(ctx: PluginContext) {
    ctx.logger.info('${name} plugin uninstalled');
    await ctx.deleteSettings();
  },

  // Event hooks
  hooks: {
    'user.loggedIn': async ({ user, context }) => {
      const config = await context.getPluginConfig<z.infer<typeof ConfigSchema>>('${name}');
      if (config.enabled) {
        context.logger.info(\`User \${user.email} logged in - \${config.message}\`);
      }
    },
  },

  // Custom API routes
  routes: {
    'GET /status': async (req, res, ctx) => {
      const config = await ctx.getPluginConfig<z.infer<typeof ConfigSchema>>('${name}');
      return res.json({
        plugin: '${name}',
        enabled: config.enabled,
        message: config.message,
        timestamp: new Date().toISOString(),
      });
    },
  },

  // UI components
  components: {
    'admin.dashboard.widgets': () => React.createElement('div', {
      className: 'bg-white rounded-lg shadow p-6'
    }, [
      React.createElement('h3', {
        key: 'title',
        className: 'text-lg font-semibold text-gray-900 mb-2'
      }, '${toPascalCase(name)} Plugin'),
      React.createElement('p', {
        key: 'content',
        className: 'text-gray-600'
      }, 'This widget is provided by the ${name} plugin.')
    ]),
  },
});

export default ${toPascalCase(name)}Plugin;
`;

  await fs.writeFile(path.join(targetDir, 'src', 'index.ts'), indexContent);

  // Create test file
  const testContent = `import { describe, it, expect } from 'vitest';
import { createPluginContext } from '@panel1/plugin-sdk';
import ${toPascalCase(name)}Plugin from '../src/index';

describe('${toPascalCase(name)}Plugin', () => {
  it('should have correct metadata', () => {
    expect(${toPascalCase(name)}Plugin.metadata.name).toBe('${name}');
    expect(${toPascalCase(name)}Plugin.metadata.version).toBe('0.1.0');
  });

  it('should handle user login hook', async () => {
    const ctx = createPluginContext('${name}', {
      getPluginConfig: async () => ({ enabled: true, message: 'Test message' }),
    });

    const hook = ${toPascalCase(name)}Plugin.hooks?.['user.loggedIn'];
    expect(hook).toBeDefined();

    if (hook) {
      await hook({
        user: { id: '1', email: 'test@example.com' },
        context: ctx,
      });
    }
  });
});
`;

  await fs.writeFile(path.join(targetDir, 'tests', 'index.test.ts'), testContent);
}

async function createUIWidgetTemplate(targetDir: string, name: string) {
  // Similar to basic but with more UI components
  await createBasicTemplate(targetDir, name);
  
  // Add additional UI component file
  const widgetContent = `import React from 'react';

export interface ${toPascalCase(name)}WidgetProps {
  title?: string;
  data?: any;
}

export const ${toPascalCase(name)}Widget: React.FC<${toPascalCase(name)}WidgetProps> = ({ 
  title = '${toPascalCase(name)} Widget',
  data 
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
          <span className="text-white text-sm">🔌</span>
        </div>
      </div>
      
      <div className="space-y-3">
        <p className="text-gray-600">
          This is a custom widget provided by the ${name} plugin.
        </p>
        
        {data && (
          <div className="bg-gray-50 rounded-lg p-3">
            <pre className="text-sm text-gray-700">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
`;

  await fs.writeFile(path.join(targetDir, 'src', 'components', 'Widget.tsx'), widgetContent);
  await fs.ensureDir(path.join(targetDir, 'src', 'components'));
}

async function createAPIIntegrationTemplate(targetDir: string, name: string) {
  await createBasicTemplate(targetDir, name);
  
  // Add API service file
  const apiServiceContent = `export class ${toPascalCase(name)}APIService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.example.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = \`\${this.baseUrl}\${endpoint}\`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': \`Bearer \${this.apiKey}\`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(\`API request failed: \${response.status} \${response.statusText}\`);
    }

    return response.json();
  }

  async getData(): Promise<any> {
    return this.makeRequest('/data');
  }

  async postData(data: any): Promise<any> {
    return this.makeRequest('/data', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}
`;

  await fs.ensureDir(path.join(targetDir, 'src', 'services'));
  await fs.writeFile(path.join(targetDir, 'src', 'services', 'api.ts'), apiServiceContent);
}

async function createBillingHookTemplate(targetDir: string, name: string) {
  await createBasicTemplate(targetDir, name);
  
  // Add billing hooks file
  const billingHooksContent = `import { PluginContext } from '@panel1/plugin-sdk';

export async function handleInvoicePaid(invoice: any, context: PluginContext) {
  context.logger.info(\`Invoice \${invoice.id} was paid for amount \${invoice.total}\`);
  
  // Example: Send notification to external service
  const config = await context.getPluginConfig('${name}');
  if (config.notifyOnPayment) {
    await notifyExternalService(invoice);
  }
}

export async function handleSubscriptionCreated(subscription: any, context: PluginContext) {
  context.logger.info(\`New subscription created: \${subscription.id}\`);
  
  // Example: Provision resources
  await provisionResources(subscription);
}

async function notifyExternalService(invoice: any) {
  // Implementation for external notification
  console.log('Notifying external service about payment:', invoice.id);
}

async function provisionResources(subscription: any) {
  // Implementation for resource provisioning
  console.log('Provisioning resources for subscription:', subscription.id);
}
`;

  await fs.ensureDir(path.join(targetDir, 'src', 'hooks'));
  await fs.writeFile(path.join(targetDir, 'src', 'hooks', 'billing.ts'), billingHooksContent);
}

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function generateReadme(name: string, description: string): string {
  return `# ${toPascalCase(name)} Plugin

${description}

## Installation

\`\`\`bash
panel1 plugin install ${name}
\`\`\`

## Configuration

This plugin supports the following configuration options:

- \`enabled\`: Enable/disable the plugin
- \`message\`: Custom message to display

## Development

\`\`\`bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Run in development mode
npm run dev

# Run tests
npm run test

# Validate plugin
npm run validate
\`\`\`

## API Routes

- \`GET /plugins/${name}/status\` - Get plugin status

## UI Slots

- \`admin.dashboard.widgets\` - Dashboard widget

## Event Hooks

- \`user.loggedIn\` - Triggered when a user logs in

## License

MIT
`;
}