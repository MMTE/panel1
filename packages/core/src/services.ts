export class ServiceRegistry {
  private services = new Map<string, unknown>();

  register(name: string, implementation: unknown): void {
    if (this.services.has(name)) {
      throw new Error(`Service "${name}" is already registered`);
    }
    this.services.set(name, implementation);
  }

  resolve<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service "${name}" is not registered. Is the module that provides it enabled?`);
    }
    return service as T;
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }

  clear(): void {
    this.services.clear();
  }
}
