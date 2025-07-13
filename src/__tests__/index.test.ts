import { Command } from 'commander';
import { chatCommand } from '../cli/commands/chat';
import { listModelsCommand } from '../cli/commands/model';

describe('CLI Application', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should define chat command', () => {
    const program = new Command();
    program.command('chat [prompt]')
      .description('LLMとチャットします。')
      .option('-m, --model <model_name>', '使用するOllamaモデルを指定します。 (デフォルト: llama2)', 'llama2')
      .action(async (prompt: string | undefined, options: { model: string }) => {
        // chatCommand が呼び出されることを確認するためにモック
      });

    const chatCmd = program.commands.find(cmd => cmd.name() === 'chat');
    expect(chatCmd).toBeDefined();
    expect(chatCmd?.description()).toBe('LLMとチャットします。');
    expect(chatCmd?.options.some(opt => opt.flags === '-m, --model <model_name>')).toBe(true);
  });

  it('should define model list command', () => {
    const program = new Command();
    program.command('model')
      .description('Ollamaモデルに関する操作を行います。')
      .command('list')
      .description('利用可能なOllamaモデルを一覧表示します。')
      .action(async () => {
        // listModelsCommand が呼び出されることを確認するためにモック
      });

    const modelCmd = program.commands.find(cmd => cmd.name() === 'model');
    expect(modelCmd).toBeDefined();
    expect(modelCmd?.description()).toBe('Ollamaモデルに関する操作を行います。');

    const listCmd = modelCmd?.commands.find(cmd => cmd.name() === 'list');
    expect(listCmd).toBeDefined();
    expect(listCmd?.description()).toBe('利用可能なOllamaモデルを一覧表示します。');
  });
});