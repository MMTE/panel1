// Base error classes with consistent structure
export abstract class Panel1Error extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  abstract readonly retryable: boolean;
  public readonly timestamp: Date;
  public readonly correlationId: string;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    context?: Record<string, any>,
    correlationId?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.correlationId = correlationId || generateCorrelationId();
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
      context: this.context,
      stack: this.stack,
    };
  }
}

// Business Logic Errors (4xx)
export class ValidationError extends Panel1Error {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  readonly retryable = false;
}

export class AuthenticationError extends Panel1Error {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;
  readonly retryable = false;
}

export class AuthorizationError extends Panel1Error {
  readonly code = 'AUTHORIZATION_ERROR';
  readonly statusCode = 403;
  readonly retryable = false;
}

export class NotFoundError extends Panel1Error {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
  readonly retryable = false;
}

export class ConflictError extends Panel1Error {
  readonly code = 'CONFLICT';
  readonly statusCode = 409;
  readonly retryable = false;
}

export class RateLimitError extends Panel1Error {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
  readonly retryable = true;
}

// Infrastructure Errors (5xx)
export class DatabaseError extends Panel1Error {
  readonly code = 'DATABASE_ERROR';
  readonly statusCode = 500;
  readonly retryable = true;
}

export class ExternalServiceError extends Panel1Error {
  readonly code = 'EXTERNAL_SERVICE_ERROR';
  readonly statusCode = 502;
  readonly retryable = true;
}

export class TimeoutError extends Panel1Error {
  readonly code = 'TIMEOUT_ERROR';
  readonly statusCode = 504;
  readonly retryable = true;
}

// Domain-Specific Errors
export class PaymentError extends Panel1Error {
  readonly code = 'PAYMENT_ERROR';
  readonly statusCode = 402;
  readonly retryable: boolean;

  constructor(
    message: string,
    public readonly paymentCode?: string,
    context?: Record<string, any>,
    retryable = false
  ) {
    super(message, { ...context, paymentCode });
    this.retryable = retryable;
  }
}

export class ProvisioningError extends Panel1Error {
  readonly code = 'PROVISIONING_ERROR';
  readonly statusCode = 500;
  readonly retryable: boolean;

  constructor(
    message: string,
    public readonly providerCode?: string,
    context?: Record<string, any>,
    retryable = true
  ) {
    super(message, { ...context, providerCode });
    this.retryable = retryable;
  }
}

export class SubscriptionError extends Panel1Error {
  readonly code = 'SUBSCRIPTION_ERROR';
  readonly statusCode = 400;
  readonly retryable: boolean;

  constructor(
    message: string,
    public readonly subscriptionCode?: string,
    context?: Record<string, any>,
    retryable = false
  ) {
    super(message, { ...context, subscriptionCode });
    this.retryable = retryable;
  }
}

export class InvoiceError extends Panel1Error {
  readonly code = 'INVOICE_ERROR';
  readonly statusCode = 400;
  readonly retryable = false;

  constructor(
    message: string,
    public readonly invoiceCode?: string,
    context?: Record<string, any>
  ) {
    super(message, { ...context, invoiceCode });
  }
}

function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Error type guards
export function isPanel1Error(error: unknown): error is Panel1Error {
  return error instanceof Panel1Error;
}

export function isRetryableError(error: unknown): boolean {
  if (isPanel1Error(error)) {
    return error.retryable;
  }
  
  // Check for common retryable error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('timeout') ||
           message.includes('network') ||
           message.includes('econnreset') ||
           message.includes('enotfound') ||
           message.includes('service_unavailable');
  }
  
  return false;
} 