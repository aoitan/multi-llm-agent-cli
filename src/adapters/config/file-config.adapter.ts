import * as fs from "fs";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { ConfigPort } from "../../ports/outbound/config.port";

interface StoredConfig {
  defaultModel?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".multi-llm-agent-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export class FileConfigAdapter implements ConfigPort {
  constructor(private readonly fallbackModel: string = "llama2") {}

  async getDefaultModel(): Promise<string> {
    const envModel = process.env.DEFAULT_MODEL?.trim();
    if (envModel) {
      return envModel;
    }

    const data = await this.readConfig();
    return data.defaultModel?.trim() || this.fallbackModel;
  }

  async setDefaultModel(model: string): Promise<void> {
    const current = await this.readConfig();
    const next: StoredConfig = {
      ...current,
      defaultModel: model,
    };

    await fsp.mkdir(CONFIG_DIR, { recursive: true });
    await fsp.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), "utf-8");
  }

  private async readConfig(): Promise<StoredConfig> {
    try {
      if (!fs.existsSync(CONFIG_FILE)) {
        return {};
      }

      const raw = await fsp.readFile(CONFIG_FILE, "utf-8");
      return JSON.parse(raw) as StoredConfig;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      console.error("設定ファイルの読み込みに失敗しました:", error);
      return {};
    }
  }
}
