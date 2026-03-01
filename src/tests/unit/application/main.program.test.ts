import { createProgram } from "../../../main";
import { RunChatUseCase } from "../../../application/chat/run-chat.usecase";
import * as chatEventLogger from "../../../operations/logging/chat-event-logger";
import { ConfigPort } from "../../../ports/outbound/config.port";

function createMockUseCase() {
  return {
    startSession: jest.fn().mockResolvedValue({
      ok: true,
      model: "test-model",
      source: "default",
    }),
    runTurn: jest.fn(async function* () {
      yield "ok";
    }),
    loadContext: jest.fn().mockResolvedValue({
      messages: [],
      policy: { maxTurns: 10, summaryEnabled: false },
    }),
    recordTurn: jest.fn().mockResolvedValue(undefined),
    setContextPolicy: jest.fn().mockResolvedValue({
      policy: { maxTurns: 5, summaryEnabled: true },
    }),
    saveSession: jest
      .fn()
      .mockResolvedValue({ savedAt: "2026-01-01T00:00:00.000Z" }),
    loadSession: jest.fn().mockResolvedValue({
      restoredMessageCount: 2,
      restoredSummary: true,
      session: {
        model: "test-model",
        messages: [
          { role: "user", content: "u1" },
          { role: "assistant", content: "a1" },
        ],
        summary: "sum",
        policy: { maxTurns: 10, summaryEnabled: false },
        loadedAt: "2026-01-01T00:00:01.000Z",
        updatedAt: "2026-01-01T00:00:01.000Z",
      },
    }),
    getSession: jest.fn().mockResolvedValue({
      model: "test-model",
      messages: [],
      policy: { maxTurns: 10, summaryEnabled: false },
    }),
    endSession: jest.fn().mockResolvedValue(undefined),
    clearContext: jest.fn().mockResolvedValue({ messages: [] }),
    summarizeContext: jest
      .fn()
      .mockResolvedValue({ messages: [], summary: "s" }),
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

describe("createProgram", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers model subcommands without duplicate command error", () => {
    const program = createProgram();
    const model = program.commands.find((cmd) => cmd.name() === "model");

    expect(model).toBeDefined();
    expect(model?.commands.map((cmd) => cmd.name())).toEqual(
      expect.arrayContaining(["list", "use"]),
    );
  });

  it("passes sessionId to chat command input", async () => {
    const useCase = createMockUseCase();

    const program = createProgram({ useCase });
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(["chat", "--session-id", "s-001", "hello"], {
      from: "user",
    });

    expect((useCase as any).startSession).toHaveBeenCalledWith({
      sessionId: "s-001",
      cliModel: undefined,
    });
  });

  it("creates a new session id when --session-id is omitted", async () => {
    const useCase = createMockUseCase();

    const program = createProgram({ useCase });
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync(["chat", "hello"], { from: "user" });

    expect((useCase as any).startSession).toHaveBeenCalledWith({
      sessionId: expect.stringMatching(/^session-[0-9a-f-]{36}$/),
      cliModel: undefined,
    });
  });

  it("registers and executes session start command", async () => {
    const useCase = createMockUseCase();
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    const program = createProgram({ useCase });
    await program.parseAsync(
      ["session", "start", "s-001", "--max-turns", "5", "--summary"],
      { from: "user" },
    );

    expect((useCase as any).startSession).toHaveBeenCalledWith({
      sessionId: "s-001",
      cliModel: undefined,
    });
    expect((useCase as any).setContextPolicy).toHaveBeenCalledWith("s-001", {
      maxTurns: 5,
      summaryEnabled: true,
    });
    expect(logSpy).toHaveBeenCalledWith("セッションを開始しました: s-001");
  });

  it("registers and executes session load command with restoration summary", async () => {
    const useCase = createMockUseCase();
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    const program = createProgram({ useCase });
    await program.parseAsync(["session", "load", "s-001"], {
      from: "user",
    });

    expect((useCase as any).loadSession).toHaveBeenCalledWith("s-001");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("セッションを読み込みました: s-001"),
    );
    expect(logSpy).toHaveBeenCalledWith("restored_messages=2");
    expect(logSpy).toHaveBeenCalledWith("restored_summary=yes");
  });

  it("writes session operation events when --log-events is enabled", async () => {
    const useCase = createMockUseCase();
    const writeLogSpy = jest
      .spyOn(chatEventLogger, "writeChatEventLog")
      .mockResolvedValue(undefined);
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    const program = createProgram({ useCase });
    await program.parseAsync(["session", "save", "s-001", "--log-events"], {
      from: "user",
    });

    expect(writeLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: "s-001",
        event_type: "session_save",
      }),
    );
  });

  it("registers mcp subcommands without duplicate command error", () => {
    const program = createProgram();
    const mcp = program.commands.find((cmd) => cmd.name() === "mcp");

    expect(mcp).toBeDefined();
    expect(mcp?.commands.map((cmd) => cmd.name())).toEqual(
      expect.arrayContaining(["list", "enable", "disable", "status"]),
    );
  });

  it("lists MCP tools and their status", async () => {
    const useCase = createMockUseCase();
    const config = createMockConfig();
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest
      .spyOn(chatEventLogger, "readLatestMcpToolEntries")
      .mockResolvedValue(new Map());

    const program = createProgram({ useCase, config });
    await program.parseAsync(["mcp", "list"], {
      from: "user",
    });

    expect(config.getMcpToolStates).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("MCPツール一覧:");
    expect(logSpy).toHaveBeenCalledWith("  - calculator: enabled");
    expect(logSpy).toHaveBeenCalledWith("  - grep: disabled");
  });

  it("includes built-in MCP tools even when config has no explicit state", async () => {
    const useCase = createMockUseCase();
    const config: ConfigPort = {
      getDefaultModel: jest.fn().mockResolvedValue("test-model"),
      setDefaultModel: jest.fn().mockResolvedValue(undefined),
      getMcpToolStates: jest.fn().mockResolvedValue({}),
      setMcpToolEnabled: jest.fn().mockResolvedValue(undefined),
    };
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest
      .spyOn(chatEventLogger, "readLatestMcpToolEntries")
      .mockResolvedValue(new Map());

    const program = createProgram({ useCase, config });
    await program.parseAsync(["mcp", "list"], { from: "user" });

    expect(logSpy).toHaveBeenCalledWith("  - calculator: enabled");
  });

  it("shows recent MCP usage metadata in status output", async () => {
    const useCase = createMockUseCase();
    const config = createMockConfig();
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(chatEventLogger, "readLatestMcpToolEntries").mockResolvedValue(
      new Map([
        [
          "calculator",
          {
            timestamp: "2026-02-28T22:30:00.000Z",
            session_id: "mcp-server",
            event_type: "mcp_tool_call",
            mcp_tool_name: "calculator",
            mcp_success: true,
            mcp_call_count: 3,
          },
        ],
      ]),
    );

    const program = createProgram({ useCase, config });
    await program.parseAsync(["mcp", "status", "calculator"], {
      from: "user",
    });

    expect(logSpy).toHaveBeenCalledWith("tool=calculator");
    expect(logSpy).toHaveBeenCalledWith("status=enabled");
    expect(logSpy).toHaveBeenCalledWith("call_count=3");
    expect(logSpy).toHaveBeenCalledWith("last_success=yes");
    expect(logSpy).toHaveBeenCalledWith(
      "last_called_at=2026-02-28T22:30:00.000Z",
    );
  });

  it("rejects unknown MCP tools for status changes", async () => {
    const useCase = createMockUseCase();
    const config: ConfigPort = {
      getDefaultModel: jest.fn().mockResolvedValue("test-model"),
      setDefaultModel: jest.fn().mockResolvedValue(undefined),
      getMcpToolStates: jest.fn().mockResolvedValue({}),
      setMcpToolEnabled: jest.fn().mockResolvedValue(undefined),
    };
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest
      .spyOn(chatEventLogger, "readLatestMcpToolEntries")
      .mockResolvedValue(new Map());

    const program = createProgram({ useCase, config });
    await program.parseAsync(["mcp", "enable", "unknown-tool"], {
      from: "user",
    });

    expect(config.setMcpToolEnabled).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "MCPツールの有効化に失敗しました: Tool not found: unknown-tool",
    );
  });

  it("still enables an MCP tool when log history cannot be read", async () => {
    const useCase = createMockUseCase();
    const config = createMockConfig();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest
      .spyOn(chatEventLogger, "readLatestMcpToolEntries")
      .mockRejectedValue(new Error("permission denied"));

    const program = createProgram({ useCase, config });
    await program.parseAsync(["mcp", "enable", "grep"], {
      from: "user",
    });

    expect(config.setMcpToolEnabled).toHaveBeenCalledWith("grep", true);
  });

  it("updates MCP tool status with enable and disable commands", async () => {
    const useCase = createMockUseCase();
    const config = createMockConfig();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    const writeLogSpy = jest
      .spyOn(chatEventLogger, "writeChatEventLog")
      .mockResolvedValue(undefined);
    jest
      .spyOn(chatEventLogger, "readLatestMcpToolEntries")
      .mockResolvedValue(new Map());

    let program = createProgram({ useCase, config });
    await program.parseAsync(["mcp", "enable", "grep"], {
      from: "user",
    });

    expect(config.setMcpToolEnabled).toHaveBeenCalledWith("grep", true);
    expect(writeLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "mcp_tool_state_change",
        mcp_tool_name: "grep",
        mcp_previous_enabled: false,
        mcp_enabled: true,
      }),
    );

    program = createProgram({ useCase, config });
    await program.parseAsync(["mcp", "disable", "calculator"], {
      from: "user",
    });

    expect(config.setMcpToolEnabled).toHaveBeenCalledWith("calculator", false);
  });
});
