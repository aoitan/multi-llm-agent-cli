import { createProgram } from "../../../main";
import { RunChatUseCase } from "../../../application/chat/run-chat.usecase";

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
    const useCase = {
      startSession: jest.fn().mockResolvedValue({
        ok: true,
        model: "test-model",
        source: "default",
      }),
      runTurn: jest.fn(async function* () {
        yield "ok";
      }),
    } as unknown as RunChatUseCase;

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
});
