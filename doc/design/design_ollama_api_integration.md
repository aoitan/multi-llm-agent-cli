# Ollama API連携機能 設計ドキュメント

## 1. 目的

本ドキュメントは、Ollama APIを通じてLLMとのチャット機能およびOllama Librariesにあるモデル利用機能を実現するための設計を記述する。

## 2. スコープ

- Ollama APIクライアントの実装（または選定と利用方法の定義）
- チャットリクエストの送信とレスポンスの受信
- 利用可能なモデルの一覧取得
- モデル選択機能のAPI連携部分

## 3. 技術スタック

- 言語: TypeScript
- ランタイム: Node.js

## 4. Ollama APIクライアントの選定/実装

Ollama APIとの通信には、既存のTypeScript/Node.js向けOllamaクライアントライブラリの利用を検討する。
候補:
- `ollama` (公式またはコミュニティ製のnpmパッケージ)

選定基準:
- 活発なメンテナンス状況
- ドキュメントの充実度
- 型定義の有無 (TypeScriptとの親和性)
- ストリーミングAPIへの対応 (チャット応答のリアルタイム表示のため)

もし適切なライブラリが見つからない場合、または要件に合致しない場合は、`node-fetch` などのHTTPクライアントライブラリを用いて自作する。

## 5. APIエンドポイント

Ollama APIの主要なエンドポイントは以下の通り。

- **チャット**: `POST /api/chat`
    - リクエストボディ: `{"model": "...", "messages": [...], "stream": true}`
    - レスポンス: ストリーミング形式のJSONオブジェクト
- **モデル一覧**: `GET /api/tags`
    - レスポンス: `{"models": [...]}`

## 6. データ構造

### 6.1. チャットリクエスト (部分)

```typescript
interface ChatRequest {
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  stream?: boolean; // ストリーミング応答を有効にするか
}
```

### 6.2. チャットレスポンス (ストリーミング時の各チャンク)

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

### 6.3. モデル一覧レスポンス

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

## 7. モジュール構成

`src/` ディレクトリ配下に以下のモジュールを配置する。

- `src/ollama/OllamaClient.ts`: Ollama APIとの通信を抽象化するクラス。
- `src/cli/commands/chat.ts`: CLIのチャットコマンドの実装。`OllamaClient` を利用。
- `src/cli/commands/model.ts`: CLIのモデル関連コマンド（一覧表示、選択）の実装。`OllamaClient` を利用。

### `OllamaClient` クラスの責務

- Ollama APIエンドポイントへのHTTPリクエストの送信
- レスポンスのパース
- エラーハンドリング
- ストリーミング応答の処理

## 8. エラーハンドリング

- ネットワークエラー（接続不可、タイムアウトなど）: 適切なエラーメッセージをユーザーに表示し、処理を中断する。
- Ollama APIからのエラーレスポンス（モデルが見つからない、不正なリクエストなど）: APIからのエラーコードやメッセージを解析し、ユーザーに分かりやすい形で提示する。

## 9. シーケンス図

```mermaid
sequenceDiagram
    actor User
    participant CLI as CLI Application
    participant OllamaClient as OllamaClient
    participant OllamaAPI as Ollama API Server

    User->>CLI: chat "Hello" --model llama2
    CLI->>OllamaClient: chat(model: "llama2", message: "Hello")
    OllamaClient->>OllamaAPI: POST /api/chat (request body)
    OllamaAPI-->>OllamaClient: Streaming Response (chunk 1)
    OllamaClient-->>CLI: Streamed Message (chunk 1)
    OllamaAPI-->>OllamaClient: Streaming Response (chunk 2)
    OllamaClient-->>CLI: Streamed Message (chunk 2)
    ...
    OllamaAPI-->>OllamaClient: Streaming Response (final chunk, done: true)
    OllamaClient-->>CLI: Streamed Message (final chunk)
    CLI-->>User: Display LLM Response

    User->>CLI: model list
    CLI->>OllamaClient: getModels()
    OllamaClient->>OllamaAPI: GET /api/tags
    OllamaAPI-->>OllamaClient: Models Response (JSON)
    OllamaClient-->>CLI: Parsed Model List
    CLI-->>User: Display Model List
```

## 10. クラス図 (OllamaClient)

```mermaid
classDiagram
    class OllamaClient {
        -baseUrl: string
        +constructor(baseUrl: string)
        +chat(model: string, messages: Message[], stream: boolean): AsyncGenerator<ChatResponseChunk>
        +getModels(): Promise<Model[]>
        -request<T>(method: string, path: string, body?: any): Promise<T>
    }

    class Message {
        role: "user" | "assistant" | "system"
        content: string
    }

    class ChatResponseChunk {
        model: string
        created_at: string
        message?: { role: "assistant"; content: string }
        done: boolean
    }

    class Model {
        name: string
        modified_at: string
        size: number
        digest: string
        details: {
            parent_model: string
            format: string
            family: string
            families: string[]
            parameter_size: string
            quantization_level: string
        }
    }
```
```
