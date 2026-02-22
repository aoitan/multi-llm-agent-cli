import { runChatCommand } from "../../../interaction/cli/commands/chat.command";
import { RunChatUseCase } from "../../../application/chat/run-chat.usecase";
import { ResolveModelUseCase } from "../../../application/model-endpoint/resolve-model.usecase";
import { InMemorySessionStoreAdapter } from "../../../adapters/session/in-memory-session-store.adapter";
import { ConfigPort } from "../../../ports/outbound/config.port";
import {
  LlmClientPort,
  ModelSummary,
} from "../../../ports/outbound/llm-client.port";
import { ChatChunk, ChatMessage } from "../../../shared/types/chat";

class FixedConfig implements ConfigPort {
  async getDefaultModel(): Promise<string> {
    return "model-a";
  }

  async setDefaultModel(_model: string): Promise<void> {}
}

class SpyLlmClient implements LlmClientPort {
  public readonly calls: ChatMessage[][] = [];

  async listModels(): Promise<ModelSummary[]> {
    return [{ name: "model-a" }];
  }

  async *chat(
    _model: string,
    messages: ChatMessage[],
  ): AsyncGenerator<ChatChunk> {
    this.calls.push(messages);
    yield { content: "ok", done: false };
    yield { content: "", done: true };
  }
}

describe("F-004 Session Management acceptance", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reuses context after save/load through the same session id", async () => {
    const store = new InMemorySessionStoreAdapter();
    const llm = new SpyLlmClient();
    const resolver = new ResolveModelUseCase(new FixedConfig(), store);
    const useCase = new RunChatUseCase(resolver, llm, store);

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runChatCommand(
      { prompt: "first", sessionId: "s-1" },
      { useCase, createSessionId: () => "unused" },
    );

    await useCase.saveSession("s-1");
    const loaded = await useCase.loadSession("s-1");
    expect(loaded.restoredMessageCount).toBe(2);
    expect(loaded.restoredSummary).toBe(false);

    const useCaseAfterLoad = new RunChatUseCase(resolver, llm, store);
    await runChatCommand(
      { prompt: "second", sessionId: "s-1" },
      { useCase: useCaseAfterLoad, createSessionId: () => "unused" },
    );

    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]).toEqual(
      expect.arrayContaining([
        { role: "user", content: "first" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "second" },
      ]),
    );
  });
});
