import { evaluateArithmeticExpression } from "../../../mcp/McpServer";
import { McpServer } from "../../../mcp/McpServer";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import * as chatEventLogger from "../../../operations/logging/chat-event-logger";
import { logger } from "../../../utils/logger";

describe("McpServer arithmetic evaluator", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "mcp-unit-"));
    process.env.CHAT_EVENT_LOG_FILE = path.join(tempDir, "chat-events.jsonl");
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    delete process.env.CHAT_EVENT_LOG_FILE;
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it("evaluates basic expressions with precedence", () => {
    expect(evaluateArithmeticExpression("1 + 2 * 3")).toBe(7);
    expect(evaluateArithmeticExpression("(1 + 2) * 3")).toBe(9);
    expect(evaluateArithmeticExpression("7 / 2")).toBe(3.5);
    expect(evaluateArithmeticExpression("-3 + 5")).toBe(2);
    expect(evaluateArithmeticExpression("-(1+2)")).toBe(-3);
    expect(evaluateArithmeticExpression(".5 + .5")).toBe(1);
    expect(evaluateArithmeticExpression("5. + 0.5")).toBe(5.5);
  });

  it("rejects unsupported characters and code injection payloads", () => {
    expect(() => evaluateArithmeticExpression("process.exit(1)")).toThrow(
      "Unsupported character",
    );
    expect(() =>
      evaluateArithmeticExpression("1 + globalThis.constructor"),
    ).toThrow("Unsupported character");
  });

  it("rejects invalid arithmetic inputs", () => {
    expect(() => evaluateArithmeticExpression("")).toThrow(
      "Expression is empty",
    );
    expect(() => evaluateArithmeticExpression("1 / 0")).toThrow(
      "Division by zero",
    );
    expect(() => evaluateArithmeticExpression("(1 + 2")).toThrow(
      "Mismatched parentheses",
    );
  });

  it("lists tool status from config and built-in registrations", async () => {
    const server = Object.create(McpServer.prototype) as any;
    server.tools = new Map([["calculator", jest.fn()]]);
    server.config = {
      getMcpToolStates: jest.fn().mockResolvedValue({
        calculator: true,
        grep: false,
      }),
    };

    await expect(server.listTools()).resolves.toEqual([
      { name: "calculator", enabled: true },
      { name: "grep", enabled: false },
    ]);
  });

  it("rejects disabled tools before execution", async () => {
    const server = Object.create(McpServer.prototype) as any;
    const tool = jest.fn().mockResolvedValue("ok");
    server.tools = new Map([["calculator", tool]]);
    server.toolCallCounts = new Map();
    server.config = {
      getMcpToolStates: jest.fn().mockResolvedValue({
        calculator: false,
      }),
    };

    await expect(server.callTool("calculator", "1+1")).rejects.toThrow(
      "Tool is disabled: calculator",
    );
    expect(tool).not.toHaveBeenCalled();
  });

  it("keeps tool execution successful even when logging fails", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const writeLogSpy = jest
      .spyOn(chatEventLogger, "writeChatEventLog")
      .mockRejectedValue(new Error("disk full"));
    const server = Object.create(McpServer.prototype) as any;
    const tool = jest.fn().mockResolvedValue("ok");
    server.tools = new Map([["calculator", tool]]);
    server.toolCallCounts = new Map();
    server.config = {
      getMcpToolStates: jest.fn().mockResolvedValue({
        calculator: true,
      }),
    };

    await expect(server.callTool("calculator", "1+1")).resolves.toBe("ok");
    expect(writeLogSpy).toHaveBeenCalled();
  });

  it("loads persisted tool call counts only once before incrementing in memory", async () => {
    const readLogSpy = jest
      .spyOn(chatEventLogger, "readLatestMcpToolEntries")
      .mockResolvedValue(
        new Map([
          [
            "calculator",
            {
              timestamp: "2026-03-01T00:00:00.000Z",
              session_id: "mcp-server",
              event_type: "mcp_tool_call",
              mcp_tool_name: "calculator",
              mcp_success: true,
              mcp_call_count: 4,
            },
          ],
        ]),
      );
    const writeLogSpy = jest
      .spyOn(chatEventLogger, "writeChatEventLog")
      .mockResolvedValue(undefined);
    const server = Object.create(McpServer.prototype) as any;
    server.tools = new Map([["calculator", jest.fn().mockResolvedValue("ok")]]);
    server.toolCallCounts = new Map();
    server.toolCallCountsLoaded = false;
    server.config = {
      getMcpToolStates: jest.fn().mockResolvedValue({
        calculator: true,
      }),
    };

    await expect(server.callTool("calculator", "1+1")).resolves.toBe("ok");
    await expect(server.callTool("calculator", "1+1")).resolves.toBe("ok");

    expect(readLogSpy).toHaveBeenCalledTimes(1);
    expect(writeLogSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mcp_tool_name: "calculator",
        mcp_call_count: 6,
      }),
    );
  });

  it("treats log history load failures as an empty baseline", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(logger, "warn").mockResolvedValue(undefined);
    jest
      .spyOn(chatEventLogger, "readLatestMcpToolEntries")
      .mockRejectedValue(new Error("permission denied"));
    const writeLogSpy = jest
      .spyOn(chatEventLogger, "writeChatEventLog")
      .mockResolvedValue(undefined);
    const server = Object.create(McpServer.prototype) as any;
    server.tools = new Map([["calculator", jest.fn().mockResolvedValue("ok")]]);
    server.toolCallCounts = new Map();
    server.toolCallCountsLoaded = false;
    server.toolCallCountsLoadPromise = null;
    server.config = {
      getMcpToolStates: jest.fn().mockResolvedValue({
        calculator: true,
      }),
    };

    await expect(server.callTool("calculator", "1+1")).resolves.toBe("ok");

    expect(writeLogSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mcp_tool_name: "calculator",
        mcp_call_count: 1,
      }),
    );
  });

  it("rejects non-local browser origins", () => {
    const serverClass = McpServer as any;

    expect(serverClass.isTrustedOrigin(undefined)).toBe(true);
    expect(serverClass.isTrustedOrigin("http://localhost:3000")).toBe(true);
    expect(serverClass.isTrustedOrigin("https://example.com")).toBe(false);
  });
});
