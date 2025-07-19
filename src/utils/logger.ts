import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const LOG_DIR = path.join(os.homedir(), '.multi-llm-agent-cli', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

async function log(level: LogLevel, message: string, ...args: any[]) {
  if (!fs.existsSync(LOG_DIR)) {
    await fsp.mkdir(LOG_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  await fsp.appendFile(LOG_FILE, logMessage + '\n');

  // コンソールにも出力 (ERRORレベルは常に、その他は開発時のみなど調整可能)
  if (level === LogLevel.ERROR || process.env.NODE_ENV !== 'production') {
    console.log(logMessage, ...args);
  }
}

export const logger = {
  debug: async (message: string, ...args: any[]) => await log(LogLevel.DEBUG, message, ...args),
  info: async (message: string, ...args: any[]) => await log(LogLevel.INFO, message, ...args),
  warn: async (message: string, ...args: any[]) => await log(LogLevel.WARN, message, ...args),
  error: async (message: string, ...args: any[]) => await log(LogLevel.ERROR, message, ...args),
};
