import axios, { AxiosError } from "axios";
import { getCurrentEndpoint, listEndpoints, Endpoint } from "../config";
import { logger } from "../utils/logger";

function isErrorResponseDataWithMessage(
  data: unknown,
): data is { message: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof (data as any).message === "string"
  );
}

function getErrorMessageFromAxiosError(error: AxiosError): string {
  if (error.response) {
    const details = isErrorResponseDataWithMessage(error.response.data)
      ? error.response.data.message
      : "(no details)";
    return `Ollama APIエラー (${error.response.status}): ${error.response.statusText || error.message}. 詳細: ${details}`;
  } else if (error.code === "ECONNREFUSED") {
    return `Ollamaサーバーに接続できません。Ollamaが実行中か確認してください。`;
  } else if (error.code === "ETIMEDOUT") {
    return `Ollamaサーバーへの接続がタイムアウトしました。Ollamaが応答しているか確認してください。`;
  } else {
    return `ネットワークエラー: ${error.message}`;
  }
}

export interface Message {
  role: "user" | "assistant" | "system";
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
    role: "assistant";
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
  private endpoints: Endpoint[];
  private currentEndpointIndex: number;

  constructor() {
    this.endpoints = listEndpoints();
    const currentEndpointName = getCurrentEndpoint().name;
    this.currentEndpointIndex = this.endpoints.findIndex(
      (ep) => ep.name === currentEndpointName,
    );
    if (this.currentEndpointIndex === -1) {
      this.currentEndpointIndex = 0; // Fallback to first endpoint if current is not found
    }
  }

  private getNextEndpoint(): string {
    if (this.endpoints.length === 0) {
      throw new Error("No Ollama endpoints configured.");
    }
    const endpoint = this.endpoints[this.currentEndpointIndex].url;
    this.currentEndpointIndex =
      (this.currentEndpointIndex + 1) % this.endpoints.length;
    return endpoint;
  }

  private handleAxiosError(error: AxiosError, baseUrl: string): never {
    const errorMessage = getErrorMessageFromAxiosError(error);
    throw new Error(errorMessage);
  }

  public async *chat(
    model: string,
    messages: Message[],
    stream: boolean = true,
  ): AsyncGenerator<ChatResponseChunk> {
    const baseUrl = this.getNextEndpoint();
    const url = `${baseUrl}/api/chat`;
    const body: ChatRequest = { model, messages, stream };

    try {
      const response = await axios.post<ChatResponseChunk>(url, body, {
        headers: {
          "Content-Type": "application/json",
        },
        responseType: stream ? "stream" : "json",
      });

      if (response.status !== 200) {
        throw new Error(
          `Ollama API error: ${response.status} - ${response.statusText}`,
        );
      }

      if (stream && response.data) {
        const readableStream =
          response.data as unknown as NodeJS.ReadableStream;
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        for await (const chunk of readableStream) {
          buffer += decoder.decode(chunk as Uint8Array, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim() === "") continue;
            try {
              const parsedChunk: ChatResponseChunk = JSON.parse(line);
              yield parsedChunk;
            } catch (e) {
              logger.error("Failed to parse JSON chunk:", line, e);
            }
          }
        }
        if (buffer.trim() !== "") {
          try {
            const parsedChunk: ChatResponseChunk = JSON.parse(buffer);
            yield parsedChunk;
          } catch (e) {
            logger.error("Failed to parse final JSON chunk:", buffer, e);
          }
        }
      } else {
        yield response.data;
      }
    } catch (error) {
      this.handleAxiosError(error as AxiosError, baseUrl);
    }
  }

  public async getModels(): Promise<Model[]> {
    const baseUrl = this.getNextEndpoint(); // Use round-robin for model listing as well
    const url = `${baseUrl}/api/tags`;
    try {
      const response = await axios.get<{ models: Model[] }>(url);
      if (response.status !== 200) {
        throw new Error(
          `Ollama API error: ${response.status} - ${response.statusText}`,
        );
      }
      return response.data.models;
    } catch (error) {
      this.handleAxiosError(error as AxiosError, baseUrl);
    }
  }
}
