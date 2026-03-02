import { createProgram } from "../../../main";
import { RunChatUseCase } from "../../../application/chat/run-chat.usecase";
import * as chatEventLogger from "../../../operations/logging/chat-event-logger";
import { ConfigPort } from "../../../ports/outbound/config.port";

function createMockUseCase() {
  return {
    startSession: jest.fn(),
    runTurn: jest.fn(),
    loadContext: jest.fn(),
    recordTurn: jest.fn(),
    setContextPolicy: jest.fn(),
    saveSession: jest.fn(),
    loadSession: jest.fn(),
    getSession: jest.fn(),
    endSession: jest.fn(),
    clearContext: jest.fn(),
    summarizeContext: jest.fn(),
  } as unknown as RunChatUseCase;
}

function createMockConfig(): ConfigPort {
  return {
    getDefaultModel: jest.fn().mockResolvedValue("test-model"),
    setDefaultModel: jest.fn().mockResolvedValue(undefined),
    getMcpToolStates: jest.fn().mockResolvedValue({
      calculator: true,
      grep: false,
    }),
    setMcpToolEnabled: jest.fn().mockResolvedValue(undefined),
  };
}

describe("F-202 MCP management acceptance", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows readable results for list/enable/disable/status", async () => {
    const config = createMockConfig();
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(chatEventLogger, "readLatestMcpToolEntries").mockResolvedValue(
      new Map([
        [
          "calculator",
          {
            timestamp: "2026-02-28T22:40:00.000Z",
            session_id: "mcp-server",
            event_type: "mcp_tool_call",
            mcp_tool_name: "calculator",
            mcp_success: true,
            mcp_call_count: 2,
          },
        ],
      ]),
    );

    let program = createProgram({
      useCase: createMockUseCase(),
      config,
    });
    await program.parseAsync(["mcp", "list"], { from: "user" });
    expect(logSpy).toHaveBeenCalledWith("MCPツール一覧:");

    program = createProgram({
      useCase: createMockUseCase(),
      config,
    });
    await program.parseAsync(["mcp", "status", "calculator"], { from: "user" });
    expect(logSpy).toHaveBeenCalledWith("tool=calculator");
    expect(logSpy).toHaveBeenCalledWith("status=enabled");
    expect(logSpy).toHaveBeenCalledWith("call_count=2");

    program = createProgram({
      useCase: createMockUseCase(),
      config,
    });
    await program.parseAsync(["mcp", "enable", "grep"], { from: "user" });
    expect(config.setMcpToolEnabled).toHaveBeenCalledWith("grep", true);

    program = createProgram({
      useCase: createMockUseCase(),
      config,
    });
    await program.parseAsync(["mcp", "disable", "calculator"], {
      from: "user",
    });
    expect(config.setMcpToolEnabled).toHaveBeenCalledWith("calculator", false);
  });
});
