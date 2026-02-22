import { Command } from "commander";
import { randomUUID } from "crypto";
import * as os from "os";
import * as path from "path";
import { RunChatUseCase } from "./application/chat/run-chat.usecase";
import { ResolveModelUseCase } from "./application/model-endpoint/resolve-model.usecase";
import { FileConfigAdapter } from "./adapters/config/file-config.adapter";
import { OllamaClientAdapter } from "./adapters/ollama/ollama-client.adapter";
import { InMemorySessionStoreAdapter } from "./adapters/session/in-memory-session-store.adapter";
import { FileSessionStoreAdapter } from "./adapters/session/file-session-store.adapter";
import { runChatCommand } from "./interaction/cli/commands/chat.command";
import {
  ChatEventLogEntry,
  writeChatEventLog,
} from "./operations/logging/chat-event-logger";
import { LlmClientPort } from "./ports/outbound/llm-client.port";
import { ConfigPort } from "./ports/outbound/config.port";
import { SessionStorePort } from "./ports/outbound/session-store.port";

function parseNonNegativeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`非負の整数を指定してください: ${value}`);
  }
  return Math.floor(parsed);
}

const SESSION_STORAGE_PATH = path.join(
  process.env.MULTI_LLM_AGENT_CONFIG_DIR?.trim() ||
    path.join(os.homedir(), ".multi-llm-agent-cli"),
  "session.json",
);

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
  const logSessionEvent = async (
    enabled: boolean,
    entry: Omit<ChatEventLogEntry, "timestamp">,
  ): Promise<void> => {
    if (!enabled) {
      return;
    }
    try {
      await writeChatEventLog({
        ...entry,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Logging must never break command execution.
    }
  };

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

  const sessionCommand = program
    .command("session")
    .description("Session and context operations.");

  sessionCommand
    .command("start [session_id]")
    .description("Start a session.")
    .option("-m, --model <model_name>", "Model name for this session")
    .option(
      "--max-turns <n>",
      "Max turns to keep in prompt context",
      parseNonNegativeInteger,
    )
    .option("--summary", "Enable automatic context summarization")
    .option(
      "--log-events",
      "Enable local session/context event logging (masked + rotated)",
    )
    .action(
      async (
        sessionId: string | undefined,
        options: {
          model?: string;
          maxTurns?: number;
          summary?: boolean;
          logEvents?: boolean;
        },
      ) => {
        const targetSessionId = sessionId ?? `session-${randomUUID()}`;
        try {
          const started = await useCase.startSession({
            sessionId: targetSessionId,
            cliModel: options.model,
          });
          if (!started.ok) {
            console.error(
              `エラー: モデル '${started.model}' は存在しません。候補: ${started.candidates.join(
                ", ",
              )}`,
            );
            process.exitCode = 1;
            return;
          }

          const policyUpdated = await useCase.setContextPolicy(
            targetSessionId,
            {
              maxTurns: options.maxTurns,
              summaryEnabled:
                options.summary === undefined ? undefined : options.summary,
            },
          );
          console.log(`セッションを開始しました: ${targetSessionId}`);
          console.log(
            `model=${started.model}, keep_turns=${policyUpdated.policy.maxTurns}, summary=${
              policyUpdated.policy.summaryEnabled ? "on" : "off"
            }`,
          );
          await logSessionEvent(Boolean(options.logEvents), {
            session_id: targetSessionId,
            event_type: "session_start",
            model: started.model,
            resolution_source: started.source,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`セッション開始に失敗しました: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  sessionCommand
    .command("save <session_id>")
    .description("Persist session snapshot metadata.")
    .option(
      "--log-events",
      "Enable local session/context event logging (masked + rotated)",
    )
    .action(async (sessionId: string, options: { logEvents?: boolean }) => {
      try {
        const saved = await useCase.saveSession(sessionId);
        console.log(
          `セッションを保存しました: ${sessionId} (saved_at=${saved.savedAt}, path=${SESSION_STORAGE_PATH})`,
        );
        await logSessionEvent(Boolean(options.logEvents), {
          session_id: sessionId,
          event_type: "session_save",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`セッション保存に失敗しました: ${message}`);
        process.exitCode = 1;
      }
    });

  sessionCommand
    .command("load <session_id>")
    .description("Load a session snapshot for subsequent chat reuse.")
    .option(
      "--log-events",
      "Enable local session/context event logging (masked + rotated)",
    )
    .action(async (sessionId: string, options: { logEvents?: boolean }) => {
      try {
        const loaded = await useCase.loadSession(sessionId);
        const session = loaded.session;
        console.log(
          `セッションを読み込みました: ${sessionId} (path=${SESSION_STORAGE_PATH})`,
        );
        console.log(`model=${session.model ?? "(unset)"}`);
        console.log(`restored_messages=${loaded.restoredMessageCount}`);
        console.log(
          `restored_summary=${loaded.restoredSummary ? "yes" : "no"}`,
        );
        console.log(
          `context: keep_turns=${session.policy.maxTurns}, summary=${
            session.policy.summaryEnabled ? "on" : "off"
          }`,
        );
        console.log(`loaded_at=${session.loadedAt ?? "(unset)"}`);
        await logSessionEvent(Boolean(options.logEvents), {
          session_id: sessionId,
          event_type: "session_load",
          model: session.model,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`セッション読込に失敗しました: ${message}`);
        process.exitCode = 1;
      }
    });

  sessionCommand
    .command("end <session_id>")
    .description("End a session and remove stored data.")
    .option(
      "--log-events",
      "Enable local session/context event logging (masked + rotated)",
    )
    .action(async (sessionId: string, options: { logEvents?: boolean }) => {
      try {
        await useCase.endSession(sessionId);
        console.log(`セッションを終了しました: ${sessionId}`);
        await logSessionEvent(Boolean(options.logEvents), {
          session_id: sessionId,
          event_type: "session_end",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`セッション終了に失敗しました: ${message}`);
        process.exitCode = 1;
      }
    });

  const contextCommand = sessionCommand
    .command("context")
    .description("Context controls for a session.");

  contextCommand
    .command("show <session_id>")
    .description("Show context policy and current usage.")
    .option(
      "--log-events",
      "Enable local session/context event logging (masked + rotated)",
    )
    .action(async (sessionId: string, options: { logEvents?: boolean }) => {
      try {
        const session = await useCase.getSession(sessionId);
        if (!session) {
          console.error(`セッション '${sessionId}' は存在しません。`);
          process.exitCode = 1;
          return;
        }
        console.log(`session=${sessionId}`);
        console.log(
          `policy: keep_turns=${session.policy.maxTurns}, summary=${
            session.policy.summaryEnabled ? "on" : "off"
          }`,
        );
        console.log(`history_messages=${session.messages.length}`);
        console.log(`summary=${session.summary ? "present" : "none"}`);
        await logSessionEvent(Boolean(options.logEvents), {
          session_id: sessionId,
          event_type: "context_show",
          model: session.model,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`コンテキスト表示に失敗しました: ${message}`);
        process.exitCode = 1;
      }
    });

  contextCommand
    .command("set <session_id>")
    .description("Set context policy.")
    .option(
      "--max-turns <n>",
      "Max turns to keep in prompt context",
      parseNonNegativeInteger,
    )
    .option("--summary <on|off>", "Enable or disable automatic summarization")
    .option(
      "--log-events",
      "Enable local session/context event logging (masked + rotated)",
    )
    .action(
      async (
        sessionId: string,
        options: { maxTurns?: number; summary?: string; logEvents?: boolean },
      ) => {
        try {
          const summaryValue =
            options.summary === undefined
              ? undefined
              : options.summary.toLowerCase() === "on";
          if (
            options.summary !== undefined &&
            !["on", "off"].includes(options.summary.toLowerCase())
          ) {
            console.error(
              "`--summary` には `on` か `off` を指定してください。",
            );
            process.exitCode = 1;
            return;
          }
          const session = await useCase.setContextPolicy(sessionId, {
            maxTurns: options.maxTurns,
            summaryEnabled: summaryValue,
          });
          console.log(
            `context更新: keep_turns=${session.policy.maxTurns}, summary=${
              session.policy.summaryEnabled ? "on" : "off"
            }`,
          );
          await logSessionEvent(Boolean(options.logEvents), {
            session_id: sessionId,
            event_type: "context_set",
            model: session.model,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`コンテキスト更新に失敗しました: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  contextCommand
    .command("clear <session_id>")
    .description("Discard old context history.")
    .option(
      "--keep-turns <n>",
      "Keep the latest N turns",
      parseNonNegativeInteger,
      0,
    )
    .option(
      "--log-events",
      "Enable local session/context event logging (masked + rotated)",
    )
    .action(
      async (
        sessionId: string,
        options: { keepTurns: number; logEvents?: boolean },
      ) => {
        try {
          const session = await useCase.clearContext(
            sessionId,
            options.keepTurns,
          );
          console.log(
            `context破棄完了: kept_turns=${options.keepTurns}, messages=${session.messages.length}`,
          );
          await logSessionEvent(Boolean(options.logEvents), {
            session_id: sessionId,
            event_type: "context_clear",
            model: session.model,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`コンテキスト破棄に失敗しました: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  contextCommand
    .command("summarize <session_id>")
    .description("Summarize and compact old context history.")
    .option(
      "--log-events",
      "Enable local session/context event logging (masked + rotated)",
    )
    .action(async (sessionId: string, options: { logEvents?: boolean }) => {
      try {
        const session = await useCase.summarizeContext(sessionId);
        console.log(
          `context要約完了: messages=${session.messages.length}, summary=${
            session.summary ? "present" : "none"
          }`,
        );
        await logSessionEvent(Boolean(options.logEvents), {
          session_id: sessionId,
          event_type: "context_summarize",
          model: session.model,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`コンテキスト要約に失敗しました: ${message}`);
        process.exitCode = 1;
      }
    });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
