import axios from 'axios';
import { LlmClientPort, ModelSummary } from '../../ports/outbound/llm-client.port';
import { ChatChunk, ChatMessage } from '../../shared/types/chat';

interface OllamaChatChunk {
  message?: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
}

export class OllamaClientAdapter implements LlmClientPort {
  constructor(private readonly baseUrl: string = process.env.OLLAMA_BASE_URL || 'http://localhost:11434') {}

  async listModels(): Promise<ModelSummary[]> {
    const response = await axios.get<{ models: Array<{ name: string }> }>(`${this.baseUrl}/api/tags`);
    return (response.data.models || []).map((m) => ({ name: m.name }));
  }

  async *chat(model: string, messages: ChatMessage[]): AsyncGenerator<ChatChunk> {
    const response = await axios.post(`${this.baseUrl}/api/chat`, {
      model,
      messages,
      stream: true,
    }, {
      responseType: 'stream',
      headers: { 'Content-Type': 'application/json' },
    });

    const readableStream = response.data as NodeJS.ReadableStream;
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    for await (const chunk of readableStream) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const parsed = JSON.parse(line) as OllamaChatChunk;
        yield {
          content: parsed.message?.content ?? '',
          done: parsed.done,
        };
      }
    }

    if (buffer.trim()) {
      const parsed = JSON.parse(buffer) as OllamaChatChunk;
      yield {
        content: parsed.message?.content ?? '',
        done: parsed.done,
      };
    }
  }
}
