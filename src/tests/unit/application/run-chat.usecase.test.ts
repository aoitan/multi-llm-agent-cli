import { RunChatUseCase } from "../../../application/chat/run-chat.usecase";
import { ResolveModelUseCase } from "../../../application/model-endpoint/resolve-model.usecase";
import { ConfigPort } from "../../../ports/outbound/config.port";
import {
  LlmClientPort,
  ModelSummary,
} from "../../../ports/outbound/llm-client.port";
import {
  DEFAULT_SESSION_CONTEXT_POLICY,
  SessionRecord,
  SessionStorePort,
} from "../../../ports/outbound/session-store.port";
import { ChatChunk, ChatMessage } from "../../../shared/types/chat";

class FakeSessionStore implements SessionStorePort {
  private sessions = new Map<string, SessionRecord>();

  async getModel(sessionId: string): Promise<string | undefined> {
    return this.sessions.get(sessionId)?.model;
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    const existing = this.sessions.get(sessionId);
    this.sessions.set(sessionId, {
      model,
      messages: existing?.messages ?? [],
      summary: existing?.summary,
      policy: existing?.policy ?? { ...DEFAULT_SESSION_CONTEXT_POLICY },
      savedAt: existing?.savedAt,
      updatedAt: new Date().toISOString(),
    });
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    return this.sessions.get(sessionId);
  }

  async saveSession(sessionId: string, session: SessionRecord): Promise<void> {
    this.sessions.set(sessionId, session);
  }

  async endSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

class FakeConfig implements ConfigPort {
  constructor(private readonly defaultModel: string) {}

  async getDefaultModel(): Promise<string> {
    return this.defaultModel;
  }

  async setDefaultModel(_model: string): Promise<void> {}
}

class FakeLlmClient implements LlmClientPort {
  constructor(
    private readonly models: ModelSummary[],
    private readonly chunks: ChatChunk[] = [],
  ) {}

  async listModels(): Promise<ModelSummary[]> {
    return this.models;
  }

  async *chat(
    _model: string,
    _messages: ChatMessage[],
  ): AsyncGenerator<ChatChunk> {
    for (const chunk of this.chunks) {
      yield chunk;
    }
  }
}

describe("RunChatUseCase", () => {
  it("starts session with resolved model and persists it", async () => {
    const sessionStore = new FakeSessionStore();
    const resolver = new ResolveModelUseCase(
      new FakeConfig("default-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: "default-model" }]),
      sessionStore,
    );

    const result = await useCase.startSession({ sessionId: "s-1" });

    expect(result).toEqual({
      ok: true,
      model: "default-model",
      source: "default",
    });
    await expect(sessionStore.getModel("s-1")).resolves.toBe("default-model");
  });

  it("returns actionable error when model is missing", async () => {
    const sessionStore = new FakeSessionStore();
    const resolver = new ResolveModelUseCase(
      new FakeConfig("missing-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: "available-model" }]),
      sessionStore,
    );

    const result = await useCase.startSession({ sessionId: "s-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result).toEqual({
        ok: false,
        code: "MODEL_NOT_FOUND",
        model: "missing-model",
        candidates: ["available-model"],
      });
    }
  });

  it("streams tokens for one turn", async () => {
    const sessionStore = new FakeSessionStore();
    const resolver = new ResolveModelUseCase(
      new FakeConfig("default-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient(
        [{ name: "default-model" }],
        [
          { content: "Hello", done: false },
          { content: " world", done: false },
          { content: "", done: true },
        ],
      ),
      sessionStore,
    );

    const received: string[] = [];
    for await (const token of useCase.runTurn("default-model", [
      { role: "user", content: "Hi" },
    ])) {
      received.push(token);
    }

    expect(received).toEqual(["Hello", " world"]);
  });

  it("stops yielding tokens when done chunk is received", async () => {
    const sessionStore = new FakeSessionStore();
    const resolver = new ResolveModelUseCase(
      new FakeConfig("default-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient(
        [{ name: "default-model" }],
        [
          { content: "A", done: false },
          { content: "B", done: true },
          { content: "C", done: false },
        ],
      ),
      sessionStore,
    );

    const received: string[] = [];
    for await (const token of useCase.runTurn("default-model", [
      { role: "user", content: "Hi" },
    ])) {
      received.push(token);
    }

    expect(received).toEqual(["A", "B"]);
  });

  it("loads context with summary and max-turn window", async () => {
    const sessionStore = new FakeSessionStore();
    await sessionStore.saveSession("s-1", {
      model: "default-model",
      summary: "older context",
      policy: { maxTurns: 1, summaryEnabled: false },
      messages: [
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "u2" },
        { role: "assistant", content: "a2" },
      ],
      updatedAt: new Date().toISOString(),
    });
    const resolver = new ResolveModelUseCase(
      new FakeConfig("default-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: "default-model" }]),
      sessionStore,
    );

    const context = await useCase.loadContext("s-1");
    expect(context.messages).toEqual([
      {
        role: "assistant",
        content: "Context summary (untrusted): older context",
      },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
    ]);
  });

  it("records turn into session history", async () => {
    const sessionStore = new FakeSessionStore();
    const resolver = new ResolveModelUseCase(
      new FakeConfig("default-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: "default-model" }]),
      sessionStore,
    );

    await useCase.startSession({ sessionId: "s-1" });
    await useCase.recordTurn("s-1", "hello", "world");
    const session = await useCase.getSession("s-1");
    expect(session?.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ]);
  });

  it("keeps previous summary when summarizing multiple times", async () => {
    const sessionStore = new FakeSessionStore();
    await sessionStore.saveSession("s-1", {
      model: "default-model",
      summary: "older-summary",
      policy: { maxTurns: 1, summaryEnabled: false },
      messages: [
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "u2" },
        { role: "assistant", content: "a2" },
      ],
      updatedAt: new Date().toISOString(),
    });
    const resolver = new ResolveModelUseCase(
      new FakeConfig("default-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: "default-model" }]),
      sessionStore,
    );

    await useCase.summarizeContext("s-1");
    const session = await useCase.getSession("s-1");
    expect(session?.summary).toContain("user: u1");
    expect(session?.summary).toContain("previous: older-summary");
    expect(session?.messages).toEqual([
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
    ]);
  });

  it("keeps new summary information even when previous summary is very long", async () => {
    const sessionStore = new FakeSessionStore();
    await sessionStore.saveSession("s-1", {
      model: "default-model",
      summary: "p".repeat(700),
      policy: { maxTurns: 1, summaryEnabled: false },
      messages: [
        { role: "user", content: "latest-user" },
        { role: "assistant", content: "latest-assistant" },
        { role: "user", content: "kept-user" },
        { role: "assistant", content: "kept-assistant" },
      ],
      updatedAt: new Date().toISOString(),
    });
    const resolver = new ResolveModelUseCase(
      new FakeConfig("default-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: "default-model" }]),
      sessionStore,
    );

    await useCase.summarizeContext("s-1");
    const session = await useCase.getSession("s-1");
    expect(session?.summary).toContain("latest-user");
    expect(session?.summary).toContain("previous:");
  });

  it("throws when saving a non-existing session", async () => {
    const sessionStore = new FakeSessionStore();
    const resolver = new ResolveModelUseCase(
      new FakeConfig("default-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: "default-model" }]),
      sessionStore,
    );

    await expect(useCase.saveSession("missing")).rejects.toThrow(
      "Session 'missing' was not found.",
    );
  });

  it("updates loaded metadata and returns restoration summary", async () => {
    const sessionStore = new FakeSessionStore();
    await sessionStore.saveSession("s-1", {
      model: "default-model",
      summary: "kept",
      policy: { maxTurns: 2, summaryEnabled: false },
      messages: [
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" },
      ],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const resolver = new ResolveModelUseCase(
      new FakeConfig("default-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: "default-model" }]),
      sessionStore,
    );

    const loaded = await useCase.loadSession("s-1");
    expect(loaded.restoredMessageCount).toBe(2);
    expect(loaded.restoredSummary).toBe(true);
    expect(loaded.session.loadedAt).toEqual(expect.any(String));

    const persisted = await sessionStore.getSession("s-1");
    expect(persisted?.loadedAt).toEqual(expect.any(String));
  });

  it("clears summary when context is cleared with keep-turns", async () => {
    const sessionStore = new FakeSessionStore();
    await sessionStore.saveSession("s-1", {
      model: "default-model",
      summary: "should be removed",
      policy: { maxTurns: 2, summaryEnabled: false },
      messages: [
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "u2" },
        { role: "assistant", content: "a2" },
      ],
      updatedAt: new Date().toISOString(),
    });
    const resolver = new ResolveModelUseCase(
      new FakeConfig("default-model"),
      sessionStore,
    );
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: "default-model" }]),
      sessionStore,
    );

    const cleared = await useCase.clearContext("s-1", 1);
    expect(cleared.summary).toBeUndefined();
    expect(cleared.messages).toEqual([
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
    ]);
  });
});
