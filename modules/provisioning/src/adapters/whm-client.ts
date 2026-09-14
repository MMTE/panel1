import type { HealthCheckResult, ProvisioningConfig } from '../types.js';

/** Error thrown when a WHM API1 call fails (HTTP, transport, or cPanel status). */
export class WhmApiError extends Error {
  readonly httpStatus?: number;

  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = 'WhmApiError';
    this.httpStatus = httpStatus;
  }
}

interface CreateAcctParams {
  username: string;
  password: string;
  domain: string;
  contactemail?: string;
  plan?: string;
  quota?: number;
  bandwidth?: number;
  cgiquota?: number;
  maxsql?: number;
  maxsub?: number;
  maxpop?: number;
}

/**
 * Minimal WHM API1 client.
 *
 * Calls `{scheme}://{host}[:{port}]/json-api/<function>` with an
 * `Authorization: WHM <username>:<apiKey>` header. URL building lives here and
 * only here — adapters must never concatenate ports onto a base URL
 * (the old CpanelAdapter.healthCheck double-appended the port).
 *
 * A call fails when the HTTP response is non-2xx, the transport errors, or
 * cPanel reports a failed status (`result.status === 0` /
 * `metadata.result === 0`); in every failure case the cPanel `statusmsg`
 * (or `metadata.reason`) becomes the error message, mirroring
 * cpanel-management-app's server/src/providers/cpanel-client.ts.
 */
export class WhmClient {
  private readonly config: ProvisioningConfig;

  constructor(config: ProvisioningConfig) {
    this.config = config;
  }

  /** Build the WHM base URL exactly once, appending the port only if set. */
  private baseUrl(): string {
    const scheme = this.config.useSSL ? 'https' : 'http';
    const port = this.config.port ? `:${this.config.port}` : '';
    return `${scheme}://${this.config.hostname}${port}`;
  }

  private authHeader(): string {
    return `WHM ${this.config.username || 'root'}:${this.config.apiKey}`;
  }

  async request<T = any>(
    fn: string,
    params: Record<string, unknown> = {},
    method: 'GET' | 'POST' = 'GET',
  ): Promise<T> {
    const retries = Math.max(0, this.config.retries ?? 0);
    const timeout = this.config.timeout ?? 10000;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const url = new URL(`${this.baseUrl()}/json-api/${fn}`);
      let body: URLSearchParams | undefined;

      if (method === 'POST') {
        body = new URLSearchParams();
      }
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        if (body) body.append(key, String(value));
        else url.searchParams.append(key, String(value));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url.toString(), {
          method,
          headers: {
            Authorization: this.authHeader(),
            ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          },
          body: body ? body.toString() : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);
        // API-level errors are definitive — never retried.
        return await this.unwrapResponse<T>(fn, response);
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof WhmApiError) throw error;
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`WHM API ${fn} failed after ${retries + 1} attempt(s)`);
  }

  /** Turn a WHM JSON response into a result or a WhmApiError. */
  private async unwrapResponse<T>(fn: string, response: Response): Promise<T> {
    let data: any = undefined;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // fall through — handled by the HTTP status check below
      }
    }

    // WHM API1 responses come in two shapes: `{"result": [{...}]}` (createacct
    // and friends) and `{"metadata": {"result": 0|1, "reason": "..."}}`.
    const result = Array.isArray(data?.result) ? data.result[0] : data?.result;

    if (!response.ok) {
      throw new WhmApiError(
        statusmsgOf(data, result) || `WHM API ${fn} failed: HTTP ${response.status}`,
        response.status,
      );
    }

    const status = result?.status ?? data?.status ?? data?.metadata?.result;
    if (status === 0) {
      throw new WhmApiError(
        statusmsgOf(data, result) || `WHM API ${fn} failed (status 0)`,
        response.status,
      );
    }

    return (result !== undefined ? result : data) as T;
  }

  async createacct(params: CreateAcctParams): Promise<any> {
    return this.request(
      'createacct',
      {
        username: params.username,
        password: params.password,
        domain: params.domain,
        contactemail: params.contactemail,
        plan: params.plan,
        quota: params.quota,
        bandwidth: params.bandwidth,
        cgiquota: params.cgiquota,
        maxsql: params.maxsql,
        maxsub: params.maxsub,
        maxpop: params.maxpop,
      },
      'POST',
    );
  }

  async suspendacct(user: string, reason?: string): Promise<any> {
    return this.request('suspendacct', { user, reason });
  }

  async unsuspendacct(user: string): Promise<any> {
    return this.request('unsuspendacct', { user });
  }

  async removeacct(user: string, options: { keepDns?: boolean } = {}): Promise<any> {
    return this.request('removeacct', {
      username: user,
      keepdns: options.keepDns ? 1 : undefined,
    });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const started = Date.now();
    try {
      await this.request('version');
      return {
        healthy: true,
        status: 'healthy',
        message: 'WHM server is responding',
        responseTime: Date.now() - started,
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Connection failed',
        responseTime: Date.now() - started,
      };
    }
  }
}

function statusmsgOf(data: any, result: any): string | undefined {
  return result?.statusmsg || data?.statusmsg || data?.metadata?.reason || data?.error;
}
