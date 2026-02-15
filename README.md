# multi-llm-agent-cli

Ollamaを通じて様々なLLMを利用できるコマンドラインツールです。

## 概要

本プロジェクトは、OllamaのAPIを活用し、複数のLLMとの対話をコマンドラインからシームレスに行うためのツールを開発します。ユーザーはOllama Librariesで提供される多様なモデルを自由に選択し、対話を通じてコンテキストを管理できます。将来的には、複数のOllamaエンドポイントをオーケストレーションし、指示者LLMと作業者LLMによる協調作業を実現することを目指します。

## 特徴

- **Ollama連携**: Ollama APIを通じてLLMとのチャットが可能。
- **モデル選択**: Ollama Librariesにある任意のモデルを簡単に利用。
- **コンテキスト管理**: LLMとの会話履歴を適切に管理し、効率的な対話を実現。
- **複数エンドポイント対応**: 複数のOllamaエンドポイントを登録・切り替え、オーケストレーション可能。
- **MCP (Model Context Protocol)**: LLMとユーザーの仲立ちを行うプロトコルを実装予定。

## 開発ロードマップ

詳細な開発ロードマップは `doc/roadmap.md` を参照してください。

## 使い方 (開発中)

```bash
# インストール (予定)
npm install -g multi-llm-agent-cli

# チャット開始 (予定)
multi-llm-agent-cli chat

# モデル切り替え (予定)
multi-llm-agent-cli use <model_name>
```

### `chat`オプション (MVP)

- `-s, --session-id <session_id>`: セッションIDを明示指定。未指定の場合は実行ごとに新規セッションIDが生成されます。
- `--log-events`: チャットイベントログをローカル保存します（デフォルト無効）。
  - 保存時は `user_input` / `assistant_response` の機密情報をマスクします。
  - ログはローテーションされ、権限は所有者限定に設定されます。

## 開発フック

コミット前とプッシュ前に品質チェックを強制するため、Git hookを利用します。

```bash
npm install
npm run hooks:install
```

- `pre-commit`: ステージ済みの `.ts` / `.md` を整形 -> `npm run lint`
- `pre-push`: `npm test`
