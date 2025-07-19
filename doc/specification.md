# 仕様書

## 概要

本プロジェクトは、OllamaのAPIを活用し、複数のLLMとの対話をコマンドラインからシームレスに行うためのツールを開発します。ユーザーはOllama Librariesで提供される多様なモデルを自由に選択し、対話を通じてコンテキストを管理できます。将来的には、複数のOllamaエンドポイントをオーケストレーションし、指示者LLMと作業者LLMによる協調作業を実現することを目指します。

## 機能要件

### 1. Ollama APIとの連携
- Ollama APIを通じてLLMとチャットを行う機能
- Ollama Librariesにある任意のモデルを利用できる機能

### 2. 基本的なCLIインターフェース
- コマンドラインからの入力受付とLLM応答の表示
- モデル選択機能

### 3. コンテキスト管理
- LLMとの会話からコンテキストを管理する機能
    - コンテキストの記憶、破棄、要約の仕組み
- コンテキスト管理の戦略（例: 過去Nターンの会話を保持、特定のキーワードを含む会話を保持など）

### 4. MCP (Model Context Protocol)
- MCPサーバーとLLM、ユーザーの仲立ちを行うMCPクライアント機能

### 5. 複数Ollamaエンドポイント対応
- 複数のOllamaエンドポイントを登録・切り替えできる機能
- 複数エンドポイントのオーケストレーション（初期はラウンドロビン）

### 6. 高度なオーケストレーション
- 指示者LLMと作業者LLMを設定し、協調作業させる機能（将来的な展望）

### 7. プラグイン/拡張機能
- 外部ツール連携やカスタム機能を追加できるプラグイン機構

## 非機能要件

### 1. エラーハンドリングと堅牢性
- APIエラー、ネットワークエラーなどに対する適切なエラーハンドリング

### 2. パフォーマンス最適化
- レスポンス速度の向上、リソース使用量の最適化

## アーキテクチャ

### 全体構成
- **CLIアプリケーション**: ユーザーインターフェースとして機能し、OllamaClientを通じてOllama APIと通信。
- **MCPサーバー**: MCPクライアントからのリクエストを受け取り、Ollama APIを通じてLLMと対話し、応答をクライアントに返すハブ。
- **OllamaClient**: Ollama APIとの通信を抽象化するクラス。
- **Ollama API Server**: 実際のLLMを提供するOllamaのバックエンド。

### 高度なオーケストレーション
- **指示者LLM (Orchestrator LLM)**: ユーザーからの要求を理解し、タスクを分解。分解されたタスクを作業者LLMに割り当て、結果を統合し最終応答を生成。
- **作業者LLM (Worker LLM)**: 指示者LLMから割り当てられた特定のサブタスクを実行し、結果を報告。必要に応じて外部ツールを使用。
- **連携プロトコル**: 指示者LLMと作業者LLM間のコミュニケーションには、MCPを拡張したプロトコル（`assign_task`, `task_result`など）を使用。
- **ワークフロー管理**: MCPサーバーがオーケストレーションのハブとなり、LLM間のメッセージングを仲介し、タスクの状態を追跡。

### モジュール構成
- `src/index.ts`: CLIのエントリポイント。`commander.js` の設定、コマンドのルーティング。
- `src/cli/commands/chat.ts`: `chat` コマンドのロジック。`OllamaClient` を利用。
- `src/cli/commands/model.ts`: `model list` コマンドのロジック。`OllamaClient` を利用。
- `src/ollama/OllamaClient.ts`: Ollama APIとの通信を抽象化するクラス。
- `src/mcp/McpClient.ts`: MCPサーバーとの通信を抽象化するクラス。
- `src/mcp/McpServer.ts`: MCPサーバーの実装。

## データモデル

### エンドポイントのデータ構造
- `name`: エンドポイントを識別するための一意な名前
- `url`: Ollama APIのエンドポイントURL

### チャットリクエスト (部分)
```typescript
interface ChatRequest {
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  stream?: boolean; // ストリーミング応答を有効にするか
}
```

### チャットレスポンス (ストリーミング時の各チャンク)
```typescript
interface ChatResponseChunk {
  model: string;
  created_at: string;
  message?: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
  // その他のプロパティ (total_duration, load_durationなど)
}
```

### モデル一覧レスポンス
```typescript
interface ModelsResponse {
  models: Array<{
    name: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
      parent_model: string;
      format: string;
      family: string;
      families: string[];
      parameter_size: string;
      quantization_level: string;
    };
  }>;
}
```

## API仕様

### Ollama APIエンドポイント
- **チャット**: `POST /api/chat`
- **モデル一覧**: `GET /api/tags`

### MCP (Model Context Protocol)
- **通信モデル**: WebSocketを使用し、JSON-RPC 2.0プロトコルを実装。
- **メッセージ構造**: JSON-RPC 2.0の仕様に従う（リクエスト、レスポンス、エラー、通知）。
- **主要なメソッドと通知**:
    - クライアント -> サーバー: `initialize`, `roots/list`, `textDocument/didOpen`, `textDocument/didChange`, `textDocument/didClose`
    - サーバー -> クライアント: `initialized`, `notifications/roots/list_changed`

## UI/UX

### CLIインターフェース
- `multi-llm-agent-cli chat <prompt> [options]`
    - `<prompt>`: ユーザーの入力プロンプト。
    - `--model <model_name>`: 使用するOllamaモデルを指定。
- `multi-llm-agent-cli model list`: 利用可能なOllamaモデルを一覧表示。
- `multi-llm-agent-cli endpoint add <name> <url>`: 新しいOllamaエンドポイントを登録。
- `multi-llm-agent-cli endpoint remove <name>`: 登録済みのOllamaエンドポイントを削除。
- `multi-llm-agent-cli endpoint use <name>`: デフォルトで使用するOllamaエンドポイントを切り替え。
- `multi-llm-agent-cli endpoint list`: 登録済みのOllamaエンドポイントを一覧表示。
- `multi-llm-agent-cli --help` / `-h`: ヘルプメッセージを表示。

### 対話モード
- `multi-llm-agent-cli chat` コマンドでプロンプトが指定されない場合、対話モードに移行。
- `readline` モジュールを使用して、ユーザーからの入力を継続的に受け付ける。
- `/exit` または `/quit` で対話モードを終了。

### LLM応答の整形と表示
- `OllamaClient` からのストリーミング応答を `process.stdout.write` を使用してリアルタイムでコンソールに出力。
- 初期実装では、受信したテキストをそのまま表示。

## セキュリティ

### プラグインのサンドボックス化
- プラグインがシステム全体に無制限にアクセスできないよう、サンドボックス環境での実行を検討。
- 権限管理: 各プラグインが必要とする権限を明示的に宣言し、ユーザーがその権限を承認する仕組みを検討。

## 運用・保守

### エラーハンドリング
- **エラーの捕捉と伝播**: 各モジュールや関数で発生する可能性のあるエラーを適切に捕捉し、適切なレベルまで伝播。
- **ユーザーへの通知**: ユーザーにエラーが発生したことを明確に伝え、解決策を提示。
- **リトライとフォールバック**: 一時的なネットワークエラーなどに対して、自動リトライや他のエンドポイントへのフォールバックを検討。
- **堅牢性の向上**: 入力値の検証、デフォルト値と安全な操作、リソースの解放を徹底。

### ログ出力
- すべてのエラーは、詳細なスタックトレースや関連情報とともにログに出力。
- ログレベル（DEBUG, INFO, WARN, ERROR, FATAL）を適切に使い分け。

## テスト
- ユーザー向けドキュメントの整備
- 単体テスト、結合テストの拡充

### パフォーマンス分析とボトルネック特定
- **プロファイリングツールの選定**: `Node.js Inspector`、`clinic.js`、`perf_hooks`などを検討。
- **メトリクスの収集**: レスポンスタイム、CPU使用率、メモリ使用量、ネットワークI/Oなどを収集。
- **ボトルネックの特定**: 収集したメトリクスを分析し、パフォーマンスのボトルネックを特定。

### LLM対話の最適化
- **Ollama API呼び出しの最適化**: キャッシュ、並列処理、ストリーミングの最適化。
- **リソース使用量の最適化**: メモリ使用量の削減、CPU使用率の最適化。
- **ネットワーク通信の最適化**: HTTP/2の利用、接続の再利用、データ転送量の削減。
