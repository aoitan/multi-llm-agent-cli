import { Command } from "commander";
import { randomUUID } from "crypto";
import { RunChatUseCase } from "./application/chat/run-chat.usecase";
import { ResolveModelUseCase } from "./application/model-endpoint/resolve-model.usecase";
import { FileConfigAdapter } from "./adapters/config/file-config.adapter";
import { OllamaClientAdapter } from "./adapters/ollama/ollama-client.adapter";
import { InMemorySessionStoreAdapter } from "./adapters/session/in-memory-session-store.adapter";
import { FileSessionStoreAdapter } from "./adapters/session/file-session-store.adapter";
import { runChatCommand } from "./interaction/cli/commands/chat.command";
import { LlmClientPort } from "./ports/outbound/llm-client.port";
import { ConfigPort } from "./ports/outbound/config.port";
import { SessionStorePort } from "./ports/outbound/session-store.port";

export function createProgram(deps?: {
  useCase?: RunChatUseCase;
  llmClient?: LlmClientPort;
  config?: ConfigPort;
  sessionStore?: SessionStorePort;
}): Command {
  const config = deps?.config ?? new FileConfigAdapter();
  const llmClient = deps?.llmClient ?? new OllamaClientAdapter();
  const sessionStore =
    deps?.sessionStore ??
    (process.env.NODE_ENV === "test"
      ? new InMemorySessionStoreAdapter()
      : new FileSessionStoreAdapter());
  const resolver = new ResolveModelUseCase(config, sessionStore);
  const useCase =
    deps?.useCase ?? new RunChatUseCase(resolver, llmClient, sessionStore);

  const program = new Command();

  program
    .name("multi-llm-agent-cli")
    .description("Single-control-node oriented Multi LLM CLI")
    .version("2.0.0-mvp");

  program
    .command("chat [prompt]")
    .description("Run single-shot or interactive chat.")
    .option("-m, --model <model_name>", "Model name to use")
    .option(
      "-s, --session-id <session_id>",
      "Session id for model/context reuse (omitted: new session each run)",
    )
    .option(
      "--log-events",
      "Enable local chat event logging (masked + rotated)",
    )
    .action(
      async (
        prompt: string | undefined,
        options: { model?: string; sessionId?: string; logEvents?: boolean },
      ) => {
        try {
          await runChatCommand(
            {
              prompt,
              model: options.model,
              sessionId: options.sessionId,
              enableEventLog: Boolean(options.logEvents),
            },
            {
              useCase,
              createSessionId: () => `session-${randomUUID()}`,
            },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`チャット実行中にエラーが発生しました: ${message}`);
        }
      },
    );

  const modelCommand = program
    .command("model")
    .description("Model operations.");

  modelCommand
    .command("list")
    .description("List available models from Ollama.")
    .action(async () => {
      try {
        const models = await llmClient.listModels();
        if (models.length === 0) {
          console.log("利用可能なモデルがありません。");
          return;
        }
        console.log("利用可能なモデル:");
        models.forEach((m) => console.log(`  - ${m.name}`));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`モデル一覧の取得に失敗しました: ${message}`);
      }
    });

  modelCommand
    .command("use <model_name>")
    .description("Set default model.")
    .action(async (modelName: string) => {
      try {
        const models = await llmClient.listModels();
        if (!models.some((m) => m.name === modelName)) {
          console.error(`エラー: モデル '${modelName}' は存在しません。`);
          return;
        }
        await config.setDefaultModel(modelName);
        console.log(`デフォルトモデルを '${modelName}' に設定しました。`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`モデル設定に失敗しました: ${message}`);
      }
    });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
