import * as readline from 'readline';
import { RunChatUseCase } from '../../../application/chat/run-chat.usecase';
import { ChatMessage } from '../../../shared/types/chat';
import { ErrorPresenter } from '../../presenter/error-presenter';

interface ChatCommandInput {
  prompt?: string;
  model?: string;
  sessionId?: string;
}

interface ChatCommandDeps {
  useCase: RunChatUseCase;
  createSessionId: () => string;
}

export async function runChatCommand(input: ChatCommandInput, deps: ChatCommandDeps): Promise<void> {
  const errorPresenter = new ErrorPresenter();
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

  console.log(`\n--- Chat with ${start.model} (${start.source}) ---\n`);
  console.log('Type /exit or /quit to end the chat.');

  const streamOneTurn = async (prompt: string): Promise<void> => {
    messages.push({ role: 'user', content: prompt });
    process.stdout.write('AI: ');

    let response = '';
    for await (const token of deps.useCase.runTurn(start.model, messages)) {
      response += token;
      process.stdout.write(token);
    }

    process.stdout.write('\n');
    messages.push({ role: 'assistant', content: response });
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
    prompt: '> ',
  });

  rl.prompt();
  let lineQueue = Promise.resolve();

  const handleLine = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (trimmed === '/exit' || trimmed === '/quit') {
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

  rl.on('line', (line) => {
    lineQueue = lineQueue
      .then(() => handleLine(line))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`エラーが発生しました: ${message}`);
        rl.prompt();
      });
  }).on('close', () => {
    console.log('Chat ended.');
  });
}
