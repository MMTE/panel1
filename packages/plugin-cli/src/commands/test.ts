import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

interface TestOptions {
  watch?: boolean;
  coverage?: boolean;
}

export async function testCommand(options: TestOptions) {
  console.log(chalk.blue('🧪 Running plugin tests...'));

  const cwd = process.cwd();
  const testsDir = path.join(cwd, 'tests');

  // Check if tests directory exists
  if (!await fs.pathExists(testsDir)) {
    console.log(chalk.yellow('⚠️  No tests directory found. Creating basic test setup...'));
    await createBasicTestSetup(cwd);
  }

  // Build test command
  let testCmd = 'vitest';
  
  if (options.watch) {
    testCmd += ' --watch';
  }
  
  if (options.coverage) {
    testCmd += ' --coverage';
  }

  try {
    execSync(testCmd, { cwd, stdio: 'inherit' });
    console.log(chalk.green('✅ Tests completed successfully!'));
  } catch (error) {
    console.error(chalk.red('❌ Tests failed'));
    process.exit(1);
  }
}

async function createBasicTestSetup(cwd: string) {
  const testsDir = path.join(cwd, 'tests');
  await fs.ensureDir(testsDir);

  // Create vitest config
  const vitestConfig = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
`;

  await fs.writeFile(path.join(cwd, 'vitest.config.ts'), vitestConfig);

  // Create test setup file
  const setupContent = `import { vi } from 'vitest';

// Mock Panel1 SDK
vi.mock('@panel1/plugin-sdk', () => ({
  createPlugin: vi.fn((plugin) => plugin),
  definePluginConfig: vi.fn((schema) => schema),
  createPluginContext: vi.fn((pluginId, overrides = {}) => ({
    pluginId,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    db: null,
    eventEmitter: {
      emit: vi.fn(),
    },
    auditLogger: {
      log: vi.fn(),
      logPluginAction: vi.fn(),
    },
    getPluginConfig: vi.fn().mockResolvedValue({}),
    setPluginConfig: vi.fn(),
    createSettings: vi.fn(),
    deleteSettings: vi.fn(),
    translate: vi.fn((key) => key),
    emit: vi.fn(),
    ...overrides,
  })),
}));
`;

  await fs.writeFile(path.join(testsDir, 'setup.ts'), setupContent);

  // Create basic test file
  const testContent = `import { describe, it, expect } from 'vitest';

describe('Plugin Tests', () => {
  it('should run basic test', () => {
    expect(true).toBe(true);
  });
});
`;

  await fs.writeFile(path.join(testsDir, 'basic.test.ts'), testContent);

  console.log(chalk.green('✅ Basic test setup created'));
}