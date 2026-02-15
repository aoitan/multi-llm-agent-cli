export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatChunk {
  content: string;
  done: boolean;
}

export type ModelResolutionSource = 'cli' | 'session' | 'default';
