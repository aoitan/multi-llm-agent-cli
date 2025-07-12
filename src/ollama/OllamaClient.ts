import fetch, { Response } from 'node-fetch';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
}

export interface ChatResponseChunk {
  model: string;
  created_at: string;
  message?: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface Model {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  public async *chat(model: string, messages: Message[], stream: boolean = true): AsyncGenerator<ChatResponseChunk> {
    const url = `${this.baseUrl}/api/chat`;
    const body: ChatRequest = { model, messages, stream };

    try {
      const response: Response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      if (stream && response.body) {
        // response.bodyをReadableStreamとして型アサーション
        const reader = (response.body as unknown as ReadableStream).getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim() === '') continue;
            try {
              const chunk: ChatResponseChunk = JSON.parse(line);
              yield chunk;
            } catch (e) {
              console.error('Failed to parse JSON chunk:', line, e);
            }
          }
        }
        if (buffer.trim() !== '') {
          try {
            const chunk: ChatResponseChunk = JSON.parse(buffer);
            yield chunk;
          } catch (e) {
            console.error('Failed to parse final JSON chunk:', buffer, e);
          }
        }
      } else {
        const jsonResponse: ChatResponseChunk = (await response.json()) as ChatResponseChunk; // 型キャスト
        yield jsonResponse;
      }
    } catch (error) {
      console.error('Error during chat API call:', error);
      throw error;
    }
  }

  public async getModels(): Promise<Model[]> {
    const url = `${this.baseUrl}/api/tags`;
    try {
      const response: Response = await fetch(url); // Response型を明示
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }
      const data: { models: Model[] } = (await response.json()) as { models: Model[] }; // 型キャスト
      return data.models;
    } catch (error) {
      console.error('Error during getModels API call:', error);
      throw error;
    }
  }
}
