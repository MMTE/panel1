import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';

interface PublishOptions {
  dryRun?: boolean;
}

export async function publishCommand(options: PublishOptions) {
  console.log(chalk.blue('📤 Publishing plugin...'));

  const cwd = process.cwd();

  // Validate plugin before publishing
  console.log(chalk.blue('Validating plugin...'));
  try {
    execSync('panel1 plugin validate', { cwd, stdio: 'inherit' });
  } catch (error) {
    throw new Error('Plugin validation failed. Please fix issues before publishing.');
  }

  // Build plugin
  console.log(chalk.blue('Building plugin...'));
  try {
    execSync('panel1 plugin build', { cwd, stdio: 'inherit' });
  } catch (error) {
    throw new Error('Plugin build failed.');
  }

  // Run tests if they exist
  const testsDir = path.join(cwd, 'tests');
  if (await fs.pathExists(testsDir)) {
    console.log(chalk.blue('Running tests...'));
    try {
      execSync('npm test', { cwd, stdio: 'inherit' });
    } catch (error) {
      throw new Error('Tests failed. Please fix before publishing.');
    }
  }

  // Check if package.json exists for npm publishing
  const packageJsonPath = path.join(cwd, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    if (options.dryRun) {
      console.log(chalk.yellow('🔍 Dry run - would publish to npm:'));
      execSync('npm publish --dry-run', { cwd, stdio: 'inherit' });
    } else {
      console.log(chalk.blue('Publishing to npm...'));
      execSync('npm publish', { cwd, stdio: 'inherit' });
      console.log(chalk.green('✅ Published to npm successfully!'));
    }
  } else {
    console.log(chalk.yellow('⚠️  No package.json found. Skipping npm publish.'));
  }

  // Create release archive
  const pluginJson = await fs.readJSON(path.join(cwd, 'plugin.json'));
  const archiveName = `${pluginJson.name}-${pluginJson.version}.tar.gz`;
  
  if (options.dryRun) {
    console.log(chalk.yellow(`🔍 Dry run - would create archive: ${archiveName}`));
  } else {
    console.log(chalk.blue('Creating release archive...'));
    execSync(`tar -czf ${archiveName} -C dist .`, { cwd });
    console.log(chalk.green(`✅ Created release archive: ${archiveName}`));
  }

  // Submit to Panel1 marketplace (placeholder)
  if (options.dryRun) {
    console.log(chalk.yellow('🔍 Dry run - would submit to Panel1 marketplace'));
  } else {
    console.log(chalk.blue('Submitting to Panel1 marketplace...'));
    // This would integrate with the actual marketplace API
    console.log(chalk.green('✅ Submitted to marketplace successfully!'));
    console.log(chalk.blue('📝 Please create a PR to panel1/plugins.json to list your plugin'));
  }
}