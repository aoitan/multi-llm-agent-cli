import { chatCommand } from '@cli/commands/chat';
import { OllamaClient } from '@ollama/OllamaClient';
import * as readline from 'readline';

// OllamaClientをモック化
const mockOllamaClientInstance = {
  chat: jest.fn(async function* (model, messages) {
    if (messages[messages.length - 1].content === 'error') {
      throw new Error('Mock Ollama Chat Error');
    }
    yield { model, created_at: '', message: { role: 'assistant', content: 'Mock response for ' + messages[messages.length - 1].content }, done: true };
  }),
};

jest.mock('@ollama/OllamaClient', () => ({
  OllamaClient: jest.fn(() => mockOllamaClientInstance),
}));

// readlineをモック化
const mockReadlineInterface = {
  on: jest.fn().mockReturnThis(),
  prompt: jest.fn(),
  close: jest.fn(),
} as unknown as jest.Mocked<readline.Interface>;

jest.mock('readline', () => {
  return {
    createInterface: jest.fn(() => mockReadlineInterface),
  };
});

describe('chatCommand', () => {
  
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processStdoutWriteSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    mockOllamaClientInstance.chat.mockClear();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    processStdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // モックのクリア
    mockReadlineInterface.on.mockClear();
    mockReadlineInterface.prompt.mockClear();
    mockReadlineInterface.close.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should handle initial prompt and exit', async () => {
    const model = 'test-model';
    const initialPrompt = 'Hello';

    await chatCommand(model, initialPrompt);

    expect(mockOllamaClientInstance.chat).toHaveBeenCalledWith(model, [{ role: 'user', content: initialPrompt }]);
    expect(processStdoutWriteSpy.mock.calls).toEqual([
      ['AI: '],
      ['Mock response for Hello'],
      ['\n'],
    ]);
    expect(mockReadlineInterface.close).toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled(); // 初期プロンプトの場合はexitしない
  });

  it('should enter interactive mode if no initial prompt', async () => {
    const model = 'test-model';

    chatCommand(model);

    expect(mockReadlineInterface.prompt).toHaveBeenCalled();
    expect(mockReadlineInterface.on).toHaveBeenCalledWith('line', expect.any(Function));
    expect(mockReadlineInterface.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('should process user input in interactive mode', async () => {
    const model = 'test-model';
    const userInput = 'How are you?';

    chatCommand(model);

    // readline.on('line')のコールバックをシミュレート
    const lineCallback = mockReadlineInterface.on.mock.calls.find((call: [string, any]) => call[0] === 'line')?.[1] as ((input: string) => Promise<void>) | undefined;
    if (lineCallback) {
      await lineCallback(userInput);
    }

    expect(mockOllamaClientInstance.chat).toHaveBeenCalledWith(model, [{ role: 'user', content: userInput }]);
    expect(processStdoutWriteSpy.mock.calls).toEqual([
      ['AI: '],
      ['Mock response for How are you?'],
      ['\n'],
    ]);
    expect(mockReadlineInterface.prompt).toHaveBeenCalledTimes(2); // 初期プロンプトとユーザー入力後
  });

  it('should exit interactive mode on /exit', async () => {
    const model = 'test-model';

    chatCommand(model);

    const lineCallback = mockReadlineInterface.on.mock.calls.find((call: [string, any]) => call[0] === 'line')?.[1] as ((input: string) => Promise<void>) | undefined;
    if (lineCallback) {
      await lineCallback('/exit');
    }

    expect(mockReadlineInterface.close).toHaveBeenCalled();
    // process.exitはreadline.on('close')で呼ばれるため、ここでは期待しない
    expect(processExitSpy).not.toHaveBeenCalled();

    // readline.on('close')のコールバックをシミュレート
    const closeCallback = mockReadlineInterface.on.mock.calls.find((call: [string, any]) => call[0] === 'close')?.[1] as (() => void) | undefined;
    if (closeCallback) {
      closeCallback();
    }
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('should handle chat errors gracefully', async () => {
    const model = 'test-model';
    const userInput = 'error'; // モックでエラーを発生させるプロンプト

    chatCommand(model);

    const lineCallback = mockReadlineInterface.on.mock.calls.find((call: [string, any]) => call[0] === 'line')?.[1] as ((input: string) => Promise<void>) | undefined;
    if (lineCallback) {
      await lineCallback(userInput);
    }

    expect(consoleLogSpy.mock.calls).toEqual([
      [`
--- Chat with test-model ---
`],
      ['Type /exit or /quit to end the chat.'],
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error during chat:', expect.any(Error));
    expect(processStdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('AI:'));
    expect(mockReadlineInterface.prompt).toHaveBeenCalled();
  });
});