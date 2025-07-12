import { chatCommand } from './cli/commands/chat';
import { listModelsCommand } from './cli/commands/model';

function showHelp() {
  console.log(`
Usage: multi-llm-agent-cli <command> [options]

Commands:
  chat <prompt> --model <model_name>  : LLMとチャットします。
  model list                          : 利用可能なOllamaモデルを一覧表示します。

Options:
  --help                              : ヘルプを表示します。
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'chat':
      const promptIndex = args.findIndex(arg => !arg.startsWith('--'));
      const prompt = promptIndex !== -1 ? args[promptIndex] : '';
      const modelIndex = args.indexOf('--model');
      const model = modelIndex !== -1 && args[modelIndex + 1] ? args[modelIndex + 1] : 'llama2'; // デフォルトモデル

      if (!prompt) {
        console.error('エラー: チャットプロンプトを指定してください。');
        showHelp();
        process.exit(1);
      }
      await chatCommand(model, prompt);
      break;
    case 'model':
      const subCommand = args[1];
      if (subCommand === 'list') {
        await listModelsCommand();
      } else {
        console.error('エラー: 不明なモデルコマンドです。');
        showHelp();
        process.exit(1);
      }
      break;
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;
    default:
      console.error(`エラー: 不明なコマンド '${command}' です。`);
      showHelp();
      process.exit(1);
  }
}

main();
