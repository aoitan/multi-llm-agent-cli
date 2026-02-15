import { ResolveModelUseCase } from '../../../application/model-endpoint/resolve-model.usecase';
import { ConfigPort } from '../../../ports/outbound/config.port';
import { SessionStorePort } from '../../../ports/outbound/session-store.port';

class FixedConfig implements ConfigPort {
  constructor(private readonly model: string) {}

  async getDefaultModel(): Promise<string> {
    return this.model;
  }

  async setDefaultModel(_model: string): Promise<void> {}
}

class InMemorySessionStore implements SessionStorePort {
  private map = new Map<string, string>();

  async getModel(sessionId: string): Promise<string | undefined> {
    return this.map.get(sessionId);
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    this.map.set(sessionId, model);
  }
}

describe('F-003 Model Selection acceptance', () => {
  it('uses CLI model first', async () => {
    const store = new InMemorySessionStore();
    await store.setModel('s1', 'session-model');
    const useCase = new ResolveModelUseCase(new FixedConfig('default-model'), store);

    const result = await useCase.execute({
      sessionId: 's1',
      cliModel: 'cli-model',
    });

    expect(result).toEqual({ model: 'cli-model', source: 'cli' });
  });

  it('uses session model when CLI model is absent', async () => {
    const store = new InMemorySessionStore();
    await store.setModel('s1', 'session-model');
    const useCase = new ResolveModelUseCase(new FixedConfig('default-model'), store);

    const result = await useCase.execute({ sessionId: 's1' });

    expect(result).toEqual({ model: 'session-model', source: 'session' });
  });

  it('uses default model when neither CLI nor session model is set', async () => {
    const store = new InMemorySessionStore();
    const useCase = new ResolveModelUseCase(new FixedConfig('default-model'), store);

    const result = await useCase.execute({ sessionId: 's1' });

    expect(result).toEqual({ model: 'default-model', source: 'default' });
  });
});
