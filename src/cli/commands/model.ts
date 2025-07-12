import { OllamaClient, Model } from '../../ollama/OllamaClient';

export async function listModelsCommand() {
  const client = new OllamaClient();
  console.log('利用可能なOllamaモデル:');
  try {
    const models: Model[] = await client.getModels();
    if (models.length === 0) {
      console.log('  利用可能なモデルがありません。Ollamaが実行されているか、モデルがダウンロードされているか確認してください。');
      return;
    }
    models.forEach(model => {
      console.log(`  - ${model.name} (サイズ: ${(model.size / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
    });
  } catch (error) {
    console.error('モデル一覧の取得中にエラーが発生しました:', error);
  }
}

// モデル選択機能は、現状ではCLIの引数で直接指定する形を想定しているため、
// ここでは具体的な 'use' コマンドの実装は行いません。
// 将来的に設定ファイルなどでの永続化が必要になった際に実装を検討します。
