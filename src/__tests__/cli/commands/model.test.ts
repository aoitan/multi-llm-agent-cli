import { listModelsCommand } from '@cli/commands/model';
import { OllamaClient } from '@ollama/OllamaClient';

// OllamaClientをモック化
const mockOllamaClientInstance = {
  getModels: jest.fn(),
  chat: jest.fn(),
};

jest.mock('@ollama/OllamaClient', () => ({
  OllamaClient: jest.fn(() => mockOllamaClientInstance),
}));

describe('listModelsCommand', () => {
  
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockOllamaClientInstance.getModels.mockClear();
    mockOllamaClientInstance.chat.mockClear();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should display a list of models', async () => {
    const mockModels = [
      { name: 'llama2', size: 1000000000, modified_at: '', digest: '', details: {} as any },
      { name: 'codellama', size: 2000000000, modified_at: '', digest: '', details: {} as any },
    ];
    mockOllamaClientInstance.getModels.mockResolvedValue(mockModels);

    await listModelsCommand();

    const consoleOutput = consoleLogSpy.mock.calls.flat();
    expect(consoleOutput).toContain('利用可能なOllamaモデル:');
    expect(consoleOutput).toContain('  - llama2 (サイズ: 0.93 GB)');
    expect(consoleOutput).toContain('  - codellama (サイズ: 1.86 GB)');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should display a message if no models are available', async () => {
    mockOllamaClientInstance.getModels.mockResolvedValue([]);

    await listModelsCommand();

    const consoleOutput = consoleLogSpy.mock.calls.flat();
    expect(consoleOutput).toContain('利用可能なOllamaモデル:');
    expect(consoleOutput).toContain('  利用可能なモデルがありません。Ollamaが実行されているか、モデルがダウンロードされているか確認してください。');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle errors when fetching models', async () => {
    const errorMessage = 'Network error';
    mockOllamaClientInstance.getModels.mockRejectedValue(new Error(errorMessage));

    await listModelsCommand();

    expect(consoleLogSpy).toHaveBeenCalledWith('利用可能なOllamaモデル:');
    expect(consoleErrorSpy).toHaveBeenCalledWith('モデル一覧の取得中にエラーが発生しました:', expect.any(Error));
  });
});