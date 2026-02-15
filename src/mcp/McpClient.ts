import WebSocket from 'ws';

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

export class McpClient {
  private ws: WebSocket | null = null;
  private url: string;
  private messageIdCounter: number = 0;
  private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (reason?: any) => void }>();

  constructor(url: string = 'ws://localhost:8080') {
    this.url = url;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('Connected to MCP Server');
        resolve();
      };

      this.ws.onmessage = event => {
        this.handleMessage(event.data.toString());
      };

      this.ws.onclose = () => {
        console.log('Disconnected from MCP Server');
      };

      this.ws.onerror = error => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected.');
    }

    const id = this.messageIdCounter++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws?.send(JSON.stringify(request));
    });
  }

  private handleMessage(message: string) {
    try {
      const response: JsonRpcResponse = JSON.parse(message);

      if (response.id !== undefined && response.id !== null) {
        // This is a response to a request
        const pending = this.pendingRequests.get(response.id as number);
        if (pending) {
          if (response.error) {
            pending.reject(response.error);
          } else {
            pending.resolve(response.result);
          }
          this.pendingRequests.delete(response.id as number);
        }
      } else {
        // This might be a notification (a request without an id)
        const notification = response as JsonRpcRequest;
        if (notification.method) {
          console.log(`Received notification: ${notification.method} with params:`, notification.params);
          // Handle notifications here (e.g., 'initialized', 'notifications/roots/list_changed')
        }
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }
}
