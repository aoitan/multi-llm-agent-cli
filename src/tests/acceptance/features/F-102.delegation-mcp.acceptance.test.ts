import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { McpServer } from "../../../mcp/McpServer";
import { RoleDelegationEvent } from "../../../shared/types/events";

describe("F-102 MCP delegation acceptance", () => {
  let server: any;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "f102-mcp-"));
    process.env.CHAT_EVENT_LOG_FILE = path.join(tempDir, "chat-events.jsonl");
    server = Object.create(McpServer.prototype);
    server.sendNotification = jest.fn();
  });

  afterEach(async () => {
    delete process.env.CHAT_EVENT_LOG_FILE;
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it("emits task_status_update with delegatedRole/parentTaskId/childTaskId", () => {
    const ws = {};
    const event: RoleDelegationEvent = {
      event_type: "role_delegation",
      status: "completed",
      task_id: "task-child",
      parent_task_id: "task-root",
      delegated_role: "developer",
      delegated_at: "2026-02-22T03:00:00.000Z",
      result_at: "2026-02-22T03:00:01.000Z",
    };

    server.sendRoleDelegationNotification(ws, "task-root", event);

    expect(server.sendNotification).toHaveBeenCalledWith(
      ws,
      "task_status_update",
      expect.objectContaining({
        taskId: "task-root",
        parentTaskId: "task-root",
        childTaskId: "task-child",
        delegatedRole: "developer",
      }),
    );
  });

  it("persists role delegation audit log fields", async () => {
    const event: RoleDelegationEvent = {
      event_type: "role_delegation",
      status: "failed",
      task_id: "task-child",
      parent_task_id: "task-root",
      delegated_role: "reviewer",
      delegated_at: "2026-02-22T03:10:00.000Z",
      result_at: "2026-02-22T03:10:02.000Z",
      failure_reason: "policy violation",
    };

    await server.writeRoleDelegationLog("task-root", event);

    const logFile = process.env.CHAT_EVENT_LOG_FILE!;
    const content = await fsp.readFile(logFile, "utf-8");
    expect(content).toContain('"event_type":"role_delegation"');
    expect(content).toContain('"session_id":"task-root"');
    expect(content).toContain('"parent_task_id":"task-root"');
    expect(content).toContain('"child_task_id":"task-child"');
    expect(content).toContain('"delegated_role":"reviewer"');
    expect(content).toContain('"failure_reason":"policy violation"');
  });
});
