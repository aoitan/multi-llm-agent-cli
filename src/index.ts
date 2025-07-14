import { Command } from 'commander';
import { chatCommand } from './cli/commands/chat';
import { listModelsCommand, useModelCommand } from './cli/commands/model';
import { addEndpointCommand, removeEndpointCommand, useEndpointCommand, listEndpointsCommand } from './cli/commands/endpoint';
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

const endpointCommand = program.command('endpoint')
  .description('Ollamaエンドポイントに関する操作を行います。');

endpointCommand.command('add <name> <url>')
  .description('新しいOllamaエンドポイントを登録します。')
  .action(async (name: string, url: string) => {
    await addEndpointCommand(name, url);
  });

endpointCommand.command('remove <name>')
  .description('登録済みのOllamaエンドポイントを削除します。')
  .action(async (name: string) => {
    await removeEndpointCommand(name);
  });

endpointCommand.command('use <name>')
  .description('デフォルトで使用するOllamaエンドポイントを切り替えます。')
  .action(async (name: string) => {
    await useEndpointCommand(name);
  });

endpointCommand.command('list')
  .description('登録済みのOllamaエンドポイントを一覧表示します。')
  .action(async () => {
    await listEndpointsCommand();
  });

program.parse(process.argv);