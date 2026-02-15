import { ModelResolutionSource } from "../../../shared/types/chat";

export interface ModelResolutionInput {
  cliModel?: string;
  sessionModel?: string;
  defaultModel: string;
}

export interface ModelResolutionResult {
  model: string;
  source: ModelResolutionSource;
}

export function resolveModelByPriority(
  input: ModelResolutionInput,
): ModelResolutionResult {
  if (input.cliModel && input.cliModel.trim().length > 0) {
    return { model: input.cliModel.trim(), source: "cli" };
  }

  if (input.sessionModel && input.sessionModel.trim().length > 0) {
    return { model: input.sessionModel.trim(), source: "session" };
  }

  const defaultModel = input.defaultModel.trim();
  if (!defaultModel) {
    throw new Error("Model resolution failed: defaultModel is empty.");
  }

  return { model: defaultModel, source: "default" };
}
