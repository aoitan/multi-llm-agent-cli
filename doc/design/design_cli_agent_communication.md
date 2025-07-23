# CLI-Agent間通信プロトコルの詳細定義

本ドキュメントでは、MultiOllamaAgentCLIのCLIコンポーネントとCoordinator Agent間の通信プロトコルを詳細に定義する。

## 1. 概要

CLIはユーザーインターフェースとして機能し、ユーザーからの指示をCoordinator Agentに伝達する。Coordinator Agentは、受け取った指示に基づいてタスクを処理し、その結果をCLIに返す。この通信は主にHTTP RESTを介して行われるが、初期起動時の設定伝達にはコマンドライン引数や環境変数も利用する。

## 2. CLIからAgentへの起動と初期設定

CLIは、Coordinator Agentをローカルまたはリモートで起動し、初期設定を渡す。

### 2.1. Agentの起動

CLIは、ユーザーが指定したAgentの起動コマンド（例: `python agent_main.py --port 8000`）を実行することでAgentを起動する。Agentの起動は、CLIとは独立したプロセスとして実行される。

### 2.2. 初期設定の伝達

*   **コマンドライン引数:** Agentの起動時に、ポート番号、設定ファイルのパス、初期プロンプトなどの基本的な設定をコマンドライン引数として渡す。
    *   例: `multiollama agent start --port 8000 --config /path/to/agent-config.yaml`
*   **環境変数:** 機密情報や頻繁に変更されない設定は環境変数としてAgentプロセスに渡すことも検討する。

## 3. CLIからAgentへのタスク送信

CLIは、ユーザーからのプロンプトやコマンドをCoordinator Agentにタスクとして送信する。

### 3.1. タスク送信APIエンドポイント

*   **目的:** ユーザーからの指示（プロンプト、コマンドなど）をCoordinator Agentにタスクとして送信する。
*   **HTTPメソッド:** `POST`
*   **パス:** `/submit_task`
*   **リクエストボディ (JSON Schema):**
    ```json
    {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "description": "現在のCLIセッションの一意なID。"
        },
        "userPrompt": {
          "type": "string",
          "description": "ユーザーが入力したプロンプトまたはコマンド。"
        },
        "taskType": {
          "type": "string",
          "enum": ["chat", "command_execution", "file_operation", "complex_task"],
          "description": "タスクの種類。"
        },
        "context": {
          "type": "object",
          "description": "タスク実行に必要な追加のコンテキスト情報（例: 現在の作業ディレクトリ、選択中のモデルなど）。",
          "additionalProperties": true
        }
      },
      "required": ["sessionId", "userPrompt", "taskType"]
    }
    ```
*   **レスポンスボディ (JSON Schema):**
    ```json
    {
      "type": "object",
      "properties": {
        "taskId": {
          "type": "string",
          "description": "Agentが受け付けたタスクの一意なID。"
        },
        "status": {
          "type": "string",
          "enum": ["accepted", "rejected"],
          "description": "タスクの受け入れ状態。"
        },
        "message": {
          "type": "string",
          "description": "タスク受け入れ/拒否に関するメッセージ。"
        }
      },
      "required": ["taskId", "status"]
    }
    ```

## 4. AgentからCLIへの結果受信

CLIは、Agentからタスクの進行状況や最終結果を受け取る。

### 4.1. 結果ポーリング (GET /tasks/{taskId}/status)

CLIは、Agentに定期的にポーリングリクエストを送信し、タスクのステータスと結果を取得する。

*   **目的:** 特定のタスクの現在の状態と結果を取得する。
*   **HTTPメソッド:** `GET`
*   **パス:** `/tasks/{taskId}/status`
*   **リクエストボディ:** なし
*   **レスポンスボディ (JSON Schema):**
    ```json
    {
      "type": "object",
      "properties": {
        "taskId": {
          "type": "string",
          "description": "タスクの一意なID。"
        },
        "status": {
          "type": "string",
          "enum": ["pending", "in_progress", "completed", "failed"],
          "description": "タスクの現在の状態。"
        },
        "progress": {
          "type": "number",
          "description": "タスクの進捗状況（0-100）。"
        },
        "result": {
          "type": "object",
          "description": "タスクの最終結果データ（タスク完了時のみ）。",
          "additionalProperties": true
        },
        "errorMessage": {
          "type": "string",
          "description": "タスクが失敗した場合のエラーメッセージ。"
        }
      },
      "required": ["taskId", "status"]
    }
    ```

### 4.2. ストリーミング結果 (オプション: Server-Sent Events / WebSockets)

リアルタイムな進捗表示やLLMのストリーミング応答のために、AgentからCLIへのServer-Sent Events (SSE) またはWebSocketsによるストリーミング通信も検討する。これにより、CLIはポーリングなしでAgentからの更新を即座に受け取れる。

*   **目的:** タスクのリアルタイムな進捗状況やLLMのストリーミング応答をCLIに表示する。
*   **通信プロトコル:** SSEまたはWebSockets
*   **データ形式:** JSON

## 5. エラーハンドリング

CLIとAgent間の通信におけるエラーは、標準的なHTTPステータスコードとJSON形式のエラーレスポンスで処理する。

*   **400 Bad Request:** リクエストボディの形式が不正、必須パラメータが不足している場合。
*   **401 Unauthorized:** 認証情報が不正な場合。
*   **403 Forbidden:** 認証は成功したが、認可されていない操作の場合。
*   **404 Not Found:** 指定されたリソース（例: `taskId`）が見つからない場合。
*   **500 Internal Server Error:** Agent内部で予期せぬエラーが発生した場合。

エラーレスポンスの例:
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": "object" // オプション：詳細なエラー情報
  }
}
```

## 6. セキュリティ考慮事項

*   **認証:** CLIとAgent間の通信には、APIキーや共有シークレットなどの認証メカニズムを導入する。
*   **HTTPSの利用:** 本番環境では、CLIとAgent間の通信は必ずHTTPSを介して行う。
*   **入力値の検証:** CLIからAgentに送信されるすべての入力値は、Agent側で厳格に検証し、不正なデータや悪意のあるペイロードを防ぐ。
*   **ログ記録:** CLIとAgent間の通信ログ（リクエスト、レスポンス、エラー）を適切に記録し、監査とデバッグに利用する。
