import { SessionStorePort } from "../../ports/outbound/session-store.port";

export class InMemorySessionStoreAdapter implements SessionStorePort {
  private readonly models = new Map<string, string>();

  async getModel(sessionId: string): Promise<string | undefined> {
    return this.models.get(sessionId);
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    this.models.set(sessionId, model);
  }
}
