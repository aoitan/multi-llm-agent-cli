import { WebSocketServer, WebSocket } from 'ws';

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

  constructor(port: number = 8080) {
    this.wss = new WebSocketServer({ port });
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
        default:
          this.sendError(ws, request.id, -32601, `Method not found: ${request.method}`);
          break;
      }
    } catch (error) {
      console.error('Error parsing message or handling request:', error);
      this.sendError(ws, null, -32700, 'Parse error');
    }
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
