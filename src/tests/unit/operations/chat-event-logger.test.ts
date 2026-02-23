import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import {
  sanitizeChatEventLogEntry,
  writeChatEventLog,
} from "../../../operations/logging/chat-event-logger";

describe("chat-event-logger", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "chat-event-logger-"));
  });

  afterEach(async () => {
    delete process.env.CHAT_EVENT_LOG_DIR;
    delete process.env.CHAT_EVENT_LOG_FILE;
    delete process.env.CHAT_EVENT_LOG_MAX_BYTES;
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it("masks sensitive values in chat payloads", () => {
    const entry = sanitizeChatEventLogEntry({
      timestamp: "2026-02-15T00:00:00.000Z",
      session_id: "s-1",
      event_type: "turn_completed",
      model: "test-model",
      resolution_source: "default",
      user_input:
        "mail test@example.com token sk-12345678901234567890 card 4111-1111-1111-1111",
      assistant_response:
        "Bearer thisisaverylongtokenvalue01234567890123456789",
      duration_ms: 10,
    });

    expect(entry.user_input).toContain("[REDACTED_EMAIL]");
    expect(entry.user_input).toContain("[REDACTED_KEY]");
    expect(entry.user_input).toContain("[REDACTED_NUMBER]");
    expect(entry.user_input).not.toContain("test@example.com");
    expect(entry.assistant_response).toContain("[REDACTED_TOKEN]");
  });

  it("rotates log file by size and writes with owner-only permission", async () => {
    const logFile = path.join(tempDir, "chat-events.jsonl");
    process.env.CHAT_EVENT_LOG_FILE = logFile;
    process.env.CHAT_EVENT_LOG_MAX_BYTES = "120";

    await writeChatEventLog({
      timestamp: "2026-02-15T00:00:00.000Z",
      session_id: "s-1",
      event_type: "turn_completed",
      model: "test-model",
      resolution_source: "default",
      user_input: "x".repeat(240),
      assistant_response: "ok",
      duration_ms: 10,
    });
    await writeChatEventLog({
      timestamp: "2026-02-15T00:00:01.000Z",
      session_id: "s-1",
      event_type: "turn_completed",
      model: "test-model",
      resolution_source: "default",
      user_input: "second",
      assistant_response: "ok",
      duration_ms: 10,
    });

    const files = await fsp.readdir(tempDir);
    const rotated = files.filter((f) => f.startsWith("chat-events.jsonl."));
    expect(rotated.length).toBeGreaterThan(0);

    const current = await fsp.readFile(logFile, "utf-8");
    expect(current).toContain('"user_input":"second"');

    const stat = await fsp.stat(logFile);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("does not chmod arbitrary parent directory when CHAT_EVENT_LOG_FILE is set", async () => {
    const customDir = path.join(tempDir, "custom");
    const customLogFile = path.join(customDir, "events.log");
    process.env.CHAT_EVENT_LOG_FILE = customLogFile;
    const chmodSpy = jest.spyOn(fsp, "chmod");

    await writeChatEventLog({
      timestamp: "2026-02-15T00:00:00.000Z",
      session_id: "s-1",
      event_type: "session_start",
      model: "test-model",
      resolution_source: "default",
    });

    expect(chmodSpy).not.toHaveBeenCalledWith(customDir, 0o700);
    expect(chmodSpy).toHaveBeenCalledWith(customLogFile, 0o600);
    chmodSpy.mockRestore();
  });

  it("writes session/context events without model metadata", async () => {
    const logFile = path.join(tempDir, "chat-events.jsonl");
    process.env.CHAT_EVENT_LOG_FILE = logFile;

    await writeChatEventLog({
      timestamp: "2026-02-15T00:00:00.000Z",
      session_id: "s-1",
      event_type: "context_clear",
    });

    const current = await fsp.readFile(logFile, "utf-8");
    expect(current).toContain('"event_type":"context_clear"');
    expect(current).toContain('"session_id":"s-1"');
  });

  it("writes role delegation events with parent/child and timing fields", async () => {
    const logFile = path.join(tempDir, "chat-events.jsonl");
    process.env.CHAT_EVENT_LOG_FILE = logFile;

    await writeChatEventLog({
      timestamp: "2026-02-22T02:30:00.000Z",
      session_id: "task-root",
      event_type: "role_delegation",
      parent_task_id: "task-root",
      child_task_id: "task-dev",
      delegated_role: "developer",
      delegated_at: "2026-02-22T02:30:00.000Z",
      result_at: "2026-02-22T02:30:01.000Z",
    });

    const current = await fsp.readFile(logFile, "utf-8");
    expect(current).toContain('"event_type":"role_delegation"');
    expect(current).toContain('"parent_task_id":"task-root"');
    expect(current).toContain('"child_task_id":"task-dev"');
    expect(current).toContain('"delegated_role":"developer"');
  });

  it("writes loop guard metadata for role delegation failures", async () => {
    const logFile = path.join(tempDir, "chat-events.jsonl");
    process.env.CHAT_EVENT_LOG_FILE = logFile;

    await writeChatEventLog({
      timestamp: "2026-02-22T02:40:00.000Z",
      session_id: "task-root",
      event_type: "role_delegation",
      parent_task_id: "task-root",
      child_task_id: "task-review",
      delegated_role: "reviewer",
      delegated_at: "2026-02-22T02:40:00.000Z",
      result_at: "2026-02-22T02:40:03.000Z",
      failure_reason: "Loop threshold exceeded: role=reviewer, threshold=1",
      retry_count: 1,
      loop_trigger: "cycle_limit",
      loop_threshold: 1,
      loop_recent_history: [
        "reviewer#hash",
        "email test@example.com token sk-12345678901234567890",
      ],
    });

    const current = await fsp.readFile(logFile, "utf-8");
    expect(current).toContain('"loop_trigger":"cycle_limit"');
    expect(current).toContain('"loop_threshold":1');
    expect(current).toContain(
      '"loop_recent_history":["reviewer#hash","email [REDACTED_EMAIL] token [REDACTED_KEY]"]',
    );
  });
});
