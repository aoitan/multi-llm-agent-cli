import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { ModelResolutionSource } from "../../shared/types/chat";

const LOG_DIR = path.join(os.homedir(), ".multi-llm-agent-cli", "logs");
const CHAT_EVENT_LOG = path.join(LOG_DIR, "chat-events.jsonl");

export interface ChatEventLogEntry {
  timestamp: string;
  session_id: string;
  event_type: "session_start" | "turn_completed" | "turn_failed";
  model: string;
  resolution_source: ModelResolutionSource;
  user_input?: string;
  assistant_response?: string;
  duration_ms?: number;
  error_message?: string;
}

export type ChatEventLogger = (entry: ChatEventLogEntry) => Promise<void>;

export const writeChatEventLog: ChatEventLogger = async (entry) => {
  await fsp.mkdir(LOG_DIR, { recursive: true });
  await fsp.appendFile(CHAT_EVENT_LOG, `${JSON.stringify(entry)}\n`, "utf-8");
};
