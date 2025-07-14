import { Command } from 'commander';
import { chatCommand } from './cli/commands/chat';
import { listModelsCommand, useModelCommand } from './cli/commands/model';
import { getConfig } from './config';

const program = new Command();

program
  .name('multi-llm-agent-cli')
  .description('Ollamaを通じて様々なLLMを利用できるコマンドラインツール')
  .version('1.0.0');

program.command('chat [prompt]')
  .description('LLMとチャットします。')
  .option('-m, --model <model_name>', '使用するOllamaモデルを指定します。 (デフォルト: llama2)', getConfig().defaultModel)
  .action(async (prompt: string | undefined, options: { model: string }) => {
    await chatCommand(options.model, prompt);
  });

const modelCommand = program.command('model')
  .description('Ollamaモデルに関する操作を行います。');

modelCommand.command('list')
  .description('利用可能なOllamaモデルを一覧表示します。')
  .action(async () => {
    await listModelsCommand();
  });

modelCommand.command('use <model_name>')
  .description('デフォルトで使用するOllamaモデルを設定します。')
  .action(async (modelName: string) => {
    await useModelCommand(modelName);
  });

program.parse(process.argv);