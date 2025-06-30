import { TRPCError } from '@trpc/server';
import { Panel1Error } from '../errors';
import { logger } from '../logging/Logger';

export function handleError(error: unknown, context?: Record<string, any>): TRPCError {
  const correlationId = context?.correlationId || `err_${Date.now()}`;
  
  // Log the error
  logger.error('Request failed', {
    correlationId,
    ...context,
  }, error as Error);

  // Convert Panel1Error to TRPCError
  if (error instanceof Panel1Error) {
    return new TRPCError({
      code: mapStatusCodeToTRPCCode(error.statusCode),
      message: error.message,
      cause: error,
    });
  }

  // Handle database errors
  if (error instanceof Error && (
    error.message.includes('database') ||
    error.message.includes('relation') ||
    error.message.includes('constraint') ||
    error.message.includes('connection')
  )) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database operation failed',
      cause: error,
    });
  }

  // Handle validation errors (Zod)
  if (error instanceof Error && (
    error.name === 'ZodError' ||
    error.message.includes('validation')
  )) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Validation failed',
      cause: error,
    });
  }

  // Handle timeout errors
  if (error instanceof Error && (
    error.message.includes('timeout') ||
    error.message.includes('ETIMEDOUT')
  )) {
    return new TRPCError({
      code: 'TIMEOUT',
      message: 'Request timeout',
      cause: error,
    });
  }

  // Handle network errors
  if (error instanceof Error && (
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ENOTFOUND') ||
    error.message.includes('network')
  )) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Network error occurred',
      cause: error,
    });
  }

  // Default error
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    cause: error as Error,
  });
}

function mapStatusCodeToTRPCCode(statusCode: number): TRPCError['code'] {
  switch (statusCode) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 429: return 'TOO_MANY_REQUESTS';
    case 500: return 'INTERNAL_SERVER_ERROR';
    case 502: return 'BAD_GATEWAY';
    case 504: return 'TIMEOUT';
    default: return 'INTERNAL_SERVER_ERROR';
  }
}

// Utility function to wrap async operations with error handling
export function withErrorHandling<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  context?: Record<string, any>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      throw handleError(error, context);
    }
  };
}

// Middleware for tRPC procedures
export function createErrorHandlingMiddleware() {
  return async function errorHandlingMiddleware(opts: any) {
    try {
      return await opts.next();
    } catch (error) {
      const context = {
        procedure: opts.path,
        type: opts.type,
        input: opts.input,
        userId: opts.ctx?.user?.id,
        tenantId: opts.ctx?.tenantId,
      };
      
      throw handleError(error, context);
    }
  };
} 