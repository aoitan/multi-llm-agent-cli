export class ErrorPresenter {
  modelNotFound(model: string, models: string[]): string {
    const candidates = models.length > 0 ? models.join(', ') : '(no models available)';
    return [
      `エラー: モデル '${model}' は存在しません。`,
      `候補: ${candidates}`,
      '次のアクション: `model list` で一覧確認、`model use <name>` で既定モデルを変更。',
    ].join('\n');
  }
}
