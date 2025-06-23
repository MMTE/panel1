import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { z } from 'zod';

interface ValidateOptions {
  fix?: boolean;
}

const PluginManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, "Plugin name must be lowercase alphanumeric with dashes."),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\da-z-]+(?:\.[\da-z-]+)*)?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/),
  description: z.string().max(250),
  author: z.string(),
  panel1: z.string().describe("Semantic version range of Panel1 core required."),
  dependencies: z.record(z.string()).optional(),
  permissions: z.array(z.string()).default([]),
  uiSlots: z.array(z.string()).default([]),
  apiRoutes: z.array(z.string()).default([]),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().default('MIT'),
  keywords: z.array(z.string()).default([]),
});

export async function validateCommand(options: ValidateOptions) {
  console.log(chalk.blue('🔍 Validating plugin...'));

  const cwd = process.cwd();
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check plugin.json
  const pluginJsonPath = path.join(cwd, 'plugin.json');
  if (!await fs.pathExists(pluginJsonPath)) {
    issues.push('plugin.json not found');
  } else {
    try {
      const pluginJson = await fs.readJSON(pluginJsonPath);
      const result = PluginManifestSchema.safeParse(pluginJson);
      
      if (!result.success) {
        result.error.errors.forEach(error => {
          issues.push(`plugin.json: ${error.path.join('.')}: ${error.message}`);
        });
      } else {
        console.log(chalk.green('✅ plugin.json is valid'));
      }
    } catch (error) {
      issues.push(`plugin.json: Invalid JSON format`);
    }
  }

  // Check package.json
  const packageJsonPath = path.join(cwd, 'package.json');
  if (!await fs.pathExists(packageJsonPath)) {
    warnings.push('package.json not found (recommended for npm publishing)');
  } else {
    try {
      const packageJson = await fs.readJSON(packageJsonPath);
      
      if (!packageJson.dependencies?.['@panel1/plugin-sdk']) {
        warnings.push('package.json: @panel1/plugin-sdk not found in dependencies');
      }
      
      if (!packageJson.scripts?.build) {
        warnings.push('package.json: build script not found');
      }
      
      console.log(chalk.green('✅ package.json is valid'));
    } catch (error) {
      issues.push(`package.json: Invalid JSON format`);
    }
  }

  // Check src directory
  const srcDir = path.join(cwd, 'src');
  if (!await fs.pathExists(srcDir)) {
    issues.push('src directory not found');
  } else {
    const indexPath = path.join(srcDir, 'index.ts');
    if (!await fs.pathExists(indexPath)) {
      issues.push('src/index.ts not found (plugin entry point)');
    } else {
      console.log(chalk.green('✅ Plugin entry point found'));
    }
  }

  // Check TypeScript config
  const tsConfigPath = path.join(cwd, 'tsconfig.json');
  if (!await fs.pathExists(tsConfigPath)) {
    warnings.push('tsconfig.json not found (recommended for TypeScript development)');
  }

  // Check README
  const readmePath = path.join(cwd, 'README.md');
  if (!await fs.pathExists(readmePath)) {
    warnings.push('README.md not found (recommended for documentation)');
  }

  // Check tests
  const testsDir = path.join(cwd, 'tests');
  if (!await fs.pathExists(testsDir)) {
    warnings.push('tests directory not found (recommended for quality assurance)');
  }

  // Report results
  if (issues.length > 0) {
    console.log(chalk.red('\n❌ Validation failed with issues:'));
    issues.forEach(issue => {
      console.log(chalk.red(`  • ${issue}`));
    });
  }

  if (warnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Warnings:'));
    warnings.forEach(warning => {
      console.log(chalk.yellow(`  • ${warning}`));
    });
  }

  if (issues.length === 0 && warnings.length === 0) {
    console.log(chalk.green('\n✅ Plugin validation passed!'));
  } else if (issues.length === 0) {
    console.log(chalk.green('\n✅ Plugin validation passed with warnings'));
  }

  if (issues.length > 0) {
    process.exit(1);
  }
}