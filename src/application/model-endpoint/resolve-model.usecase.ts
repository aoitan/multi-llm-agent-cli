import { resolveModelByPriority } from "../../domain/model-endpoint/services/model-resolution-policy";
import { ConfigPort } from "../../ports/outbound/config.port";
import { SessionStorePort } from "../../ports/outbound/session-store.port";
import { ModelResolutionSource } from "../../shared/types/chat";

export interface ResolveModelInput {
  sessionId: string;
  cliModel?: string;
}

export interface ResolveModelOutput {
  model: string;
  source: ModelResolutionSource;
}

export class ResolveModelUseCase {
  constructor(
    private readonly config: ConfigPort,
    private readonly sessionStore: SessionStorePort,
  ) {}

  async execute(input: ResolveModelInput): Promise<ResolveModelOutput> {
    const [defaultModel, sessionModel] = await Promise.all([
      this.config.getDefaultModel(),
      this.sessionStore.getModel(input.sessionId),
    ]);

    return resolveModelByPriority({
      cliModel: input.cliModel,
      sessionModel,
      defaultModel,
    });
  }
}
