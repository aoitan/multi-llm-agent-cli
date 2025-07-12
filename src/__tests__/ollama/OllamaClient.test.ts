import { OllamaClient, ChatResponseChunk, Model, Message } from '../../ollama/OllamaClient';
import fetch from 'node-fetch';

// node-fetchをモック化
jest.mock('node-fetch', () => jest.fn());

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// ReadableStreamのモック（テスト環境によっては必要）
class MockReadableStream {
  private chunks: Uint8Array[];
  private index: number;

  constructor(chunks: Uint8Array[]) {
    this.chunks = chunks;
    this.index = 0;
  }

  getReader() {
    return {
      read: async () => {
        if (this.index < this.chunks.length) {
          return { done: false, value: this.chunks[this.index++] };
        }
        return { done: true, value: undefined };
      },
    };
  }
}

describe('OllamaClient', () => {
  let client: OllamaClient;
  const baseUrl = 'http://localhost:11434';

  beforeEach(() => {
    client = new OllamaClient(baseUrl);
    mockFetch.mockClear();
  });

  describe('chat', () => {
    it('should handle streaming chat responses', async () => {
      const mockChunks: ChatResponseChunk[] = [
        { model: 'test-model', created_at: '', message: { role: 'assistant', content: 'Hello' }, done: false },
        { model: 'test-model', created_at: '', message: { role: 'assistant', content: ' World' }, done: false },
        { model: 'test-model', created_at: '', done: true, total_duration: 1000 },
      ];

      const mockResponseStream = new MockReadableStream(
        mockChunks.map(chunk => new TextEncoder().encode(JSON.stringify(chunk) + '\n'))
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: mockResponseStream,
      } as any);

      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      const receivedChunks: ChatResponseChunk[] = [];
      for await (const chunk of client.chat('test-model', messages, true)) {
        receivedChunks.push(chunk);
      }

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/chat`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'test-model', messages, stream: true }),
        })
      );
      expect(receivedChunks).toEqual(mockChunks);
    });

    it('should handle non-streaming chat responses', async () => {
      const mockResponse: ChatResponseChunk = {
        model: 'test-model', created_at: '', message: { role: 'assistant', content: 'Hello World' }, done: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      } as any);

      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      const receivedChunks: ChatResponseChunk[] = [];
      for await (const chunk of client.chat('test-model', messages, false)) {
        receivedChunks.push(chunk);
      }

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/chat`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'test-model', messages, stream: false }),
        })
      );
      expect(receivedChunks).toEqual([mockResponse]);
    });

    it('should throw an error for non-ok responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      } as any);

      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      await expect(async () => {
        for await (const chunk of client.chat('test-model', messages)) {
          // do nothing
        }
      }).rejects.toThrow('Ollama API error: 500 - Internal Server Error');
    });
  });

  describe('getModels', () => {
    it('should return a list of models', async () => {
      const mockModels: Model[] = [
        { name: 'llama2', modified_at: '', size: 100, digest: '', details: {} as any },
        { name: 'codellama', modified_at: '', size: 200, digest: '', details: {} as any },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ models: mockModels }),
      } as any);

      const models = await client.getModels();

      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/api/tags`);
      expect(models).toEqual(mockModels);
    });

    it('should throw an error for non-ok responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      } as any);

      await expect(client.getModels()).rejects.toThrow('Ollama API error: 404 - Not Found');
    });
  });
});
