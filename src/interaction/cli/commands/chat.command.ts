import * as readline from "readline";
import { RunChatUseCase } from "../../../application/chat/run-chat.usecase";
import { ChatMessage } from "../../../shared/types/chat";
import { ErrorPresenter } from "../../presenter/error-presenter";
import {
  ChatEventLogger,
  writeChatEventLog,
} from "../../../operations/logging/chat-event-logger";

interface ChatCommandInput {
  prompt?: string;
  model?: string;
  sessionId?: string;
  enableEventLog?: boolean;
}

interface ChatCommandDeps {
  useCase: RunChatUseCase;
  createSessionId: () => string;
  logEvent?: ChatEventLogger;
}

export async function runChatCommand(
  input: ChatCommandInput,
  deps: ChatCommandDeps,
): Promise<void> {
  const errorPresenter = new ErrorPresenter();
  const logEvent: ChatEventLogger = input.enableEventLog
    ? (deps.logEvent ?? writeChatEventLog)
    : async () => {};
  const sessionId = input.sessionId ?? deps.createSessionId();
  const start = await deps.useCase.startSession({
    sessionId,
    cliModel: input.model,
  });

  if (!start.ok) {
    console.error(errorPresenter.modelNotFound(start.model, start.candidates));
    return;
  }

  const messages: ChatMessage[] = [];
  const safeLog = async (
    ...args: Parameters<ChatEventLogger>
  ): Promise<void> => {
    try {
      await logEvent(...args);
    } catch {
      // Logging must never break chat UX.
    }
  };

  await safeLog({
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    event_type: "session_start",
    model: start.model,
    resolution_source: start.source,
  });

  console.log(`\n--- Chat with ${start.model} (${start.source}) ---\n`);
  console.log("Type /exit or /quit to end the chat.");

  const streamOneTurn = async (prompt: string): Promise<void> => {
    const startedAt = Date.now();
    messages.push({ role: "user", content: prompt });
    console.log("Generating...");
    process.stdout.write("AI: ");

    let response = "";
    try {
      for await (const token of deps.useCase.runTurn(start.model, messages)) {
        response += token;
        process.stdout.write(token);
      }

      process.stdout.write("\n");
      console.log("Done.");
      messages.push({ role: "assistant", content: response });

      await safeLog({
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        event_type: "turn_completed",
        model: start.model,
        resolution_source: start.source,
        user_input: prompt,
        assistant_response: response,
        duration_ms: Date.now() - startedAt,
      });
    } catch (error) {
      await safeLog({
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        event_type: "turn_failed",
        model: start.model,
        resolution_source: start.source,
        user_input: prompt,
        assistant_response: response,
        duration_ms: Date.now() - startedAt,
        error_message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  if (input.prompt) {
    try {
      await streamOneTurn(input.prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`エラーが発生しました: ${message}`);
    }
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  rl.prompt();
  let lineQueue = Promise.resolve();

  const handleLine = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (trimmed === "/exit" || trimmed === "/quit") {
      rl.close();
      return;
    }

    if (!trimmed) {
      rl.prompt();
      return;
    }

    try {
      await streamOneTurn(trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`エラーが発生しました: ${message}`);
    } finally {
      rl.prompt();
    }
  };

  rl.on("line", (line) => {
    lineQueue = lineQueue
      .then(() => handleLine(line))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`エラーが発生しました: ${message}`);
        rl.prompt();
      });
  }).on("close", () => {
    console.log("Chat ended.");
  });
}
