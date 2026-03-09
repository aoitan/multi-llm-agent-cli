import * as readline from "readline";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  method?: string;
  params?: any;
}

export class McpClient {
  private input: NodeJS.ReadableStream;
  private output: NodeJS.WritableStream;
  private reader: readline.Interface | null = null;
  private messageIdCounter = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
  >();

  constructor(
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout,
  ) {
    this.input = input;
    this.output = output;
  }

  public connect(): Promise<void> {
    if (this.reader) {
      return Promise.resolve();
    }

    this.reader = readline.createInterface({
      input: this.input,
      crlfDelay: Infinity,
    });

    this.reader.on("line", (line) => {
      const message = line.trim();
      if (!message) {
        return;
      }
      this.handleMessage(message);
    });

    this.reader.on("error", (error) => {
      for (const pending of this.pendingRequests.values()) {
        pending.reject(error);
      }
      this.pendingRequests.clear();
    });

    return Promise.resolve();
  }

  public disconnect(): void {
    this.reader?.close();
    this.reader = null;
  }

  public async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.reader) {
      throw new Error("stdio is not connected.");
    }

    const id = this.messageIdCounter++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.output.write(`${JSON.stringify(request)}\n`);
    });
  }

  private handleMessage(message: string) {
    try {
      const response: JsonRpcResponse = JSON.parse(message);

      if (response.id !== undefined && response.id !== null) {
        const pending = this.pendingRequests.get(response.id as number);
        if (!pending) {
          return;
        }
        if (response.error) {
          pending.reject(response.error);
        } else {
          pending.resolve(response.result);
        }
        this.pendingRequests.delete(response.id as number);
        return;
      }

      if (response.method) {
        console.log(
          `Received notification: ${response.method} with params:`,
          response.params,
        );
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  }
}
