export interface ConfigPort {
  getDefaultModel(): Promise<string>;
  setDefaultModel(model: string): Promise<void>;
}
