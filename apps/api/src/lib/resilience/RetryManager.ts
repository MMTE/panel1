import { logger } from '../logging/Logger';
import { Panel1Error, TimeoutError } from '../errors';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number;
  backoffMultiplier: number;
  retryCondition?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number; // milliseconds
  monitoringPeriod: number; // milliseconds
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(private config: CircuitBreakerConfig, private name: string) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime < this.config.recoveryTimeout) {
        logger.warn('Circuit breaker is OPEN, rejecting request', {
          circuitBreaker: this.name,
          state: this.state,
          failureCount: this.failureCount,
          timeSinceLastFailure: Date.now() - this.lastFailureTime,
        });
        
        throw new Panel1Error('Circuit breaker is OPEN', {
          circuitBreaker: this.name,
          circuitState: this.state,
          failureCount: this.failureCount,
        });
      }
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      
      logger.info('Circuit breaker transitioning to HALF_OPEN', {
        circuitBreaker: this.name,
        state: this.state,
      });
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.failureThreshold) {
        this.state = CircuitState.CLOSED;
        logger.info('Circuit breaker recovered to CLOSED state', {
          circuitBreaker: this.name,
          state: this.state,
          successCount: this.successCount,
        });
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.error('Circuit breaker opened due to failures', {
        circuitBreaker: this.name,
        state: this.state,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

export class RetryManager {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
    operationName?: string
  ): Promise<T> {
    let lastError: Error;
    const correlationId = `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        logger.debug('Executing operation attempt', {
          correlationId,
          operation: operationName,
          attempt,
          maxAttempts: config.maxAttempts,
        });

        const result = await operation();
        
        if (attempt > 1) {
          logger.info('Operation succeeded after retries', {
            correlationId,
            operation: operationName,
            attempts: attempt,
            totalAttempts: config.maxAttempts,
          });
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        logger.warn('Operation failed on attempt', {
          correlationId,
          operation: operationName,
          attempt,
          maxAttempts: config.maxAttempts,
          error: lastError.message,
          errorType: lastError.constructor.name,
        });

        // Check if we should retry
        const shouldRetry = attempt < config.maxAttempts && 
                           (!config.retryCondition || config.retryCondition(lastError));
        
        if (!shouldRetry) {
          if (attempt === config.maxAttempts) {
            logger.error('Operation failed after all retry attempts', {
              correlationId,
              operation: operationName,
              attempts: attempt,
              finalError: lastError.message,
            });
          } else {
            logger.info('Operation not retryable, failing immediately', {
              correlationId,
              operation: operationName,
              attempt,
              error: lastError.message,
            });
          }
          break;
        }

        // Call retry callback
        config.onRetry?.(attempt, lastError);

        // Calculate delay with exponential backoff and jitter
        const baseDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
        const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
        const delay = Math.min(baseDelay + jitter, config.maxDelay);

        logger.debug('Retrying operation after delay', {
          correlationId,
          operation: operationName,
          delay,
          nextAttempt: attempt + 1,
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitBreakerKey: string,
    circuitConfig: CircuitBreakerConfig
  ): Promise<T> {
    let circuitBreaker = this.circuitBreakers.get(circuitBreakerKey);
    
    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreaker(circuitConfig, circuitBreakerKey);
      this.circuitBreakers.set(circuitBreakerKey, circuitBreaker);
      
      logger.info('Created new circuit breaker', {
        circuitBreaker: circuitBreakerKey,
        config: circuitConfig,
      });
    }

    return circuitBreaker.execute(operation);
  }

  async executeWithRetryAndCircuitBreaker<T>(
    operation: () => Promise<T>,
    retryConfig: RetryConfig,
    circuitBreakerKey: string,
    circuitConfig: CircuitBreakerConfig,
    operationName?: string
  ): Promise<T> {
    return this.executeWithRetry(
      async () => {
        return this.executeWithCircuitBreaker(
          operation,
          circuitBreakerKey,
          circuitConfig
        );
      },
      retryConfig,
      operationName
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get circuit breaker statistics
  getCircuitBreakerStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [key, breaker] of this.circuitBreakers.entries()) {
      stats[key] = breaker.getStats();
    }
    return stats;
  }

  // Reset a specific circuit breaker
  resetCircuitBreaker(key: string): boolean {
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      this.circuitBreakers.delete(key);
      logger.info('Circuit breaker reset', { circuitBreaker: key });
      return true;
    }
    return false;
  }

  // Default retry configurations
  static readonly DEFAULT_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryCondition: (error) => {
      if (error instanceof Panel1Error) {
        return error.retryable;
      }
      // Retry on common transient errors
      const message = error.message.toLowerCase();
      return message.includes('timeout') ||
             message.includes('network') ||
             message.includes('econnreset') ||
             message.includes('enotfound') ||
             message.includes('service_unavailable') ||
             message.includes('temporary');
    },
  };

  static readonly PAYMENT_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryCondition: (error) => {
      if (error instanceof Panel1Error) {
        return error.retryable;
      }
      // Be more conservative with payment retries
      const message = error.message.toLowerCase();
      return message.includes('timeout') || 
             message.includes('network') ||
             message.includes('service_unavailable') ||
             message.includes('rate_limit');
    },
  };

  static readonly PROVISIONING_CONFIG: RetryConfig = {
    maxAttempts: 5,
    baseDelay: 5000,
    maxDelay: 60000,
    backoffMultiplier: 1.5,
    retryCondition: (error) => {
      if (error instanceof Panel1Error) {
        return error.retryable;
      }
      // Retry most provisioning errors except authentication
      const message = error.message.toLowerCase();
      return !message.includes('authentication') &&
             !message.includes('unauthorized') &&
             !message.includes('forbidden');
    },
  };

  static readonly DATABASE_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    retryCondition: (error) => {
      const message = error.message.toLowerCase();
      // Retry on connection issues, not on constraint violations
      return message.includes('connection') ||
             message.includes('timeout') ||
             message.includes('deadlock') ||
             message.includes('lock_timeout');
    },
  };

  // Default circuit breaker configurations
  static readonly DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    recoveryTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
  };

  static readonly PAYMENT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 3,
    recoveryTimeout: 30000, // 30 seconds
    monitoringPeriod: 180000, // 3 minutes
  };

  static readonly PROVISIONING_CIRCUIT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    recoveryTimeout: 120000, // 2 minutes
    monitoringPeriod: 600000, // 10 minutes
  };
}

export const retryManager = new RetryManager(); 