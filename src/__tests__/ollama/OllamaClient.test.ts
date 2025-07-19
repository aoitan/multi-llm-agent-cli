import { OllamaClient, ChatResponseChunk, Model, Message } from '../../ollama/OllamaClient';
import axios, { AxiosError } from 'axios';

// axiosをモック化
jest.mock('axios', () => ({
  __esModule: true, // ES Moduleとして扱う
  default: {
    post: jest.fn(),
    get: jest.fn(),
    isAxiosError: jest.fn((payload): payload is AxiosError => payload instanceof AxiosError),
  },
  AxiosError: jest.requireActual('axios').AxiosError, // AxiosErrorクラスを実際のモジュールから取得
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// configモジュールをモック化
jest.mock('../../config', () => ({
  getCurrentEndpoint: jest.fn(() => ({ name: 'test', url: 'http://localhost:11434' })),
  listEndpoints: jest.fn(() => ([{ name: 'test', url: 'http://localhost:11434' }])),
}));

describe('OllamaClient', () => {
  let client: OllamaClient;
  let baseUrl: string;

  beforeEach(() => {
    client = new OllamaClient(); // 引数なしで初期化
    baseUrl = require('../../config').getCurrentEndpoint().url; // モックされたエンドポイントのURLを取得
    mockedAxios.post.mockClear();
    mockedAxios.get.mockClear();
  });

  describe('chat', () => {
    it('should handle streaming chat responses', async () => {
      const mockChunks: ChatResponseChunk[] = [
        { model: 'test-model', created_at: '', message: { role: 'assistant', content: 'Hello' }, done: false },
        { model: 'test-model', created_at: '', message: { role: 'assistant', content: ' World' }, done: false },
        { model: 'test-model', created_at: '', done: true, total_duration: 1000 },
      ];

      // ストリームのモック
      const mockStream = new (require('stream').Readable)({
        read() {
          mockChunks.forEach(chunk => {
            this.push(JSON.stringify(chunk) + '\n');
          });
          this.push(null);
        }
      });

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: mockStream,
        headers: { 'content-type': 'application/json' },
      });

      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      const receivedChunks: ChatResponseChunk[] = [];
      for await (const chunk of client.chat('test-model', messages, true)) {
        receivedChunks.push(chunk);
      }

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${baseUrl}/api/chat`,
        { model: 'test-model', messages, stream: true },
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
          responseType: 'stream',
        })
      );
      expect(receivedChunks).toEqual(mockChunks);
    });

    it('should handle non-streaming chat responses', async () => {
      const mockResponse: ChatResponseChunk = {
        model: 'test-model', created_at: '', message: { role: 'assistant', content: 'Hello World' }, done: true,
      };

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
        headers: { 'content-type': 'application/json' },
      });

      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      const receivedChunks: ChatResponseChunk[] = [];
      for await (const chunk of client.chat('test-model', messages, false)) {
        receivedChunks.push(chunk);
      }

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${baseUrl}/api/chat`,
        { model: 'test-model', messages, stream: false },
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
          responseType: 'json',
        })
      );
      expect(receivedChunks).toEqual([mockResponse]);
    });

    it('should throw an error for non-ok responses', async () => {
      mockedAxios.post.mockRejectedValueOnce(new AxiosError(
        'Request failed with status code 500',
        'ERR_BAD_REQUEST',
        { headers: {} as any }, // config
        {} as any, // request (any型で一時的に回避)
        { // response
          status: 500,
          statusText: 'Internal Server Error',
          data: 'Internal Server Error',
          headers: {},
          config: { headers: {} as any },
        } as any // response (any型で一時的に回避)
      ));

      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      let thrownError: any;
      try {
        for await (const chunk of client.chat('test-model', messages)) {
          // do nothing
        }
      } catch (e) {
        thrownError = e;
      }
      expect(thrownError).toBeInstanceOf(Error);
      expect(thrownError.message).toContain('Ollama APIエラー (500): Internal Server Error');
    });
  });

  describe('getModels', () => {
    it('should return a list of models', async () => {
      const mockModels: Model[] = [
        { name: 'llama2', modified_at: '', size: 100, digest: '', details: {} as any },
        { name: 'codellama', modified_at: '', size: 200, digest: '', details: {} as any },
      ];

      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { models: mockModels },
        headers: { 'content-type': 'application/json' },
      });

      const models = await client.getModels();

      expect(mockedAxios.get).toHaveBeenCalledWith(`${baseUrl}/api/tags`);
      expect(models).toEqual(mockModels);
    });

    it('should throw an error for non-ok responses', async () => {
      mockedAxios.get.mockRejectedValueOnce(new AxiosError(
        'Request failed with status code 404',
        'ERR_BAD_REQUEST',
        { headers: {} as any }, // config
        {} as any, // request (any型で一時的に回避)
        { // response
          status: 404,
          statusText: 'Not Found',
          data: 'Not Found',
          headers: {},
          config: { headers: {} as any },
        } as any // response (any型で一時的に回避)
      ));

      let thrownError: any;
      try {
        await client.getModels();
      } catch (e) {
        thrownError = e;
      }
      expect(thrownError).toBeInstanceOf(Error);
      expect(thrownError.message).toContain('Ollama APIエラー (404): Not Found');
    });
  });
});