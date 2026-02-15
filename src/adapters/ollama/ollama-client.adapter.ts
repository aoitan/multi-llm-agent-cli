import axios, { AxiosError } from 'axios';
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
    try {
      const response = await axios.get<{ models: Array<{ name: string }> }>(`${this.baseUrl}/api/tags`);
      return (response.data.models || []).map((m) => ({ name: m.name }));
    } catch (error) {
      throw new Error(`Ollamaモデル一覧の取得に失敗しました: ${this.getErrorMessage(error)}`);
    }
  }

  async *chat(model: string, messages: ChatMessage[]): AsyncGenerator<ChatChunk> {
    try {
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

          const parsed = this.parseChunk(line);
          yield {
            content: parsed.message?.content ?? '',
            done: parsed.done,
          };
        }
      }

      if (buffer.trim()) {
        const parsed = this.parseChunk(buffer);
        yield {
          content: parsed.message?.content ?? '',
          done: parsed.done,
        };
      }
    } catch (error) {
      throw new Error(`Ollamaチャットの実行に失敗しました: ${this.getErrorMessage(error)}`);
    }
  }

  private parseChunk(line: string): OllamaChatChunk {
    try {
      return JSON.parse(line) as OllamaChatChunk;
    } catch {
      throw new Error(`OllamaレスポンスのJSON解析に失敗しました: ${line}`);
    }
  }

  private getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const status = axiosError.response?.status;
      const statusText = axiosError.response?.statusText;
      const detail = axiosError.response?.data?.message;
      return [status ? `${status}` : undefined, statusText, detail, axiosError.message]
        .filter(Boolean)
        .join(' / ');
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
