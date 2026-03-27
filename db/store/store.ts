export class Store {
  private storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  async init(): Promise<void> {
    // initialize store if needed
  }

  async get(key: string): Promise<string | null> {
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    // persist value
  }

  async delete(key: string): Promise<void> {
    // remove value
  }
}
