import { Plugin, PluginContext, PluginMetadata } from '@panel1/plugin-sdk';
import { ExtensionPoint, Hook } from '@panel1/plugin-sdk';
import { Logger } from '@panel1/logger';

export abstract class BasePlugin implements Plugin {
  protected logger: Logger;
  protected config: Record<string, any>;
  protected metadata: PluginMetadata;
  private hooks: Hook[] = [];
  private extensionPoints: ExtensionPoint[] = [];

  constructor(metadata: PluginMetadata) {
    this.metadata = metadata;
    this.logger = new Logger({ name: metadata.name });
  }

  public getName(): string {
    return this.metadata.name;
  }

  public getType(): string {
    return this.metadata.type;
  }

  public getVersion(): string {
    return this.metadata.version;
  }

  public async initialize(ctx: PluginContext): Promise<void> {
    this.config = await ctx.getPluginConfig(this.metadata.name);
    await this.onInitialize(ctx);
  }

  public async destroy(): Promise<void> {
    // Cleanup hooks and extension points
    this.hooks = [];
    this.extensionPoints = [];
    await this.onDestroy();
  }

  protected registerHook(event: string, handler: Function, priority: number = 10): void {
    this.hooks.push({ event, handler: handler.bind(this), priority });
  }

  protected registerExtensionPoint(extensionPoint: ExtensionPoint): void {
    this.extensionPoints.push(extensionPoint);
  }

  public getHooks(): Hook[] {
    return this.hooks;
  }

  public getExtensionPoints(): ExtensionPoint[] {
    return this.extensionPoints;
  }

  protected abstract onInitialize(ctx: PluginContext): Promise<void>;
  protected abstract onDestroy(): Promise<void>;
} 