import { WebSocketServer, WebSocket } from 'ws';
import { OllamaClient, Message } from '../ollama/OllamaClient';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';

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

interface Task {
  id: string;
  prompt: string;
  status: 'pending' | 'orchestrating' | 'working' | 'completed' | 'failed';
  orchestratorOutput?: string;
  workerOutput?: string;
  finalResponse?: string;
}

// ツール関数の型定義
type ToolFunction = (...args: any[]) => Promise<any>;

const PLUGIN_DIR = path.join(os.homedir(), '.multi-llm-agent-cli', 'plugins');

export class McpServer {
  private wss: WebSocketServer;
  private orchestratorLLM: OllamaClient;
  private workerLLM: OllamaClient;
  private tasks: Map<string, Task> = new Map(); // タスクの状態管理
  private tools: Map<string, ToolFunction> = new Map(); // 登録されたツール

  constructor(port: number = 8080) {
    this.wss = new WebSocketServer({ port });
    this.orchestratorLLM = new OllamaClient(); // 指示者LLM
    this.workerLLM = new OllamaClient();     // 作業者LLM

    // ダミーのツールを登録
    this.registerTool('calculator', async (expression: string) => {
      try {
        // 簡易的な計算処理
        const result = eval(expression); // evalの使用はセキュリティリスクがあるため、実際のプロダクションでは避けるべき
        return `計算結果: ${expression} = ${result}`;
      } catch (e: any) {
        return `計算エラー: ${e instanceof Error ? e.message : String(e)}`;
      }
    });

    this.loadPlugins(); // プラグインをロード

    logger.info(`MCP Server started on ws://localhost:${port}`);

    this.wss.on('connection', ws => {
      logger.info('Client connected');

      ws.on('message', message => {
        this.handleMessage(ws, message.toString());
      });

      ws.on('close', () => {
        logger.info('Client disconnected');
      });

      ws.on('error', error => {
        logger.error('WebSocket error:', error);
      });
    });

    this.wss.on('error', error => {
      logger.error('WebSocket server error:', error);
    });
  }

  private registerTool(name: string, func: ToolFunction) {
    this.tools.set(name, func);
    logger.info(`Tool registered: ${name}`);
  }

  private async callTool(toolName: string, ...args: any[]): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    return tool(...args);
  }

  private loadPlugins() {
    if (!fs.existsSync(PLUGIN_DIR)) {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      logger.info(`Plugin directory created: ${PLUGIN_DIR}`);
      return;
    }

    const pluginFiles = fs.readdirSync(PLUGIN_DIR).filter(file => file.endsWith('.js'));

    for (const file of pluginFiles) {
      const pluginPath = path.join(PLUGIN_DIR, file);
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const plugin = require(pluginPath);
        if (plugin.name && typeof plugin.handler === 'function') {
          this.registerTool(plugin.name, plugin.handler);
        } else {
          logger.warn(`Invalid plugin format: ${file}. Must export 'name' and 'handler' function.`);
        }
      } catch (e: any) {
        if (e instanceof Error) {
          logger.error(`Failed to load plugin ${file}:`, e.message);
        } else {
          logger.error(`Failed to load plugin ${file}:`, String(e));
        }
      }
    }
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
          const taskId = `task-${Date.now()}`;
          this.tasks.set(taskId, { id: taskId, prompt: userPrompt, status: 'pending' });

          this.runOrchestration(taskId, userPrompt, ws) // WebSocketを渡して進捗を通知できるようにする
            .then(finalResponse => {
              this.sendResponse(ws, request.id, { response: finalResponse, taskId: taskId });
              this.tasks.get(taskId)!.status = 'completed';
            })
            .catch(error => {
              logger.error(`Orchestration failed for task ${taskId}:`, error);
              this.sendError(ws, request.id, -32000, `Orchestration failed: ${error.message}`);
              this.tasks.get(taskId)!.status = 'failed';
            });
          break;
        default:
          this.sendError(ws, request.id, -32601, `Method not found: ${request.method}`);
          break;
      }
    } catch (error) {
      logger.error('Error parsing message or handling request:', error);
      this.sendError(ws, null, -32700, 'Parse error');
    }
  }

  private async runOrchestration(taskId: string, userPrompt: string, ws: WebSocket): Promise<string> {
    const task = this.tasks.get(taskId)!;
    task.status = 'orchestrating';
    this.sendNotification(ws, 'task_status_update', { taskId, status: task.status, message: 'Orchestrator LLM processing...' });

    // Step 1: Orchestrator LLM processes the user prompt
    const orchestratorMessages: Message[] = [
      { role: 'user', content: `ユーザーの要求をタスクに分解し、必要に応じてツールを呼び出し、作業者LLMに指示してください。利用可能なツール: ${Array.from(this.tools.keys()).join(', ')}` },
      { role: 'user', content: userPrompt }
    ];
    let orchestratorOutput = '';
    for await (const chunk of this.orchestratorLLM.chat('llama2', orchestratorMessages)) { // モデル名は仮
      if (chunk.message?.content) {
        orchestratorOutput += chunk.message.content;
      }
    }
    task.orchestratorOutput = orchestratorOutput;
    this.sendNotification(ws, 'task_status_update', { taskId, status: task.status, message: 'Orchestrator LLM finished. Checking for tool calls...' });

    // ツール呼び出しのシミュレーション
    const toolCallMatch = orchestratorOutput.match(/CALL_TOOL\(([^,]+),\s*(.*)\)/);
    let toolResult = '';
    if (toolCallMatch) {
      const toolName = toolCallMatch[1].trim();
      const toolArgs = toolCallMatch[2].trim();
      this.sendNotification(ws, 'task_status_update', { taskId, status: task.status, message: `Calling tool: ${toolName} with args: ${toolArgs}` });
      try {
        toolResult = await this.callTool(toolName, toolArgs);
        this.sendNotification(ws, 'task_status_update', { taskId, status: task.status, message: `Tool result: ${toolResult}` });
      } catch (e: any) {
        toolResult = `Tool error: ${(e as Error).message}`;
        this.sendNotification(ws, 'task_status_update', { taskId, status: task.status, message: toolResult });
      }
    }

    // Step 2: Simulate task assignment to Worker LLM
    task.status = 'working';
    this.sendNotification(ws, 'task_status_update', { taskId, status: task.status, message: 'Worker LLM processing...' });
    const workerMessages: Message[] = [
      { role: 'user', content: `指示者からのタスク: ${orchestratorOutput}` },
      { role: 'assistant', content: `ツール実行結果: ${toolResult}` }
    ];
    let workerOutput = '';
    for await (const chunk of this.workerLLM.chat('llama2', workerMessages)) { // モデル名は仮
      if (chunk.message?.content) {
        workerOutput += chunk.message.content;
      }
    }
    task.workerOutput = workerOutput;
    this.sendNotification(ws, 'task_status_update', { taskId, status: task.status, message: 'Worker LLM finished. Synthesizing final response...' });

    // Step 3: Orchestrator LLM synthesizes the final response
    const finalMessages: Message[] = [
      { role: 'user', content: `ユーザーの要求: ${userPrompt}` },
      { role: 'assistant', content: `作業者LLMの実行結果: ${workerOutput}` },
      { role: 'assistant', content: `ツール実行結果: ${toolResult}` },
      { role: 'user', content: 'この結果に基づいて、ユーザーへの最終的な応答を生成してください。' }
    ];
    let finalResponse = '';
    for await (const chunk of this.orchestratorLLM.chat('llama2', finalMessages)) { // モデル名は仮
      if (chunk.message?.content) {
        finalResponse += chunk.message.content;
      }
    }
    task.finalResponse = finalResponse;
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
