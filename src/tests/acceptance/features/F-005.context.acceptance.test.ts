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

class NoopLlmClient implements LlmClientPort {
  async listModels(): Promise<ModelSummary[]> {
    return [{ name: "model-a" }];
  }

  async *chat(
    _model: string,
    _messages: ChatMessage[],
  ): AsyncGenerator<ChatChunk> {
    yield { content: "ok", done: true };
  }
}

describe("F-005 Context Management acceptance", () => {
  it("applies keep/discard/summarize controls to the next context", async () => {
    const store = new InMemorySessionStoreAdapter();
    const useCase = new RunChatUseCase(
      new ResolveModelUseCase(new FixedConfig(), store),
      new NoopLlmClient(),
      store,
    );

    await useCase.startSession({ sessionId: "s-1" });
    await useCase.recordTurn("s-1", "u1", "a1");
    await useCase.recordTurn("s-1", "u2", "a2");
    await useCase.recordTurn("s-1", "u3", "a3");

    await useCase.setContextPolicy("s-1", {
      maxTurns: 1,
      summaryEnabled: false,
    });
    const kept = await useCase.loadContext("s-1");
    expect(kept.messages).toEqual([
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
    ]);

    await useCase.clearContext("s-1", 0);
    const cleared = await useCase.loadContext("s-1");
    expect(cleared.messages).toEqual([]);

    await useCase.recordTurn("s-1", "u4", "a4");
    await useCase.recordTurn("s-1", "u5", "a5");
    await useCase.recordTurn("s-1", "u6", "a6");
    await useCase.setContextPolicy("s-1", {
      maxTurns: 1,
      summaryEnabled: true,
    });
    await useCase.summarizeContext("s-1");

    const summarized = await useCase.loadContext("s-1");
    expect(summarized.messages[0]?.role).toBe("assistant");
    expect(summarized.messages).toEqual(
      expect.arrayContaining([
        { role: "user", content: "u6" },
        { role: "assistant", content: "a6" },
      ]),
    );
  });
});
