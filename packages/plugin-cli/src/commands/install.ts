import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';

interface InstallOptions {
  dev?: boolean;
}

export async function installCommand(source: string, options: InstallOptions) {
  console.log(chalk.blue('📦 Installing plugin:'), chalk.bold(source));

  // Determine installation method based on source
  if (source.startsWith('http') || source.includes('/')) {
    // Git repository or URL
    await installFromGit(source, options);
  } else if (source.startsWith('@') || source.includes('/')) {
    // npm package
    await installFromNpm(source, options);
  } else {
    // Local path
    await installFromLocal(source, options);
  }

  console.log(chalk.green('✅ Plugin installed successfully!'));
}

async function installFromGit(gitUrl: string, _options: InstallOptions) {
  const tempDir = path.join(process.cwd(), '.tmp-plugin');
  
  try {
    // Clone repository
    console.log(chalk.blue('Cloning repository...'));
    execSync(`git clone ${gitUrl} ${tempDir}`, { stdio: 'inherit' });

    // Install dependencies and build
    console.log(chalk.blue('Installing dependencies...'));
    execSync('npm install', { cwd: tempDir, stdio: 'inherit' });

    console.log(chalk.blue('Building plugin...'));
    execSync('npm run build', { cwd: tempDir, stdio: 'inherit' });

    // Copy to plugins directory
    const pluginJson = await fs.readJSON(path.join(tempDir, 'plugin.json'));
    const pluginName = pluginJson.name;
    const targetDir = path.join(process.cwd(), 'plugins', pluginName);

    await fs.ensureDir(path.dirname(targetDir));
    await fs.copy(path.join(tempDir, 'dist'), targetDir);

    console.log(chalk.green(`Plugin ${pluginName} installed to plugins/${pluginName}`));
  } finally {
    // Clean up temp directory
    await fs.remove(tempDir);
  }
}

async function installFromNpm(packageName: string, options: InstallOptions) {
  console.log(chalk.blue('Installing from npm...'));
  
  const installCmd = options.dev 
    ? `npm install --save-dev ${packageName}`
    : `npm install ${packageName}`;
    
  execSync(installCmd, { stdio: 'inherit' });
}

async function installFromLocal(localPath: string, _options: InstallOptions) {
  const sourcePath = path.resolve(localPath);
  
  if (!await fs.pathExists(sourcePath)) {
    throw new Error(`Local path not found: ${sourcePath}`);
  }

  const pluginJsonPath = path.join(sourcePath, 'plugin.json');
  if (!await fs.pathExists(pluginJsonPath)) {
    throw new Error('plugin.json not found in local path');
  }

  const pluginJson = await fs.readJSON(pluginJsonPath);
  const pluginName = pluginJson.name;

  // Check if dist directory exists, if not build it
  const distPath = path.join(sourcePath, 'dist');
  if (!await fs.pathExists(distPath)) {
    console.log(chalk.blue('Building plugin...'));
    execSync('npm run build', { cwd: sourcePath, stdio: 'inherit' });
  }

  // Copy to plugins directory
  const targetDir = path.join(process.cwd(), 'plugins', pluginName);
  await fs.ensureDir(path.dirname(targetDir));
  await fs.copy(distPath, targetDir);

  console.log(chalk.green(`Plugin ${pluginName} installed to plugins/${pluginName}`));
}