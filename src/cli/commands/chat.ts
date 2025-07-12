import { OllamaClient } from '../../ollama/OllamaClient';

export async function chatCommand(model: string, prompt: string) {
  const client = new OllamaClient();
  const messages = [{ role: 'user', content: prompt }];

  console.log(`
--- Chat with ${model} ---`);

  try {
    for await (const chunk of client.chat(model, messages)) {
      if (chunk.message?.content) {
        process.stdout.write(chunk.message.content);
      }
    }
    console.log('
--------------------------
');
  } catch (error) {
    console.error('Error during chat:', error);
  }
}
