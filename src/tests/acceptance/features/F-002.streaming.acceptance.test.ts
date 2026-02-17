import { runChatCommand } from "../../../interaction/cli/commands/chat.command";
import { RunChatUseCase } from "../../../application/chat/run-chat.usecase";

function createMockUseCase() {
  return {
    startSession: jest.fn().mockResolvedValue({
      ok: true,
      model: "stream-model",
      source: "default",
    }),
    runTurn: jest.fn(async function* () {
      yield "first";
      yield "-second";
      yield "-third";
    }),
  } as unknown as RunChatUseCase;
}

describe("F-002 Streaming UX acceptance", () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    writeSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows running/completed markers and streams chunks in order without duplication", async () => {
    const useCase = createMockUseCase();

    await runChatCommand(
      { prompt: "hello stream" },
      { useCase, createSessionId: () => "session-f002" },
    );

    expect(writeSpy.mock.calls).toEqual([
      ["AI: "],
      ["first"],
      ["-second"],
      ["-third"],
      ["\n"],
    ]);
    expect(logSpy).toHaveBeenCalledWith("Generating...");
    expect(logSpy).toHaveBeenCalledWith("Done.");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
