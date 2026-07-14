import { getHeaders, handleResponse } from './apiClient';

const BASE = '/api/provisioning';

export const provisioningApi = {
  // ── Providers ──

  async listProviders() {
    const res = await fetch(`${BASE}/providers`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async getProvider(id: string) {
    const res = await fetch(`${BASE}/providers/${id}`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async createProvider(data: {
    name: string;
    type: string;
    hostname: string;
    port?: number;
    username?: string;
    apiKey?: string;
    apiSecret?: string;
    useSSL?: boolean;
    verifySSL?: boolean;
    config?: Record<string, any>;
  }) {
    const res = await fetch(`${BASE}/providers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateProvider(id: string, data: Record<string, any>) {
    const res = await fetch(`${BASE}/providers/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteProvider(id: string) {
    const res = await fetch(`${BASE}/providers/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async testProvider(id: string) {
    const res = await fetch(`${BASE}/providers/${id}/test`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  // ── Service Instances ──

  async listInstances(subscriptionId?: string) {
    const params = new URLSearchParams();
    if (subscriptionId) params.set('subscriptionId', subscriptionId);
    const qs = params.toString();
    const res = await fetch(`${BASE}/instances${qs ? `?${qs}` : ''}`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async getInstance(id: string) {
    const res = await fetch(`${BASE}/instances/${id}`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async createInstance(data: {
    subscriptionId?: string;
    providerId: string;
    serviceName: string;
    serviceType: string;
    email?: string;
    domain?: string;
    diskQuota?: number;
    bandwidthQuota?: number;
    emailAccounts?: number;
    databases?: number;
    subdomains?: number;
    packageName?: string;
  }) {
    const res = await fetch(`${BASE}/instances`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteInstance(id: string) {
    const res = await fetch(`${BASE}/instances/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  // ── Provisioning Operations ──

  async provisionInstance(id: string) {
    const res = await fetch(`${BASE}/instances/${id}/provision`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async suspendInstance(id: string) {
    const res = await fetch(`${BASE}/instances/${id}/suspend`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async terminateInstance(id: string) {
    const res = await fetch(`${BASE}/instances/${id}/terminate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  // ── Tasks ──

  async listTasks(serviceInstanceId?: string) {
    const params = new URLSearchParams();
    if (serviceInstanceId) params.set('serviceInstanceId', serviceInstanceId);
    const qs = params.toString();
    const res = await fetch(`${BASE}/tasks${qs ? `?${qs}` : ''}`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async getTask(id: string) {
    const res = await fetch(`${BASE}/tasks/${id}`, { headers: getHeaders() });
    return handleResponse(res);
  },

  // ── Health Check ──

  async runHealthCheck() {
    const res = await fetch(`${BASE}/health-check`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },
};
