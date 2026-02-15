import { RunChatUseCase } from '../../../application/chat/run-chat.usecase';
import { ResolveModelUseCase } from '../../../application/model-endpoint/resolve-model.usecase';
import { ConfigPort } from '../../../ports/outbound/config.port';
import { LlmClientPort, ModelSummary } from '../../../ports/outbound/llm-client.port';
import { SessionStorePort } from '../../../ports/outbound/session-store.port';
import { ChatChunk, ChatMessage } from '../../../shared/types/chat';

class FakeSessionStore implements SessionStorePort {
  private modelMap = new Map<string, string>();

  async getModel(sessionId: string): Promise<string | undefined> {
    return this.modelMap.get(sessionId);
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    this.modelMap.set(sessionId, model);
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

  async *chat(_model: string, _messages: ChatMessage[]): AsyncGenerator<ChatChunk> {
    for (const chunk of this.chunks) {
      yield chunk;
    }
  }
}

describe('RunChatUseCase', () => {
  it('starts session with resolved model and persists it', async () => {
    const sessionStore = new FakeSessionStore();
    const resolver = new ResolveModelUseCase(new FakeConfig('default-model'), sessionStore);
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: 'default-model' }]),
      sessionStore,
    );

    const result = await useCase.startSession({ sessionId: 's-1' });

    expect(result).toEqual({ ok: true, model: 'default-model', source: 'default' });
    await expect(sessionStore.getModel('s-1')).resolves.toBe('default-model');
  });

  it('returns actionable error when model is missing', async () => {
    const sessionStore = new FakeSessionStore();
    const resolver = new ResolveModelUseCase(new FakeConfig('missing-model'), sessionStore);
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient([{ name: 'available-model' }]),
      sessionStore,
    );

    const result = await useCase.startSession({ sessionId: 's-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result).toEqual({
        ok: false,
        code: 'MODEL_NOT_FOUND',
        model: 'missing-model',
        candidates: ['available-model'],
      });
    }
  });

  it('streams tokens for one turn', async () => {
    const sessionStore = new FakeSessionStore();
    const resolver = new ResolveModelUseCase(new FakeConfig('default-model'), sessionStore);
    const useCase = new RunChatUseCase(
      resolver,
      new FakeLlmClient(
        [{ name: 'default-model' }],
        [
          { content: 'Hello', done: false },
          { content: ' world', done: false },
          { content: '', done: true },
        ],
      ),
      sessionStore,
    );

    const received: string[] = [];
    for await (const token of useCase.runTurn('default-model', [{ role: 'user', content: 'Hi' }])) {
      received.push(token);
    }

    expect(received).toEqual(['Hello', ' world']);
  });
});
