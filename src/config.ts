import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.multi-llm-agent-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface Endpoint {
  name: string;
  url: string;
}

interface Config {
  defaultModel: string;
  endpoints: Endpoint[];
  currentEndpoint: string;
}

const defaultConfig: Config = {
  defaultModel: 'llama2',
  endpoints: [{ name: 'default', url: 'http://localhost:11434' }],
  currentEndpoint: 'default',
};

export function getConfig(): Config {
  if (!fs.existsSync(CONFIG_FILE)) {
    return defaultConfig;
  }
  try {
    const configContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsedConfig = JSON.parse(configContent);
    return { ...defaultConfig, ...parsedConfig, endpoints: parsedConfig.endpoints || defaultConfig.endpoints };
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

export function addEndpoint(name: string, url: string): void {
  const config = getConfig();
  if (config.endpoints.some(ep => ep.name === name)) {
    console.error(`エラー: エンドポイント '${name}' は既に存在します。`);
    return;
  }
  config.endpoints.push({ name, url });
  setConfig({ endpoints: config.endpoints });
  console.log(`エンドポイント '${name}' (${url}) を追加しました。`);
}

export function removeEndpoint(name: string): void {
  const config = getConfig();
  if (!config.endpoints.some(ep => ep.name === name)) {
    console.error(`エラー: エンドポイント '${name}' は存在しません。`);
    return;
  }
  if (config.currentEndpoint === name) {
    console.error(`エラー: 現在使用中のエンドポイント '${name}' は削除できません。`);
    return;
  }
  config.endpoints = config.endpoints.filter(ep => ep.name !== name);
  setConfig({ endpoints: config.endpoints });
  console.log(`エンドポイント '${name}' を削除しました。`);
}

export function setCurrentEndpoint(name: string): void {
  const config = getConfig();
  if (!config.endpoints.some(ep => ep.name === name)) {
    console.error(`エラー: エンドポイント '${name}' は存在しません。`);
    return;
  }
  setConfig({ currentEndpoint: name });
  console.log(`現在のエンドポイントを '${name}' に設定しました。`);
}

export function getCurrentEndpoint(): Endpoint {
  const config = getConfig();
  const endpoint = config.endpoints.find(ep => ep.name === config.currentEndpoint);
  if (!endpoint) {
    // This should ideally not happen if currentEndpoint is always valid
    console.error(`エラー: 現在のエンドポイント '${config.currentEndpoint}' が見つかりません。デフォルトを使用します。`);
    return defaultConfig.endpoints[0];
  }
  return endpoint;
}

export function listEndpoints(): Endpoint[] {
  return getConfig().endpoints;
}
