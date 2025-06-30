import { Panel1Error } from '../errors';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

interface LogContext {
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  operation?: string;
  duration?: number;
  [key: string]: any;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;

  private constructor() {
    this.logLevel = this.getLogLevelFromEnv();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getLogLevelFromEnv(): LogLevel {
    const level = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    return LogLevel[level as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatLog(level: string, message: string, context?: LogContext, error?: Error) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      service: 'panel1-api',
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      ...context,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...(error instanceof Panel1Error && {
            code: error.code,
            statusCode: error.statusCode,
            retryable: error.retryable,
            correlationId: error.correlationId,
            context: error.context,
          }),
        },
      }),
    };

    // In production, you'd send this to your logging service (e.g., Winston, Pino)
    return JSON.stringify(logEntry);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatLog('ERROR', message, context, error));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatLog('WARN', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatLog('INFO', message, context));
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatLog('DEBUG', message, context));
    }
  }

  // Convenience methods for common operations
  logOperation(operation: string, context?: LogContext): {
    success: (additionalContext?: LogContext) => void;
    failure: (error: Error, additionalContext?: LogContext) => void;
    info: (message: string, additionalContext?: LogContext) => void;
  } {
    const baseContext = { operation, ...context };
    const startTime = Date.now();

    return {
      success: (additionalContext?: LogContext) => {
        this.info(`${operation} completed successfully`, {
          ...baseContext,
          ...additionalContext,
          duration: Date.now() - startTime,
        });
      },
      failure: (error: Error, additionalContext?: LogContext) => {
        this.error(`${operation} failed`, {
          ...baseContext,
          ...additionalContext,
          duration: Date.now() - startTime,
        }, error);
      },
      info: (message: string, additionalContext?: LogContext) => {
        this.info(message, {
          ...baseContext,
          ...additionalContext,
        });
      },
    };
  }

  // Method to create child logger with persistent context
  child(context: LogContext): Logger {
    const childLogger = Object.create(this);
    const originalFormatLog = this.formatLog.bind(this);
    
    childLogger.formatLog = (level: string, message: string, additionalContext?: LogContext, error?: Error) => {
      return originalFormatLog(level, message, { ...context, ...additionalContext }, error);
    };

    return childLogger;
  }
}

export const logger = Logger.getInstance(); 