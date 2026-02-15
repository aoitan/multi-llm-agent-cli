import { ResolveModelUseCase } from "../model-endpoint/resolve-model.usecase";
import { LlmClientPort } from "../../ports/outbound/llm-client.port";
import { SessionStorePort } from "../../ports/outbound/session-store.port";
import { ChatMessage, ModelResolutionSource } from "../../shared/types/chat";

export interface ChatSessionStartInput {
  sessionId: string;
  cliModel?: string;
}

export interface ChatSessionStartSuccess {
  ok: true;
  model: string;
  source: ModelResolutionSource;
}

export interface ChatSessionStartFailure {
  ok: false;
  code: "MODEL_NOT_FOUND";
  model: string;
  candidates: string[];
}

export type ChatSessionStartResult =
  | ChatSessionStartSuccess
  | ChatSessionStartFailure;

export class RunChatUseCase {
  constructor(
    private readonly resolver: ResolveModelUseCase,
    private readonly llmClient: LlmClientPort,
    private readonly sessionStore: SessionStorePort,
  ) {}

  async startSession(
    input: ChatSessionStartInput,
  ): Promise<ChatSessionStartResult> {
    const resolved = await this.resolver.execute({
      sessionId: input.sessionId,
      cliModel: input.cliModel,
    });

    const availableModels = await this.llmClient.listModels();
    const availableModelNames = availableModels.map((m) => m.name);
    if (!availableModelNames.includes(resolved.model)) {
      return {
        ok: false,
        code: "MODEL_NOT_FOUND",
        model: resolved.model,
        candidates: availableModelNames,
      };
    }

    await this.sessionStore.setModel(input.sessionId, resolved.model);
    return {
      ok: true,
      model: resolved.model,
      source: resolved.source,
    };
  }

  async *runTurn(
    model: string,
    messages: ChatMessage[],
  ): AsyncGenerator<string> {
    for await (const chunk of this.llmClient.chat(model, messages)) {
      if (chunk.content) {
        yield chunk.content;
      }
      if (chunk.done) {
        return;
      }
    }
  }
}
