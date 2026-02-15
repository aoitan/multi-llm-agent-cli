import * as readline from 'readline';
import { RunChatUseCase } from '../../../application/chat/run-chat.usecase';
import { ChatMessage } from '../../../shared/types/chat';

interface ChatCommandInput {
  prompt?: string;
  model?: string;
}

interface ChatCommandDeps {
  useCase: RunChatUseCase;
  createSessionId: () => string;
}

export async function runChatCommand(input: ChatCommandInput, deps: ChatCommandDeps): Promise<void> {
  const sessionId = deps.createSessionId();
  const start = await deps.useCase.startSession({
    sessionId,
    cliModel: input.model,
  });

  if (!start.ok) {
    console.error(start.errorMessage);
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
    await streamOneTurn(input.prompt);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (trimmed === '/exit' || trimmed === '/quit') {
      rl.close();
      return;
    }

    if (!trimmed) {
      rl.prompt();
      return;
    }

    await streamOneTurn(trimmed);
    rl.prompt();
  }).on('close', () => {
    console.log('Chat ended.');
  });
}
