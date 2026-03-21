import type { z, ZodSchema } from 'zod';
import type { EventMap, EventHandler, FilterHandler } from './events.js';

export interface ModuleDefinition {
  name: string;
  version: string;
  deps?: string[];

  setup(ctx: ModuleContext): void | Promise<void>;

  schema?: Record<string, unknown>;
  config?: ZodSchema;
  permissions?: string[];
  emits?: string[];

  ui?: ModuleUI;
}

export interface ModuleContext {
  moduleName: string;
  db: unknown;

  service<T>(name: string): T;
  service(name: string, implementation: unknown): void;

  routes(app: unknown): void;

  on<K extends keyof EventMap>(event: K, handler: EventHandler<K>): void;
  on(event: string, handler: EventHandler<string>): void;

  filter<K extends keyof EventMap>(event: K, handler: FilterHandler<K>, priority?: number): void;
  filter(event: string, handler: FilterHandler<string>, priority?: number): void;

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): Promise<void>;
  emit(event: string, payload: unknown): Promise<void>;

  job(name: string, cron: string, handler: () => Promise<void>): void;

  config: Record<string, unknown>;
  logger: Logger;
  email?: EmailTransport;
}

export interface EmailTransport {
  sendEmail(options: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface ModuleUI {
  adminPages?: PageRegistration[];
  clientPages?: PageRegistration[];
  adminNav?: NavItem[];
  widgets?: WidgetRegistration[];
}

export interface PageRegistration {
  path: string;
  load: () => Promise<unknown>;
}

export interface NavItem {
  label: string;
  icon: string;
  path: string;
  section: string;
  order: number;
}

export interface WidgetRegistration {
  slot: string;
  load: () => Promise<unknown>;
}

export type SetupFunction = (ctx: ModuleContext) => void | Promise<void>;
