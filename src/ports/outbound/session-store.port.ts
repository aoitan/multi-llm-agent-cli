export interface SessionStorePort {
  getModel(sessionId: string): Promise<string | undefined>;
  setModel(sessionId: string, model: string): Promise<void>;
}
