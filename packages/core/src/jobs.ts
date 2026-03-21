export interface JobEntry {
  name: string;
  cron: string;
  handler: () => Promise<void>;
  moduleName: string;
}

export class JobScheduler {
  private jobs: JobEntry[] = [];

  register(name: string, cron: string, handler: () => Promise<void>, moduleName: string): void {
    this.jobs.push({ name, cron, handler, moduleName });
  }

  list(): JobEntry[] {
    return [...this.jobs];
  }

  clear(): void {
    this.jobs = [];
  }
}
