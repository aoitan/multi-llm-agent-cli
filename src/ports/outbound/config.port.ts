export type McpToolStates = Record<string, boolean>;

export interface ConfigPort {
  getDefaultModel(): Promise<string>;
  setDefaultModel(model: string): Promise<void>;
  getMcpToolStates(): Promise<McpToolStates>;
  setMcpToolEnabled(toolName: string, enabled: boolean): Promise<void>;
}
