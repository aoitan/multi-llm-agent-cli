import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigPort } from '../../ports/outbound/config.port';

interface StoredConfig {
  defaultModel?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.multi-llm-agent-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export class FileConfigAdapter implements ConfigPort {
  constructor(private readonly fallbackModel: string = 'llama2') {}

  async getDefaultModel(): Promise<string> {
    const envModel = process.env.DEFAULT_MODEL?.trim();
    if (envModel) {
      return envModel;
    }

    const data = this.readConfig();
    return data.defaultModel?.trim() || this.fallbackModel;
  }

  async setDefaultModel(model: string): Promise<void> {
    const current = this.readConfig();
    const next: StoredConfig = {
      ...current,
      defaultModel: model,
    };

    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8');
  }

  private readConfig(): StoredConfig {
    try {
      if (!fs.existsSync(CONFIG_FILE)) {
        return {};
      }

      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(raw) as StoredConfig;
    } catch {
      return {};
    }
  }
}
