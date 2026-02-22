import { ResolveModelUseCase } from "../model-endpoint/resolve-model.usecase";
import { LlmClientPort } from "../../ports/outbound/llm-client.port";
import {
  DEFAULT_SESSION_CONTEXT_POLICY,
  SessionContextPolicy,
  SessionRecord,
  SessionStorePort,
} from "../../ports/outbound/session-store.port";
import { ChatMessage, ModelResolutionSource } from "../../shared/types/chat";

export interface ChatSessionStartInput {
  sessionId: string;
  cliModel?: string;
}

export interface ChatSessionStartSuccess {
  ok: true;
  model: string;
  source: ModelResolutionSource;
}

export interface ChatSessionStartFailure {
  ok: false;
  code: "MODEL_NOT_FOUND";
  model: string;
  candidates: string[];
}

export type ChatSessionStartResult =
  | ChatSessionStartSuccess
  | ChatSessionStartFailure;

export interface ChatContextSnapshot {
  messages: ChatMessage[];
  policy: SessionContextPolicy;
}

export interface ChatSessionLoadResult {
  session: SessionRecord;
  restoredMessageCount: number;
  restoredSummary: boolean;
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' was not found.`);
    this.name = "SessionNotFoundError";
  }
}

function normalizeMaxTurns(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_SESSION_CONTEXT_POLICY.maxTurns;
  }
  return Math.floor(value);
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }
  if (value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 3) {
    return ".".repeat(maxChars);
  }
  return `${value.slice(0, maxChars - 3)}...`;
}

function buildMergedSummary(
  previousSummary: string,
  oldMessageSummary: string,
  maxChars = 500,
): string {
  const next = compactText(oldMessageSummary);
  const previous = compactText(previousSummary);
  if (!previous) {
    return truncateText(next, maxChars);
  }
  if (!next) {
    return truncateText(`previous: ${previous}`, maxChars);
  }

  const separator = " | previous: ";
  const budgetForNext = Math.min(
    next.length,
    Math.max(120, Math.floor(maxChars * 0.65)),
  );
  const budgetForPrevious = Math.max(
    0,
    maxChars - separator.length - budgetForNext,
  );
  const merged = `${truncateText(next, budgetForNext)}${separator}${truncateText(
    previous,
    budgetForPrevious,
  )}`;
  return truncateText(merged, maxChars);
}

export class RunChatUseCase {
  constructor(
    private readonly resolver: ResolveModelUseCase,
    private readonly llmClient: LlmClientPort,
    private readonly sessionStore: SessionStorePort,
  ) {}

  async startSession(
    input: ChatSessionStartInput,
  ): Promise<ChatSessionStartResult> {
    const resolved = await this.resolver.execute({
      sessionId: input.sessionId,
      cliModel: input.cliModel,
    });

    const availableModels = await this.llmClient.listModels();
    const availableModelNames = availableModels.map((m) => m.name);
    if (!availableModelNames.includes(resolved.model)) {
      return {
        ok: false,
        code: "MODEL_NOT_FOUND",
        model: resolved.model,
        candidates: availableModelNames,
      };
    }

    const session = await this.getOrCreateSession(input.sessionId);
    await this.writeSession(input.sessionId, {
      ...session,
      model: resolved.model,
      updatedAt: new Date().toISOString(),
    });
    return {
      ok: true,
      model: resolved.model,
      source: resolved.source,
    };
  }

  async loadContext(sessionId: string): Promise<ChatContextSnapshot> {
    const session = await this.requireExistingSession(sessionId);
    const maxMessages = session.policy.maxTurns * 2;
    const recentMessages =
      maxMessages > 0 ? session.messages.slice(-maxMessages) : [];
    const messages: ChatMessage[] = [...recentMessages];
    if (session.summary && session.summary.trim().length > 0) {
      messages.unshift({
        role: "assistant",
        content: `Context summary (untrusted): ${session.summary}`,
      });
    }

    return {
      messages,
      policy: session.policy,
    };
  }

  async saveSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.requireExistingSession(sessionId);
    const updated: SessionRecord = {
      ...session,
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.writeSession(sessionId, updated);
    return updated;
  }

  async loadSession(sessionId: string): Promise<ChatSessionLoadResult> {
    const session = await this.requireExistingSession(sessionId);
    const now = new Date().toISOString();
    const updated: SessionRecord = {
      ...session,
      loadedAt: now,
      updatedAt: now,
    };
    await this.writeSession(sessionId, updated);
    return {
      session: updated,
      restoredMessageCount: updated.messages.length,
      restoredSummary: Boolean(updated.summary && updated.summary.trim()),
    };
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    if (this.sessionStore.getSession) {
      return this.sessionStore.getSession(sessionId);
    }

    const model = await this.sessionStore.getModel(sessionId);
    if (!model) {
      return undefined;
    }
    return this.createDefaultSession(model);
  }

  async endSession(sessionId: string): Promise<void> {
    if (this.sessionStore.endSession) {
      await this.sessionStore.endSession(sessionId);
      return;
    }
    await this.sessionStore.setModel(sessionId, "");
  }

  async setContextPolicy(
    sessionId: string,
    policyPatch: Partial<SessionContextPolicy>,
  ): Promise<SessionRecord> {
    const session = await this.requireExistingSession(sessionId);
    const nextPolicy: SessionContextPolicy = {
      maxTurns:
        policyPatch.maxTurns === undefined
          ? session.policy.maxTurns
          : normalizeMaxTurns(policyPatch.maxTurns),
      summaryEnabled:
        policyPatch.summaryEnabled === undefined
          ? session.policy.summaryEnabled
          : policyPatch.summaryEnabled,
    };
    const updated = {
      ...session,
      policy: nextPolicy,
      updatedAt: new Date().toISOString(),
    };
    await this.writeSession(sessionId, updated);
    return updated;
  }

  async clearContext(sessionId: string, keepTurns = 0): Promise<SessionRecord> {
    const session = await this.requireExistingSession(sessionId);
    const keepMessages = Math.max(0, Math.floor(keepTurns)) * 2;
    const recent =
      keepMessages > 0 ? session.messages.slice(-keepMessages) : [];
    const updated: SessionRecord = {
      ...session,
      messages: recent,
      summary: undefined,
      updatedAt: new Date().toISOString(),
    };
    await this.writeSession(sessionId, updated);
    return updated;
  }

  async summarizeContext(sessionId: string): Promise<SessionRecord> {
    const session = await this.requireExistingSession(sessionId);
    const keepMessages = session.policy.maxTurns * 2;
    if (session.messages.length <= keepMessages) {
      return session;
    }

    const oldMessages = session.messages.slice(
      0,
      session.messages.length - keepMessages,
    );
    const recentMessages =
      keepMessages > 0 ? session.messages.slice(-keepMessages) : [];
    const oldMessageSummary = oldMessages
      .map((m) => `${m.role}: ${compactText(m.content)}`)
      .join(" | ");
    const summary = buildMergedSummary(
      session.summary ?? "",
      oldMessageSummary,
    );

    const updated: SessionRecord = {
      ...session,
      summary,
      messages: recentMessages,
      updatedAt: new Date().toISOString(),
    };
    await this.writeSession(sessionId, updated);
    return updated;
  }

  async recordTurn(
    sessionId: string,
    userInput: string,
    assistantResponse: string,
  ): Promise<void> {
    const session = await this.requireExistingSession(sessionId);
    const nextMessages = [
      ...session.messages,
      { role: "user", content: userInput } as ChatMessage,
      { role: "assistant", content: assistantResponse } as ChatMessage,
    ];
    await this.writeSession(sessionId, {
      ...session,
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
    });

    if (session.policy.summaryEnabled) {
      await this.summarizeContext(sessionId);
    }
  }

  async *runTurn(
    model: string,
    messages: ChatMessage[],
  ): AsyncGenerator<string> {
    for await (const chunk of this.llmClient.chat(model, messages)) {
      if (chunk.content) {
        yield chunk.content;
      }
      if (chunk.done) {
        return;
      }
    }
  }

  private createDefaultSession(model?: string): SessionRecord {
    return {
      model,
      messages: [],
      policy: { ...DEFAULT_SESSION_CONTEXT_POLICY },
      updatedAt: new Date().toISOString(),
    };
  }

  private async getOrCreateSession(sessionId: string): Promise<SessionRecord> {
    const existing = await this.getSession(sessionId);
    if (existing) {
      return {
        ...existing,
        policy: {
          maxTurns: normalizeMaxTurns(existing.policy.maxTurns),
          summaryEnabled: existing.policy.summaryEnabled,
        },
      };
    }

    const created = this.createDefaultSession();
    await this.writeSession(sessionId, created);
    return created;
  }

  private async requireExistingSession(
    sessionId: string,
  ): Promise<SessionRecord> {
    const existing = await this.getSession(sessionId);
    if (!existing) {
      throw new SessionNotFoundError(sessionId);
    }
    return {
      ...existing,
      policy: {
        maxTurns: normalizeMaxTurns(existing.policy.maxTurns),
        summaryEnabled: existing.policy.summaryEnabled,
      },
    };
  }

  private async writeSession(
    sessionId: string,
    session: SessionRecord,
  ): Promise<void> {
    if (this.sessionStore.saveSession) {
      await this.sessionStore.saveSession(sessionId, session);
      return;
    }

    if (session.model) {
      await this.sessionStore.setModel(sessionId, session.model);
    }
  }
}
