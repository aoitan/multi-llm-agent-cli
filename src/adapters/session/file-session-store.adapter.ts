import * as fs from "fs";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { ChatRole } from "../../shared/types/chat";
import {
  DEFAULT_SESSION_CONTEXT_POLICY,
  isValidSessionId,
  SessionRecord,
  SESSION_ID_PATTERN,
  SessionStorePort,
} from "../../ports/outbound/session-store.port";

interface SessionConfig {
  models?: Record<string, string>;
  sessions?: Record<string, SessionRecord>;
}

function resolveConfigDir(): string {
  const configured = process.env.MULTI_LLM_AGENT_CONFIG_DIR?.trim();
  if (configured) {
    return configured;
  }
  return path.join(os.homedir(), ".multi-llm-agent-cli");
}

const CONFIG_DIR = resolveConfigDir();
const SESSION_FILE = path.join(CONFIG_DIR, "session.json");
const SESSION_LOCK_FILE = path.join(CONFIG_DIR, "session.lock");
const SESSION_FILE_MODE = 0o600;
const SESSION_DIR_MODE = 0o700;
const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const DEFAULT_LOCK_RETRY_DELAY_MS = 50;
const DEFAULT_LOCK_STALE_MS = 60_000;

function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

const LOCK_TIMEOUT_MS = parsePositiveIntegerEnv(
  process.env.MULTI_LLM_SESSION_LOCK_TIMEOUT_MS,
  DEFAULT_LOCK_TIMEOUT_MS,
);
const LOCK_RETRY_DELAY_MS = parsePositiveIntegerEnv(
  process.env.MULTI_LLM_SESSION_LOCK_RETRY_DELAY_MS,
  DEFAULT_LOCK_RETRY_DELAY_MS,
);
const LOCK_STALE_MS = parsePositiveIntegerEnv(
  process.env.MULTI_LLM_SESSION_LOCK_STALE_MS,
  DEFAULT_LOCK_STALE_MS,
);

interface LockMetadata {
  pid: number;
  createdAt: number;
}

function toSafeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toSafeMessages(value: unknown): SessionRecord["messages"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const messages: SessionRecord["messages"] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const role = (item as Record<string, unknown>).role;
    const content = (item as Record<string, unknown>).content;
    if (!isChatRole(role) || typeof content !== "string") {
      continue;
    }
    messages.push({ role, content });
  }
  return messages;
}

function isChatRole(value: unknown): value is ChatRole {
  return value === "user" || value === "assistant" || value === "system";
}

function normalizeSession(session: unknown): SessionRecord {
  const source =
    session && typeof session === "object"
      ? (session as Record<string, unknown>)
      : {};
  const policy =
    source.policy && typeof source.policy === "object"
      ? (source.policy as Record<string, unknown>)
      : {};

  return {
    model: toSafeOptionalString(source.model),
    messages: toSafeMessages(source.messages),
    summary: toSafeOptionalString(source.summary),
    policy: {
      maxTurns:
        typeof policy.maxTurns === "number" && policy.maxTurns >= 0
          ? Math.floor(policy.maxTurns)
          : DEFAULT_SESSION_CONTEXT_POLICY.maxTurns,
      summaryEnabled:
        typeof policy.summaryEnabled === "boolean"
          ? policy.summaryEnabled
          : DEFAULT_SESSION_CONTEXT_POLICY.summaryEnabled,
    },
    savedAt: toSafeOptionalString(source.savedAt),
    loadedAt: toSafeOptionalString(source.loadedAt),
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : new Date().toISOString(),
  };
}

async function safeChmod(targetPath: string, mode: number): Promise<void> {
  try {
    await fsp.chmod(targetPath, mode);
  } catch {
    // Keep storage best-effort across OS/filesystem types.
  }
}

function validateSessionId(sessionId: string): void {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
}

function toSafeStringRecord(input: unknown): Record<string, string> {
  const record = Object.create(null) as Record<string, string>;
  if (!input || typeof input !== "object") {
    return record;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!SESSION_ID_PATTERN.test(key) || typeof value !== "string") {
      continue;
    }
    record[key] = value;
  }
  return record;
}

function toSafeSessionRecordMap(input: unknown): Record<string, SessionRecord> {
  const record = Object.create(null) as Record<string, SessionRecord>;
  if (!input || typeof input !== "object") {
    return record;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!SESSION_ID_PATTERN.test(key) || !value || typeof value !== "object") {
      continue;
    }
    record[key] = normalizeSession(value as Partial<SessionRecord>);
  }
  return record;
}

function normalizeConfig(config: SessionConfig): SessionConfig {
  return {
    models: toSafeStringRecord(config.models),
    sessions: toSafeSessionRecordMap(config.sessions),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FileSessionStoreAdapter implements SessionStorePort {
  async getModel(sessionId: string): Promise<string | undefined> {
    validateSessionId(sessionId);
    const session = await this.getSession(sessionId);
    return session?.model;
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    validateSessionId(sessionId);
    await this.withConfigLock(async () => {
      const config = normalizeConfig(await this.readConfig());
      const existing = config.sessions?.[sessionId]
        ? normalizeSession(config.sessions[sessionId])
        : config.models?.[sessionId]
          ? normalizeSession({ model: config.models[sessionId] })
          : undefined;
      const session = normalizeSession({
        ...existing,
        model,
        updatedAt: new Date().toISOString(),
      });
      await this.saveSessionUnlocked(config, sessionId, session);
    });
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    validateSessionId(sessionId);
    const config = normalizeConfig(await this.readConfig());
    const fromSessions = config.sessions?.[sessionId];
    if (fromSessions) {
      return normalizeSession(fromSessions);
    }
    const legacyModel = config.models?.[sessionId];
    if (legacyModel) {
      return normalizeSession({ model: legacyModel });
    }
    return undefined;
  }

  async saveSession(sessionId: string, session: SessionRecord): Promise<void> {
    validateSessionId(sessionId);
    await this.withConfigLock(async () => {
      const config = normalizeConfig(await this.readConfig());
      await this.saveSessionUnlocked(config, sessionId, session);
    });
  }

  async endSession(sessionId: string): Promise<void> {
    validateSessionId(sessionId);
    await this.withConfigLock(async () => {
      const config = normalizeConfig(await this.readConfig());
      const sessions = config.sessions ?? Object.create(null);
      const models = config.models ?? Object.create(null);
      delete sessions[sessionId];
      delete models[sessionId];
      await this.writeConfig({ ...config, sessions, models });
    });
  }

  private async saveSessionUnlocked(
    config: SessionConfig,
    sessionId: string,
    session: SessionRecord,
  ): Promise<void> {
    const sessions = config.sessions ?? Object.create(null);
    sessions[sessionId] = normalizeSession(session);
    const models = config.models ?? Object.create(null);
    if (session.model) {
      models[sessionId] = session.model;
    } else {
      delete models[sessionId];
    }

    await this.writeConfig({ ...config, sessions, models });
  }

  private async withConfigLock<T>(action: () => Promise<T>): Promise<T> {
    await fsp.mkdir(CONFIG_DIR, { recursive: true });
    await safeChmod(CONFIG_DIR, SESSION_DIR_MODE);
    const startedAt = Date.now();
    let handle: fs.promises.FileHandle | undefined;

    while (!handle) {
      try {
        handle = await fsp.open(SESSION_LOCK_FILE, "wx", SESSION_FILE_MODE);
        await handle.writeFile(
          JSON.stringify({
            pid: process.pid,
            createdAt: Date.now(),
          } satisfies LockMetadata),
          "utf-8",
        );
        await handle.sync();
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") {
          throw error;
        }

        const recovered = await this.tryRecoverStaleLock();
        if (recovered) {
          continue;
        }

        if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
          throw new Error(
            `Timed out waiting for session lock after ${LOCK_TIMEOUT_MS}ms. Please retry.`,
          );
        }
        await sleep(LOCK_RETRY_DELAY_MS);
      }
    }

    try {
      return await action();
    } finally {
      await handle.close();
      try {
        await fsp.unlink(SESSION_LOCK_FILE);
      } catch {
        // Best effort unlock.
      }
    }
  }

  private async tryRecoverStaleLock(): Promise<boolean> {
    try {
      const raw = await fsp.readFile(SESSION_LOCK_FILE, "utf-8");
      const metadata = this.parseLockMetadata(raw);
      const now = Date.now();

      let lockAgeMs: number;
      if (metadata?.createdAt) {
        lockAgeMs = now - metadata.createdAt;
      } else {
        const stat = await fsp.stat(SESSION_LOCK_FILE);
        lockAgeMs = now - stat.mtimeMs;
      }

      if (lockAgeMs < LOCK_STALE_MS) {
        return false;
      }

      if (metadata?.pid !== undefined && this.isProcessAlive(metadata.pid)) {
        return false;
      }

      await fsp.unlink(SESSION_LOCK_FILE);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return true;
      }
      return false;
    }
  }

  private parseLockMetadata(raw: string): LockMetadata | undefined {
    try {
      const parsed = JSON.parse(raw) as Partial<LockMetadata>;
      if (
        typeof parsed?.pid === "number" &&
        Number.isInteger(parsed.pid) &&
        parsed.pid > 0 &&
        typeof parsed?.createdAt === "number" &&
        Number.isFinite(parsed.createdAt) &&
        parsed.createdAt > 0
      ) {
        return {
          pid: parsed.pid,
          createdAt: parsed.createdAt,
        };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        return false;
      }
      // EPERM or unknown errors are treated as "alive" to avoid unsafe lock stealing.
      return true;
    }
  }

  private async writeConfig(config: SessionConfig): Promise<void> {
    const tempFile = `${SESSION_FILE}.tmp-${process.pid}-${Date.now()}`;
    const payload = JSON.stringify(config, null, 2);
    await fsp.writeFile(tempFile, payload, {
      encoding: "utf-8",
      mode: SESSION_FILE_MODE,
    });
    await safeChmod(tempFile, SESSION_FILE_MODE);
    await fsp.rename(tempFile, SESSION_FILE);
    await safeChmod(SESSION_FILE, SESSION_FILE_MODE);
  }

  private async readConfig(): Promise<SessionConfig> {
    try {
      if (!fs.existsSync(SESSION_FILE)) {
        return {};
      }

      const raw = await fsp.readFile(SESSION_FILE, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed === null ||
        Array.isArray(parsed) ||
        typeof parsed !== "object"
      ) {
        await this.backupCorruptConfigFile();
        return {};
      }
      return parsed as SessionConfig;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        await this.backupCorruptConfigFile();
      }
      return {};
    }
  }

  private async backupCorruptConfigFile(): Promise<void> {
    if (!fs.existsSync(SESSION_FILE)) {
      return;
    }

    const backupFile = `${SESSION_FILE}.corrupt-${Date.now()}`;
    try {
      await fsp.rename(SESSION_FILE, backupFile);
    } catch {
      // Keep best-effort fallback; an unreadable file should not break CLI startup.
    }
  }
}
