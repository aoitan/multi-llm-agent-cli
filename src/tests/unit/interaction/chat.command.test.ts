import * as readline from "readline";
import { runChatCommand } from "../../../interaction/cli/commands/chat.command";
import { RunChatUseCase } from "../../../application/chat/run-chat.usecase";

type Handler = (line?: string) => void;
type Message = { role: string; content: string };

interface MockInterface {
  on: jest.MockedFunction<(event: string, handler: Handler) => MockInterface>;
  prompt: jest.MockedFunction<() => void>;
  close: jest.MockedFunction<() => void>;
}

const handlers: Record<string, Handler> = {};
const mockInterface: MockInterface = {
  on: jest.fn((event: string, handler: Handler) => {
    handlers[event] = handler;
    return mockInterface;
  }),
  prompt: jest.fn(),
  close: jest.fn(() => {
    if (handlers.close) {
      handlers.close();
    }
  }),
};

jest.mock("readline", () => ({
  createInterface: jest.fn(() => mockInterface),
}));

describe("chat.command interaction serialization", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Object.keys(handlers).forEach((k) => delete handlers[k]);
    mockInterface.on.mockClear();
    mockInterface.prompt.mockClear();
    mockInterface.close.mockClear();
  });

  it("serializes interactive turns and avoids concurrent runTurn execution", async () => {
    let resolveFirstTurn: (() => void) | undefined;
    const firstTurnGate = new Promise<void>((resolve) => {
      resolveFirstTurn = resolve;
    });

    const runTurn = jest.fn(async function* (
      _model: string,
      messages: Message[],
    ) {
      const userMessages = messages.filter((m) => m.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1]?.content;
      if (lastUserMessage === "first") {
        await firstTurnGate;
        yield "first-response";
        return;
      }

      yield "second-response";
    });

    const storedMessages: Message[] = [];
    const useCase = {
      startSession: jest.fn().mockResolvedValue({
        ok: true,
        model: "test-model",
        source: "default",
      }),
      loadContext: jest.fn(async () => ({
        messages: [...storedMessages],
        policy: { maxTurns: 10, summaryEnabled: false },
      })),
      recordTurn: jest.fn(
        async (_sid: string, user: string, assistant: string) => {
          storedMessages.push({ role: "user", content: user });
          storedMessages.push({ role: "assistant", content: assistant });
        },
      ),
      runTurn,
    } as unknown as RunChatUseCase;

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runChatCommand(
      {},
      {
        useCase,
        createSessionId: () => "session-1",
        logEvent: jest.fn().mockResolvedValue(undefined),
      },
    );

    handlers.line("first");
    handlers.line("second");

    await Promise.resolve();
    await Promise.resolve();

    expect(runTurn).toHaveBeenCalledTimes(1);

    resolveFirstTurn?.();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(runTurn).toHaveBeenCalledTimes(2);

    const secondCallMessages = runTurn.mock.calls[1][1] as Message[];
    expect(secondCallMessages).toEqual(
      expect.arrayContaining([
        { role: "user", content: "first" },
        { role: "assistant", content: "first-response" },
        { role: "user", content: "second" },
      ]),
    );
  });

  it("prints running and completed status for each turn", async () => {
    const useCase = {
      startSession: jest.fn().mockResolvedValue({
        ok: true,
        model: "test-model",
        source: "default",
      }),
      loadContext: jest
        .fn()
        .mockResolvedValue({
          messages: [],
          policy: { maxTurns: 10, summaryEnabled: false },
        }),
      recordTurn: jest.fn().mockResolvedValue(undefined),
      runTurn: jest.fn(async function* () {
        yield "chunk-1";
        yield "chunk-2";
      }),
    } as unknown as RunChatUseCase;

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runChatCommand(
      { prompt: "hello" },
      {
        useCase,
        createSessionId: () => "session-1",
        logEvent: jest.fn().mockResolvedValue(undefined),
      },
    );

    expect(logSpy).toHaveBeenCalledWith("Generating...");
    expect(logSpy).toHaveBeenCalledWith("Done.");
  });
});
