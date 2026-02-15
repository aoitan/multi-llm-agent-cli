import { runChatCommand } from '../../../interaction/cli/commands/chat.command';
import { RunChatUseCase } from '../../../application/chat/run-chat.usecase';

function createMockUseCase(startModel = 'test-model') {
  return {
    startSession: jest.fn().mockResolvedValue({
      ok: true,
      model: startModel,
      source: 'cli',
    }),
    runTurn: jest.fn(async function* () {
      yield 'hello';
      yield ' world';
    }),
  } as unknown as RunChatUseCase;
}

describe('F-001 CLI Chat acceptance', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs single-shot chat and prints streamed response', async () => {
    const useCase = createMockUseCase('model-a');

    await runChatCommand(
      { prompt: 'hello?', model: 'model-a' },
      { useCase, createSessionId: () => 'session-1' },
    );

    expect((useCase as any).startSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      cliModel: 'model-a',
    });

    expect(writeSpy.mock.calls).toEqual([
      ['AI: '],
      ['hello'],
      [' world'],
      ['\n'],
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('prints actionable error when selected model is missing', async () => {
    const useCase = {
      startSession: jest.fn().mockResolvedValue({
        ok: false,
        code: 'MODEL_NOT_FOUND',
        model: 'missing',
        candidates: ['model-a'],
      }),
      runTurn: jest.fn(),
    } as unknown as RunChatUseCase;

    await runChatCommand(
      { prompt: 'hello?', model: 'missing' },
      { useCase, createSessionId: () => 'session-1' },
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("モデル 'missing' は存在しません"));
    expect((useCase as any).runTurn).not.toHaveBeenCalled();
  });
});
