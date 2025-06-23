#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { scaffoldCommand } from './commands/scaffold.js';
import { buildCommand } from './commands/build.js';
import { validateCommand } from './commands/validate.js';
import { installCommand } from './commands/install.js';
import { publishCommand } from './commands/publish.js';
import { testCommand } from './commands/test.js';

const program = new Command();

program
  .name('panel1')
  .description('Panel1 Plugin Development CLI')
  .version('0.1.0');

// Plugin scaffold command
program
  .command('plugin')
  .description('Plugin development commands')
  .addCommand(
    new Command('scaffold')
      .description('Create a new plugin from template')
      .argument('<name>', 'Plugin name')
      .option('-t, --template <template>', 'Template to use', 'basic')
      .option('-d, --directory <dir>', 'Output directory')
      .action(scaffoldCommand)
  )
  .addCommand(
    new Command('build')
      .description('Build plugin for production')
      .option('-w, --watch', 'Watch for changes')
      .option('-o, --output <dir>', 'Output directory', 'dist')
      .action(buildCommand)
  )
  .addCommand(
    new Command('validate')
      .description('Validate plugin manifest and code')
      .option('-f, --fix', 'Auto-fix issues where possible')
      .action(validateCommand)
  )
  .addCommand(
    new Command('install')
      .description('Install a plugin')
      .argument('<source>', 'Plugin source (npm package, git repo, or local path)')
      .option('--dev', 'Install as development dependency')
      .action(installCommand)
  )
  .addCommand(
    new Command('publish')
      .description('Publish plugin to marketplace')
      .option('--dry-run', 'Show what would be published without actually publishing')
      .action(publishCommand)
  )
  .addCommand(
    new Command('test')
      .description('Run plugin tests')
      .option('--watch', 'Watch for changes')
      .option('--coverage', 'Generate coverage report')
      .action(testCommand)
  );

// Global error handler
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});

program.parse();