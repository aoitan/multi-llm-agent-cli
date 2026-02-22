import { ChatMessage } from "../../shared/types/chat";

export interface SessionContextPolicy {
  maxTurns: number;
  summaryEnabled: boolean;
}

export interface SessionRecord {
  model?: string;
  messages: ChatMessage[];
  summary?: string;
  policy: SessionContextPolicy;
  savedAt?: string;
  loadedAt?: string;
  updatedAt: string;
}

export const DEFAULT_SESSION_CONTEXT_POLICY: SessionContextPolicy = {
  maxTurns: 10,
  summaryEnabled: false,
};

export const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
export const SESSION_ID_MAX_LENGTH = 256;

export function isValidSessionId(sessionId: string): boolean {
  return (
    typeof sessionId === "string" &&
    sessionId.length > 0 &&
    sessionId.length <= SESSION_ID_MAX_LENGTH &&
    SESSION_ID_PATTERN.test(sessionId)
  );
}

export interface SessionStorePort {
  getModel(sessionId: string): Promise<string | undefined>;
  setModel(sessionId: string, model: string): Promise<void>;
  getSession?(sessionId: string): Promise<SessionRecord | undefined>;
  saveSession?(sessionId: string, session: SessionRecord): Promise<void>;
  endSession?(sessionId: string): Promise<void>;
}
