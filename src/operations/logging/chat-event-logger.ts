import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { ModelResolutionSource } from "../../shared/types/chat";
import { RoleName } from "../../domain/orchestration/entities/role";

const DEFAULT_LOG_DIR = path.join(os.homedir(), ".multi-llm-agent-cli", "logs");
const DEFAULT_LOG_FILE = "chat-events.jsonl";
const DEFAULT_MAX_LOG_BYTES = 1024 * 1024;

export interface ChatEventLogEntry {
  timestamp: string;
  session_id: string;
  event_type:
    | "session_start"
    | "session_save"
    | "session_load"
    | "session_end"
    | "context_show"
    | "context_set"
    | "context_clear"
    | "context_summarize"
    | "turn_completed"
    | "turn_failed"
    | "role_delegation";
  model?: string;
  resolution_source?: ModelResolutionSource;
  user_input?: string;
  assistant_response?: string;
  duration_ms?: number;
  error_message?: string;
  parent_task_id?: string;
  child_task_id?: string;
  delegated_role?: RoleName;
  delegated_at?: string;
  result_at?: string;
  failure_reason?: string;
  retry_count?: number;
  loop_trigger?: "retry_limit" | "cycle_limit";
  loop_threshold?: number;
  loop_recent_history?: string[];
}

export type ChatEventLogger = (entry: ChatEventLogEntry) => Promise<void>;

function resolveLogDir(): string {
  const configured = process.env.CHAT_EVENT_LOG_DIR?.trim();
  if (configured) {
    return configured;
  }

  return DEFAULT_LOG_DIR;
}

function resolveLogFile(): string {
  const configured = process.env.CHAT_EVENT_LOG_FILE?.trim();
  if (configured) {
    return configured;
  }

  return path.join(resolveLogDir(), DEFAULT_LOG_FILE);
}

function resolveMaxLogBytes(): number {
  const configured = Number(process.env.CHAT_EVENT_LOG_MAX_BYTES);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_MAX_LOG_BYTES;
}

async function safeChmod(targetPath: string, mode: number): Promise<void> {
  try {
    await fsp.chmod(targetPath, mode);
  } catch {
    // Ignore chmod errors to keep logging best-effort across OS.
  }
}

function shouldHardenDirectoryPermissions(logDir: string): boolean {
  const configuredLogFile = process.env.CHAT_EVENT_LOG_FILE?.trim();
  if (configuredLogFile) {
    return false;
  }

  return path.resolve(logDir) === path.resolve(resolveLogDir());
}

async function rotateIfNeeded(
  logFile: string,
  maxBytes: number,
): Promise<void> {
  try {
    const stat = await fsp.stat(logFile);
    if (stat.size < maxBytes) {
      return;
    }

    const rotated = `${logFile}.${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await fsp.rename(logFile, rotated);
    await safeChmod(rotated, 0o600);
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode === "ENOENT") {
      return;
    }
    throw error;
  }
}

function maskSensitiveText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_KEY]")
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9._-]{32,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[REDACTED_NUMBER]");
}

export function sanitizeChatEventLogEntry(
  entry: ChatEventLogEntry,
): ChatEventLogEntry {
  return {
    ...entry,
    user_input: entry.user_input
      ? maskSensitiveText(entry.user_input)
      : entry.user_input,
    assistant_response: entry.assistant_response
      ? maskSensitiveText(entry.assistant_response)
      : entry.assistant_response,
    loop_recent_history: entry.loop_recent_history?.map((item) =>
      maskSensitiveText(item),
    ),
  };
}

export const writeChatEventLog: ChatEventLogger = async (entry) => {
  const logFile = resolveLogFile();
  const logDir = path.dirname(logFile);
  const maxBytes = resolveMaxLogBytes();

  await fsp.mkdir(logDir, { recursive: true });
  if (shouldHardenDirectoryPermissions(logDir)) {
    await safeChmod(logDir, 0o700);
  }
  await rotateIfNeeded(logFile, maxBytes);

  const payload = `${JSON.stringify(sanitizeChatEventLogEntry(entry))}\n`;
  const handle = await fsp.open(logFile, "a", 0o600);
  try {
    await handle.appendFile(payload, "utf-8");
  } finally {
    await handle.close();
  }
  await safeChmod(logFile, 0o600);
};
