import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { build } from 'esbuild';

interface BuildOptions {
  watch?: boolean;
  output?: string;
}

export async function buildCommand(options: BuildOptions) {
  console.log(chalk.blue('🔨 Building plugin...'));

  const cwd = process.cwd();
  const srcDir = path.join(cwd, 'src');
  const outDir = path.join(cwd, options.output || 'dist');

  // Check if src directory exists
  if (!await fs.pathExists(srcDir)) {
    throw new Error('src directory not found. Are you in a plugin directory?');
  }

  // Check if plugin.json exists
  const pluginJsonPath = path.join(cwd, 'plugin.json');
  if (!await fs.pathExists(pluginJsonPath)) {
    throw new Error('plugin.json not found. Are you in a plugin directory?');
  }

  // Ensure output directory exists
  await fs.ensureDir(outDir);

  // Copy plugin.json to output
  await fs.copy(pluginJsonPath, path.join(outDir, 'plugin.json'));

  // Copy assets if they exist
  const assetsDir = path.join(cwd, 'assets');
  if (await fs.pathExists(assetsDir)) {
    await fs.copy(assetsDir, path.join(outDir, 'assets'));
  }

  const buildConfig = {
    entryPoints: [path.join(srcDir, 'index.ts')],
    bundle: true,
    outfile: path.join(outDir, 'index.js'),
    format: 'esm' as const,
    target: 'es2020',
    external: [
      'react',
      'react-dom',
      '@panel1/plugin-sdk',
      'zod',
    ],
    sourcemap: true,
    minify: !options.watch,
    define: {
      'process.env.NODE_ENV': options.watch ? '"development"' : '"production"',
    },
  };

  if (options.watch) {
    console.log(chalk.yellow('👀 Watching for changes...'));
    
    const context = await build({
      ...buildConfig,
      plugins: [
        {
          name: 'rebuild-notify',
          setup(build) {
            build.onEnd((result) => {
              if (result.errors.length > 0) {
                console.log(chalk.red('❌ Build failed:'));
                result.errors.forEach(error => {
                  console.log(chalk.red(error.text));
                });
              } else {
                console.log(chalk.green('✅ Build completed successfully'));
              }
            });
          },
        },
      ],
    });

    await context.watch();
    
    // Keep the process running
    process.on('SIGINT', async () => {
      await context.dispose();
      process.exit(0);
    });
  } else {
    try {
      await build(buildConfig);
      console.log(chalk.green('✅ Build completed successfully'));
    } catch (error) {
      console.error(chalk.red('❌ Build failed:'), error);
      throw error;
    }
  }
}