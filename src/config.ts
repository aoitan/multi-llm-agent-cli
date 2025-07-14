import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.multi-llm-agent-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface Config {
  defaultModel: string;
}

const defaultConfig: Config = {
  defaultModel: 'llama2', // デフォルトモデル
};

export function getConfig(): Config {
  if (!fs.existsSync(CONFIG_FILE)) {
    return defaultConfig;
  }
  try {
    const configContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...defaultConfig, ...JSON.parse(configContent) };
  } catch (error) {
    console.error('設定ファイルの読み込み中にエラーが発生しました:', error);
    return defaultConfig;
  }
}

export function setConfig(newConfig: Partial<Config>): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const currentConfig = getConfig();
  const updatedConfig = { ...currentConfig, ...newConfig };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2), 'utf-8');
  } catch (error) {
    console.error('設定ファイルの書き込み中にエラーが発生しました:', error);
  }
}
