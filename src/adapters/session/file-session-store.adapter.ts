import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionStorePort } from '../../ports/outbound/session-store.port';

interface SessionConfig {
  models?: Record<string, string>;
}

const CONFIG_DIR = path.join(os.homedir(), '.multi-llm-agent-cli');
const SESSION_FILE = path.join(CONFIG_DIR, 'session.json');

export class FileSessionStoreAdapter implements SessionStorePort {
  async getModel(sessionId: string): Promise<string | undefined> {
    const config = await this.readConfig();
    return config.models?.[sessionId];
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    const config = await this.readConfig();
    const models = config.models ?? {};
    models[sessionId] = model;

    await fsp.mkdir(CONFIG_DIR, { recursive: true });
    await fsp.writeFile(
      SESSION_FILE,
      JSON.stringify({ ...config, models }, null, 2),
      'utf-8',
    );
  }

  private async readConfig(): Promise<SessionConfig> {
    try {
      if (!fs.existsSync(SESSION_FILE)) {
        return {};
      }

      const raw = await fsp.readFile(SESSION_FILE, 'utf-8');
      return JSON.parse(raw) as SessionConfig;
    } catch {
      return {};
    }
  }
}
