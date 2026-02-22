import {
  DEFAULT_SESSION_CONTEXT_POLICY,
  isValidSessionId,
  SessionRecord,
  SessionStorePort,
} from "../../ports/outbound/session-store.port";

function cloneSession(session: SessionRecord): SessionRecord {
  return JSON.parse(JSON.stringify(session)) as SessionRecord;
}

function validateSessionId(sessionId: string): void {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
}

export class InMemorySessionStoreAdapter implements SessionStorePort {
  private readonly sessions = new Map<string, SessionRecord>();

  async getModel(sessionId: string): Promise<string | undefined> {
    validateSessionId(sessionId);
    return this.sessions.get(sessionId)?.model;
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    validateSessionId(sessionId);
    const existing = this.sessions.get(sessionId);
    const next: SessionRecord = existing
      ? { ...existing, model, updatedAt: new Date().toISOString() }
      : {
          model,
          messages: [],
          policy: { ...DEFAULT_SESSION_CONTEXT_POLICY },
          updatedAt: new Date().toISOString(),
        };
    this.sessions.set(sessionId, next);
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    validateSessionId(sessionId);
    const session = this.sessions.get(sessionId);
    return session ? cloneSession(session) : undefined;
  }

  async saveSession(sessionId: string, session: SessionRecord): Promise<void> {
    validateSessionId(sessionId);
    this.sessions.set(sessionId, cloneSession(session));
  }

  async endSession(sessionId: string): Promise<void> {
    validateSessionId(sessionId);
    this.sessions.delete(sessionId);
  }
}
