import { OllamaClient } from '../../ollama/OllamaClient';
import * as readline from 'readline';

export async function chatCommand(model: string, initialPrompt?: string) {
  const client = new OllamaClient();
  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

  console.log(`
--- Chat with ${model} ---
`);
  console.log('Type /exit or /quit to end the chat.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  const processChat = async (prompt: string) => {
    messages.push({ role: 'user', content: prompt });

    process.stdout.write('AI: ');
    try {
      for await (const chunk of client.chat(model, messages)) {
        if (chunk.message?.content) {
          process.stdout.write(chunk.message.content);
        }
      }
      process.stdout.write('\n');
    } catch (error) {
      console.error('Error during chat:', error);
    }
  };

  if (initialPrompt) {
    await processChat(initialPrompt);
    rl.close(); // 初期プロンプトがある場合はチャット終了
  } else {
    rl.prompt();
    rl.on('line', async (line) => {
      const input = line.trim();

      if (input === '/exit' || input === '/quit') {
        rl.close();
        return;
      }

      await processChat(input);
      rl.prompt();
    }).on('close', () => {
      console.log('Chat ended.');
      process.exit(0);
    });
  }
}