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
    const defaultModelPromise = this.config.getDefaultModel();
    const sessionModelPromise = this.sessionStore.getSession
      ? this.sessionStore
          .getSession(input.sessionId)
          .then((session) => session?.model)
      : this.sessionStore.getModel(input.sessionId);

    const [defaultModel, sessionModel] = await Promise.all([
      defaultModelPromise,
      sessionModelPromise,
    ]);

    return resolveModelByPriority({
      cliModel: input.cliModel,
      sessionModel,
      defaultModel,
    });
  }
}
