import { OllamaClient, Model } from '../../ollama/OllamaClient';
import { setConfig, getConfig } from '../../config';

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

export async function useModelCommand(modelName: string) {
  const client = new OllamaClient();
  try {
    const models = await client.getModels();
    const modelExists = models.some(model => model.name === modelName);

    if (!modelExists) {
      console.error(`エラー: モデル '${modelName}' はOllamaに存在しません。`);
      return;
    }

    setConfig({ defaultModel: modelName });
    console.log(`デフォルトモデルを '${modelName}' に設定しました。`);
  } catch (error) {
    console.error('デフォルトモデルの設定中にエラーが発生しました:', error);
  }
}
