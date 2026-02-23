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

### `session` コマンド (MVP)

- `session start [session_id]`: セッションを開始します（`--model`, `--max-turns`, `--summary` を指定可能）。
- `session save <session_id>`: セッションの保存時刻を更新し、スナップショットを確定します。
- `session load <session_id>`: 保存済みセッションのモデル/履歴件数/コンテキスト方針を表示します。
- `session end <session_id>`: セッションを終了し、保存データを削除します。
- `session context show|set|clear|summarize <session_id>`:
  - `show`: 現在の保持件数・要約有無・履歴件数を表示
  - `set --max-turns N --summary on|off`: 保持件数/自動要約を設定
  - `clear --keep-turns N`: 履歴を破棄（最新Nターンのみ保持、既存summaryも破棄）
  - `summarize`: 古い履歴を要約して圧縮

### ロール実行モデル (MVP, F-101/F-105)

- `MCP orchestrate/task` 実行時に、論理ロール `coordinator/developer/reviewer/documenter` を単一 Control Node 内で実行します。
- 協調実行:
  - `coordinator` の出力を基に `developer` と `reviewer` を並行実行し、`documenter` が最終応答を生成します。
- 委譲表示:
  - `task_status_update` 通知で `delegatedRole`, `parentTaskId`, `childTaskId`, `durationMs` を確認できます。
- 監査ログ:
  - `event_type=role_delegation` として `parent_task_id`, `child_task_id`, `delegated_role`, `delegated_at`, `result_at`, `failure_reason` を保存します。
  - 停止制御メタデータとして `retry_count`, `loop_trigger`, `loop_threshold`, `loop_recent_history` を保存します。
- 停止制御 (F-105):
  - 再試行上限 (`maxRetriesPerRole`) と再循環上限 (`maxCycleCount`) を超過した場合、自動停止します。
  - 停止時は失敗理由と閾値が通知・監査ログに出力されます。
- 制約 (MVP):
  - リモートAgent常駐やノード間通信は未対応です。
  - 分散ジョブスケジューラや永続キューは未対応です。

## 開発フック

コミット前とプッシュ前に品質チェックを強制するため、Git hookを利用します。

```bash
npm install
npm run hooks:install
```

- `pre-commit`: ステージ済みの `.ts` / `.md` を整形 -> `npm run lint`
- `pre-push`: `npm test`
