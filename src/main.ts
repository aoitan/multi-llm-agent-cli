import { Command } from 'commander';
import { RunChatUseCase } from './application/chat/run-chat.usecase';
import { ResolveModelUseCase } from './application/model-endpoint/resolve-model.usecase';
import { FileConfigAdapter } from './adapters/config/file-config.adapter';
import { OllamaClientAdapter } from './adapters/ollama/ollama-client.adapter';
import { InMemorySessionStoreAdapter } from './adapters/session/in-memory-session-store.adapter';
import { runChatCommand } from './interaction/cli/commands/chat.command';
import { ErrorPresenter } from './interaction/presenter/error-presenter';

export function createProgram(deps?: {
  useCase?: RunChatUseCase;
  llmClient?: OllamaClientAdapter;
  config?: FileConfigAdapter;
}): Command {
  const config = deps?.config ?? new FileConfigAdapter();
  const llmClient = deps?.llmClient ?? new OllamaClientAdapter();
  const sessionStore = new InMemorySessionStoreAdapter();
  const resolver = new ResolveModelUseCase(config, sessionStore);
  const useCase = deps?.useCase ?? new RunChatUseCase(resolver, llmClient, sessionStore, new ErrorPresenter());

  const program = new Command();

  program
    .name('multi-llm-agent-cli')
    .description('Single-control-node oriented Multi LLM CLI')
    .version('2.0.0-mvp');

  program.command('chat [prompt]')
    .description('Run single-shot or interactive chat.')
    .option('-m, --model <model_name>', 'Model name to use')
    .action(async (prompt: string | undefined, options: { model?: string }) => {
      await runChatCommand({ prompt, model: options.model }, {
        useCase,
        createSessionId: () => `session-${Date.now()}`,
      });
    });

  program.command('model list')
    .description('List available models from Ollama.')
    .action(async () => {
      const models = await llmClient.listModels();
      if (models.length === 0) {
        console.log('利用可能なモデルがありません。');
        return;
      }
      console.log('利用可能なモデル:');
      models.forEach((m) => console.log(`  - ${m.name}`));
    });

  program.command('model use <model_name>')
    .description('Set default model.')
    .action(async (modelName: string) => {
      const models = await llmClient.listModels();
      if (!models.some((m) => m.name === modelName)) {
        console.error(`エラー: モデル '${modelName}' は存在しません。`);
        return;
      }
      await config.setDefaultModel(modelName);
      console.log(`デフォルトモデルを '${modelName}' に設定しました。`);
    });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
