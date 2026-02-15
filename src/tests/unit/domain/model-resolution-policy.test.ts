import { resolveModelByPriority } from '../../../domain/model-endpoint/services/model-resolution-policy';

describe('resolveModelByPriority', () => {
  it('prefers CLI model over session and default', () => {
    const result = resolveModelByPriority({
      cliModel: 'cli-model',
      sessionModel: 'session-model',
      defaultModel: 'default-model',
    });

    expect(result).toEqual({ model: 'cli-model', source: 'cli' });
  });

  it('uses session model when CLI model is missing', () => {
    const result = resolveModelByPriority({
      sessionModel: 'session-model',
      defaultModel: 'default-model',
    });

    expect(result).toEqual({ model: 'session-model', source: 'session' });
  });

  it('falls back to default model when CLI and session are missing', () => {
    const result = resolveModelByPriority({
      defaultModel: 'default-model',
    });

    expect(result).toEqual({ model: 'default-model', source: 'default' });
  });

  it('throws when default model is empty', () => {
    expect(() => resolveModelByPriority({
      defaultModel: '   ',
    })).toThrow('defaultModel is empty');
  });
});
