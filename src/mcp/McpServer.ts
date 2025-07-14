import { WebSocketServer, WebSocket } from 'ws';
import { OllamaClient, Message } from '../ollama/OllamaClient';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class McpServer {
  private wss: WebSocketServer;
  private orchestratorLLM: OllamaClient;
  private workerLLM: OllamaClient;

  constructor(port: number = 8080) {
    this.wss = new WebSocketServer({ port });
    this.orchestratorLLM = new OllamaClient(); // 指示者LLM
    this.workerLLM = new OllamaClient();     // 作業者LLM

    console.log(`MCP Server started on ws://localhost:${port}`);

    this.wss.on('connection', ws => {
      console.log('Client connected');

      ws.on('message', message => {
        this.handleMessage(ws, message.toString());
      });

      ws.on('close', () => {
        console.log('Client disconnected');
      });

      ws.on('error', error => {
        console.error('WebSocket error:', error);
      });
    });

    this.wss.on('error', error => {
      console.error('WebSocket server error:', error);
    });
  }

  private async handleMessage(ws: WebSocket, message: string) {
    try {
      const request: JsonRpcRequest = JSON.parse(message);

      if (request.jsonrpc !== '2.0' || !request.method) {
        this.sendError(ws, request.id || null, -32600, 'Invalid Request');
        return;
      }

      let result: any;
      switch (request.method) {
        case 'initialize':
          result = { capabilities: {} }; // Basic capabilities for now
          this.sendResponse(ws, request.id, result);
          // Send initialized notification
          this.sendNotification(ws, 'initialized', {});
          break;
        case 'roots/list':
          result = { roots: [] }; // No roots for now
          this.sendResponse(ws, request.id, result);
          break;
        case 'orchestrate/task': // 新しいメソッド: オーケストレーションタスクの開始
          const userPrompt = request.params.prompt;
          const orchestratorResponse = await this.runOrchestration(userPrompt);
          this.sendResponse(ws, request.id, { response: orchestratorResponse });
          break;
        default:
          this.sendError(ws, request.id, -32601, `Method not found: ${request.method}`);
          break;
      }
    } catch (error) {
      console.error('Error parsing message or handling request:', error);
      this.sendError(ws, null, -32700, 'Parse error');
    }
  }

  private async runOrchestration(userPrompt: string): Promise<string> {
    // Step 1: Orchestrator LLM processes the user prompt
    const orchestratorMessages: Message[] = [{ role: 'user', content: `ユーザーの要求をタスクに分解し、作業者LLMに指示してください: ${userPrompt}` }];
    let orchestratorOutput = '';
    for await (const chunk of this.orchestratorLLM.chat('llama2', orchestratorMessages)) { // モデル名は仮
      if (chunk.message?.content) {
        orchestratorOutput += chunk.message.content;
      }
    }
    console.log('Orchestrator LLM Output:', orchestratorOutput);

    // Step 2: Simulate task assignment to Worker LLM
    const workerMessages: Message[] = [{ role: 'user', content: `指示者からのタスク: ${orchestratorOutput}` }];
    let workerOutput = '';
    for await (const chunk of this.workerLLM.chat('llama2', workerMessages)) { // モデル名は仮
      if (chunk.message?.content) {
        workerOutput += chunk.message.content;
      }
    }
    console.log('Worker LLM Output:', workerOutput);

    // Step 3: Orchestrator LLM synthesizes the final response
    const finalMessages: Message[] = [
      { role: 'user', content: `ユーザーの要求: ${userPrompt}` },
      { role: 'assistant', content: `作業者LLMの実行結果: ${workerOutput}` },
      { role: 'user', content: 'この結果に基づいて、ユーザーへの最終的な応答を生成してください。' }
    ];
    let finalResponse = '';
    for await (const chunk of this.orchestratorLLM.chat('llama2', finalMessages)) { // モデル名は仮
      if (chunk.message?.content) {
        finalResponse += chunk.message.content;
      }
    }
    return finalResponse;
  }

  private sendResponse(ws: WebSocket, id: string | number, result: any) {
    const response: JsonRpcResponse = { jsonrpc: '2.0', id, result };
    ws.send(JSON.stringify(response));
  }

  private sendError(ws: WebSocket, id: string | number | null, code: number, message: string, data?: any) {
    const response: JsonRpcResponse = { jsonrpc: '2.0', id, error: { code, message, data } };
    ws.send(JSON.stringify(response));
  }

  private sendNotification(ws: WebSocket, method: string, params: any) {
    const notification = { jsonrpc: '2.0', method, params };
    ws.send(JSON.stringify(notification));
  }

  public close() {
    this.wss.close();
  }
}
