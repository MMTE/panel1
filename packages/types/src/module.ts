import type { z, ZodSchema } from 'zod';
import type { EventMap, EventHandler, FilterHandler } from './events.js';

/** Optional BullMQ overrides for `ctx.job(...)` (issue 1.4). */
export interface ModuleJobOptions {
  maxRetries?: number;
  backoffMs?: number;
  /** Job execution timeout in milliseconds (BullMQ `timeout` option). */
  timeout?: number;
}

export interface ModuleDefinition {
  name: string;
  version: string;
  deps?: string[];

  setup(ctx: ModuleContext): void | Promise<void>;
  /** Reverse-order cleanup on `shutdown()` */
  teardown?: () => void | Promise<void>;

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

  job(name: string, cron: string, handler: () => Promise<void>, opts?: ModuleJobOptions): void;

  config: Record<string, unknown>;
  logger: Logger;
  email?: EmailTransport;
  /** Sensitive fields at rest — from host (`apps/api` boot). */
  encryption?: EncryptionPort;
  /** Retries / circuit breaker — from host (`@panel1/core` RetryManager). */
  retry?: RetryPort;

  /**
   * Injected by host app (`apps/api` boot). Hono middleware factory; OR semantics across ids.
   * Canonical permission names: see ARCHITECTURE.md (`{module}.{resource}.{action}`).
   */
  requirePermission?: (...permissionIds: string[]) => unknown;
}

/** Matches `@panel1/core` RetryConfig shape — duplicated here so `types` stays dependency-free. */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryCondition?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface RetryPort {
  executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
    operationName?: string
  ): Promise<T>;
}

export interface EncryptionPort {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
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
