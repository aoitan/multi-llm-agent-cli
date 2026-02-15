import { ChatChunk, ChatMessage } from "../../shared/types/chat";

export interface ModelSummary {
  name: string;
}

export interface LlmClientPort {
  listModels(): Promise<ModelSummary[]>;
  chat(model: string, messages: ChatMessage[]): AsyncGenerator<ChatChunk>;
}
