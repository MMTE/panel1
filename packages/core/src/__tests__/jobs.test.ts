import { describe, it, expect, vi } from 'vitest';
import { JobScheduler } from '../jobs.js';

describe('JobScheduler', () => {
  it('register + runNow tracks execution without Redis (in-process)', async () => {
    const js = new JobScheduler();
    const h = vi.fn().mockResolvedValue(undefined);
    js.register('j1', '0 0 1 1 *', h, 'mod-a');
    await js.runNow('j1');
    const rows = await js.listJobs();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('j1');
    expect(rows[0].successCount).toBe(1);
    expect(rows[0].failureCount).toBe(0);
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('runNow throws when job missing', async () => {
    const js = new JobScheduler();
    await expect(js.runNow('nope')).rejects.toThrow(/not registered/);
  });
});
