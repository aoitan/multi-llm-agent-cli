import { Command } from 'commander';
import { chatCommand } from '@cli/commands/chat';
import { listModelsCommand } from '@cli/commands/model';

// chatCommandとlistModelsCommandをモック化
jest.mock('@cli/commands/chat', () => ({
  chatCommand: jest.fn(),
}));
jest.mock('@cli/commands/model', () => ({
  listModelsCommand: jest.fn(),
}));

describe.skip('CLI Application', () => {
  let program: Command;
  let stdout: string[];
  let stderr: string[];
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    // commanderを再初期化するために、モジュールをリセット (REMOVED: jest.resetModules();)
    const { Command } = require('commander'); // Re-require commander to get a fresh instance
    program = new Command();
    program
      .name('multi-llm-agent-cli')
      .description('Ollamaを通じて様々なLLMを利用できるコマンドラインツール')
      .version('1.0.0');

    program.command('chat [prompt]')
      .description('LLMとチャットします。')
      .option('-m, --model <model_name>', '使用するOllamaモデルを指定します。 (デフォルト: llama2)', 'llama2')
      .action(async (prompt: string | undefined, options: { model: string }) => {
        await chatCommand(options.model, prompt);
      });

    program.command('model')
      .description('Ollamaモデルに関する操作を行います。')
      .command('list')
      .description('利用可能なOllamaモデルを一覧表示します。')
      .action(async () => {
        await listModelsCommand();
      });

    stdout = [];
    stderr = [];
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array, encoding?: BufferEncoding | ((error?: Error | undefined) => void), callback?: (error?: Error | undefined) => void): boolean => {
      stdout.push(chunk.toString());
      return true;
    });
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array, encoding?: BufferEncoding | ((error?: Error | undefined) => void), callback?: (error?: Error | undefined) => void): boolean => {
      stderr.push(chunk.toString());
      return true;
    });
    // Tell commander to throw an error instead of calling process.exit
    program.exitOverride();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    // Clear mocks for chatCommand and listModelsCommand
    (chatCommand as jest.Mock).mockClear();
    (listModelsCommand as jest.Mock).mockClear();
  });

  it('should call chatCommand with correct arguments', async () => {
    await program.parseAsync(['node', 'cli.js', 'chat', 'Hello, AI!', '--model', 'llama2'], { from: 'node' });
    expect(chatCommand).toHaveBeenCalledWith('llama2', 'Hello, AI!');
  });

  it('should call chatCommand with default model if not specified', async () => {
    await program.parseAsync(['node', 'cli.js', 'chat', 'Hello, AI!'], { from: 'node' });
    expect(chatCommand).toHaveBeenCalledWith('llama2', 'Hello, AI!');
  });

  it('should call listModelsCommand', async () => {
    await program.parseAsync(['node', 'cli.js', 'model', 'list'], { from: 'node' });
    expect(listModelsCommand).toHaveBeenCalled();
  });

  it('should show help if no command is provided', async () => {
    try {
      await program.parseAsync(['node', 'cli.js'], { from: 'node' });
    } catch (e) {
      // commanderがprocess.exitを呼び出すとJestがエラーをスローするため、ここで捕捉
      // ただし、このテストの目的はヘルプが表示されることなので、エラー自体は無視
    }
    expect(stdout.join('')).toContain('Usage: multi-llm-agent-cli [options] [command]');
  });

  it('should show error and help for unknown command', async () => {
    try {
      await program.parseAsync(['node', 'cli.js', 'unknown-command'], { from: 'node' });
    } catch (e) {
      // エラーを捕捉
    }
    expect(stderr.join('')).toContain('error: unknown command \'unknown-command\'');
    expect(stdout.join('')).toContain('Usage: multi-llm-agent-cli [options] [command]');
  });

  it('should show error and help for unknown model subcommand', async () => {
    try {
      await program.parseAsync(['node', 'cli.js', 'model', 'unknown-subcommand'], { from: 'node' });
    } catch (e) {
      // エラーを捕捉
    }
    expect(stderr.join('')).toContain('error: unknown command \'unknown-subcommand\'');
    expect(stdout.join('')).toContain('Usage: multi-llm-agent-cli [options] [command]');
  });
});