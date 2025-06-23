import type { Plugin, PluginManifest } from '@panel1/plugin-sdk';

/**
 * Plugin loader responsible for loading plugins from various sources
 */
export class PluginLoader {
  /**
   * Load a plugin from a local file path
   */
  static async loadFromFile(filePath: string): Promise<Plugin> {
    try {
      // In a real implementation, this would load from the filesystem
      const module = await import(filePath);
      return module.default;
    } catch (error) {
      throw new Error(`Failed to load plugin from file ${filePath}: ${error}`);
    }
  }

  /**
   * Load a plugin from a URL
   */
  static async loadFromUrl(url: string): Promise<Plugin> {
    try {
      // Download and load plugin from URL
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // In a real implementation, this would handle different formats
      // (zip files, tar.gz, etc.) and extract them to a temporary directory
      const pluginCode = await response.text();
      
      // Create a blob URL and import it
      const blob = new Blob([pluginCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      
      try {
        const module = await import(blobUrl);
        return module.default;
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      throw new Error(`Failed to load plugin from URL ${url}: ${error}`);
    }
  }

  /**
   * Load a plugin from GitHub
   */
  static async loadFromGitHub(repository: string, ref = 'main'): Promise<Plugin> {
    const url = `https://raw.githubusercontent.com/${repository}/${ref}/dist/index.js`;
    return this.loadFromUrl(url);
  }

  /**
   * Load a plugin from npm
   */
  static async loadFromNpm(packageName: string, version = 'latest'): Promise<Plugin> {
    const url = `https://unpkg.com/${packageName}@${version}/dist/index.js`;
    return this.loadFromUrl(url);
  }

  /**
   * Load plugin manifest from a source
   */
  static async loadManifest(source: string): Promise<PluginManifest> {
    try {
      let manifestUrl: string;

      if (source.startsWith('http')) {
        // Direct URL
        manifestUrl = source.endsWith('plugin.json') ? source : `${source}/plugin.json`;
      } else if (source.includes('/')) {
        // GitHub repository
        manifestUrl = `https://raw.githubusercontent.com/${source}/main/plugin.json`;
      } else {
        // npm package
        manifestUrl = `https://unpkg.com/${source}/plugin.json`;
      }

      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to load plugin manifest from ${source}: ${error}`);
    }
  }

  /**
   * Validate plugin structure
   */
  static validatePlugin(plugin: Plugin): void {
    if (!plugin) {
      throw new Error('Plugin is null or undefined');
    }

    if (!plugin.metadata) {
      throw new Error('Plugin metadata is missing');
    }

    if (!plugin.metadata.name) {
      throw new Error('Plugin name is missing');
    }

    if (!plugin.metadata.version) {
      throw new Error('Plugin version is missing');
    }

    if (!plugin.metadata.description) {
      throw new Error('Plugin description is missing');
    }

    if (!plugin.metadata.author) {
      throw new Error('Plugin author is missing');
    }

    // Validate semantic version format
    const versionRegex = /^\d+\.\d+\.\d+(?:-[\da-z-]+(?:\.[\da-z-]+)*)?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/;
    if (!versionRegex.test(plugin.metadata.version)) {
      throw new Error('Plugin version must follow semantic versioning');
    }

    // Validate plugin name format
    const nameRegex = /^[a-z0-9-]+$/;
    if (!nameRegex.test(plugin.metadata.name)) {
      throw new Error('Plugin name must be lowercase alphanumeric with dashes');
    }
  }

  /**
   * Extract plugin from archive (zip, tar.gz, etc.)
   */
  static async extractArchive(archiveData: ArrayBuffer, format: 'zip' | 'tar.gz'): Promise<Map<string, string>> {
    // This would use libraries like JSZip or similar to extract archives
    // For now, we'll throw an error indicating this needs implementation
    throw new Error(`Archive extraction for ${format} not yet implemented`);
  }

  /**
   * Download and cache plugin
   */
  static async downloadAndCache(source: string, cacheKey: string): Promise<Plugin> {
    // Check if plugin is already cached
    const cached = await this.getCachedPlugin(cacheKey);
    if (cached) {
      return cached;
    }

    // Download plugin
    let plugin: Plugin;
    if (source.startsWith('http')) {
      plugin = await this.loadFromUrl(source);
    } else if (source.includes('/')) {
      plugin = await this.loadFromGitHub(source);
    } else {
      plugin = await this.loadFromNpm(source);
    }

    // Validate plugin
    this.validatePlugin(plugin);

    // Cache plugin
    await this.cachePlugin(cacheKey, plugin);

    return plugin;
  }

  /**
   * Get cached plugin
   */
  private static async getCachedPlugin(cacheKey: string): Promise<Plugin | null> {
    try {
      // In a real implementation, this would check a cache (localStorage, IndexedDB, etc.)
      const cached = localStorage.getItem(`plugin_cache_${cacheKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Failed to get cached plugin:', error);
    }
    return null;
  }

  /**
   * Cache plugin
   */
  private static async cachePlugin(cacheKey: string, plugin: Plugin): Promise<void> {
    try {
      // In a real implementation, this would store in a proper cache
      localStorage.setItem(`plugin_cache_${cacheKey}`, JSON.stringify(plugin));
    } catch (error) {
      console.warn('Failed to cache plugin:', error);
    }
  }

  /**
   * Clear plugin cache
   */
  static clearCache(): void {
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('plugin_cache_')) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('Failed to clear plugin cache:', error);
    }
  }
}