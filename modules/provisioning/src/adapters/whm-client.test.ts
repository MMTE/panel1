import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProvisioningConfig } from '../types.js';
import { CpanelAdapter } from './CpanelAdapter.js';
import { WhmApiError, WhmClient } from './whm-client.js';

const config: ProvisioningConfig = {
  hostname: 'whm.example.com',
  port: 2087,
  username: 'root',
  apiKey: 'test-api-key',
  useSSL: true,
  verifySSL: true,
  timeout: 5000,
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('WhmClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the URL once and sends the WHM auth header (GET)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: [{ status: 1, statusmsg: 'Ok' }] }));

    const client = new WhmClient(config);
    await client.suspendacct('someuser', 'abuse');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://whm.example.com:2087/json-api/suspendacct?user=someuser&reason=abuse',
    );
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('WHM root:test-api-key');
  });

  it('createacct POSTs credentials in the body, not the query string', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: [{ status: 1, statusmsg: 'Account Creation Ok' }] }));

    const client = new WhmClient(config);
    await client.createacct({
      username: 'acme',
      password: 's3cret!',
      domain: 'acme.com',
      contactemail: 'admin@acme.com',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://whm.example.com:2087/json-api/createacct');
    expect(init.method).toBe('POST');
    expect(url).not.toContain('s3cret');
    expect(init.body).toContain('username=acme');
    expect(init.body).toContain('password=s3cret%21');
    expect(init.body).toContain('domain=acme.com');
    expect(init.body).toContain('contactemail=admin%40acme.com');
  });

  it('does not append the port twice (the old healthCheck bug)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: '11.108' }));

    await new WhmClient(config).request('version');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://whm.example.com:2087/json-api/version');
    expect(url.match(/:2087/g)).toHaveLength(1);
  });

  it('omits the port when none is configured', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: '11.108' }));

    await new WhmClient({ ...config, port: 0 }).request('version');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://whm.example.com/json-api/version');
  });

  it('succeeds on 2xx with status 1', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ result: [{ status: 1, statusmsg: 'Account Creation Ok', ip: '1.2.3.4' }] }),
    );

    const data = await new WhmClient(config).createacct({
      username: 'acme',
      password: 'pw',
      domain: 'acme.com',
    });

    expect(data.ip).toBe('1.2.3.4');
  });

  it('throws with statusmsg on non-2xx HTTP responses', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { statusmsg: 'Permission denied', status: 0 },
        403,
      ),
    );

    const client = new WhmClient(config);
    const promise = client.removeacct('acme');
    await expect(promise).rejects.toThrow('Permission denied');
    await expect(promise).rejects.toBeInstanceOf(WhmApiError);
  });

  it('throws with a generic message on non-2xx without statusmsg', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(new WhmClient(config).request('version')).rejects.toThrow(
      'WHM API version failed: HTTP 500',
    );
  });

  it('throws with statusmsg when cPanel reports status 0 (HTTP 200)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        result: [
          {
            status: 0,
            statusmsg: 'That domain already exists in the userdata.',
          },
        ],
      }),
    );

    const client = new WhmClient(config);
    await expect(
      client.createacct({ username: 'acme', password: 'pw', domain: 'acme.com' }),
    ).rejects.toThrow('That domain already exists in the userdata.');
  });

  it('throws with metadata.reason for metadata-style responses', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ metadata: { result: 0, reason: 'Invalid user' } }),
    );

    await expect(new WhmClient(config).unsuspendacct('acme')).rejects.toThrow('Invalid user');
  });

  it('throws on network errors without retrying API-level failures', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ result: [{ status: 0, statusmsg: 'No such account' }] }),
    );

    await expect(new WhmClient({ ...config, retries: 3 }).removeacct('ghost')).rejects.toThrow(
      'No such account',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transport errors up to config.retries', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(jsonResponse({ version: '11.108' }));

    await new WhmClient({ ...config, retries: 2 }).request('version');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('healthCheck reports healthy on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: '11.108' }));

    const health = await new WhmClient(config).healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.status).toBe('healthy');
  });

  it('healthCheck reports error on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ statusmsg: 'Not authorized' }, 401));

    const health = await new WhmClient(config).healthCheck();
    expect(health.healthy).toBe(false);
    expect(health.status).toBe('error');
    expect(health.message).toBe('Not authorized');
  });
});

describe('CpanelAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const params = {
    serviceName: 'acme',
    serviceType: 'cpanel',
    domain: 'acme.com',
    email: 'admin@acme.com',
  };

  it('provision returns success with the generated credentials', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ result: [{ status: 1, statusmsg: 'Account Creation Ok', ip: '1.2.3.4' }] }),
    );

    const result = await new CpanelAdapter(config).provision(params);

    expect(result.success).toBe(true);
    expect(result.data?.username).toBe('acmecom');
    expect(result.data?.password).toMatch(/^.{16,}$/);
    expect(result.data?.remoteId).toBe('acmecom');
    expect(result.data?.ipAddress).toBe('1.2.3.4');
    expect(result.data?.controlPanelUrl).toBe('https://whm.example.com:2083');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://whm.example.com:2087/json-api/createacct');
    expect(init.body).toContain(`password=${encodeURIComponent(result.data!.password!)}`);
  });

  it('provision surfaces WHM failures as success:false (no fake success, #62)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        result: [{ status: 0, statusmsg: 'That domain already exists in the userdata.' }],
      }),
    );

    const result = await new CpanelAdapter(config).provision(params);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('That domain already exists in the userdata.');
  });

  it('provision surfaces HTTP failures as success:false', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ statusmsg: 'Login failed' }, 401));

    const result = await new CpanelAdapter(config).provision(params);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Login failed');
  });

  it('suspend calls suspendacct and surfaces failures', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ result: [{ status: 0, statusmsg: 'Account does not exist' }] }),
    );

    const result = await new CpanelAdapter(config).suspend({ ...params, username: 'acme' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/json-api/suspendacct?user=acme');
    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Account does not exist');
  });

  it('unsuspend calls unsuspendacct', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: [{ status: 1, statusmsg: 'Ok' }] }));

    const result = await new CpanelAdapter(config).unsuspend({ ...params, username: 'acme' });

    expect(fetchMock.mock.calls[0][0]).toContain('/json-api/unsuspendacct?user=acme');
    expect(result.success).toBe(true);
  });

  it('terminate calls removeacct and surfaces failures', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ result: [{ status: 0, statusmsg: 'You do not own the account' }] }),
    );

    const result = await new CpanelAdapter(config).terminate({ ...params, username: 'acme' });

    expect(fetchMock.mock.calls[0][0]).toContain('/json-api/removeacct');
    expect(fetchMock.mock.calls[0][0]).toContain('username=acme');
    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('You do not own the account');
  });

  it('healthCheck delegates to the client (port appended once)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: '11.108' }));

    const health = await new CpanelAdapter(config).healthCheck();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://whm.example.com:2087/json-api/version');
    expect(url.match(/:2087/g)).toHaveLength(1);
    expect(health.healthy).toBe(true);
  });
});
