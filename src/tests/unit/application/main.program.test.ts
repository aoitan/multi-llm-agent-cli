import { createProgram } from "../../../main";
import { RunChatUseCase } from "../../../application/chat/run-chat.usecase";
import * as chatEventLogger from "../../../operations/logging/chat-event-logger";

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
    loadContext: jest
      .fn()
      .mockResolvedValue({
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
});
