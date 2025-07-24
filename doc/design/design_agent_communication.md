# Agent間通信プロトコルの詳細定義

本ドキュメントでは、MultiOllamaAgentCLIにおけるAgent間（Coordinator AgentとDeveloper Agentなど）のHTTP REST通信プロトコルを詳細に定義する。

## 1. 概要

Agent間の通信は、役割に応じたタスクの割り当て、結果の報告、および状態の同期を目的とする。HTTP RESTful APIを介して行われ、JSON形式でデータを交換する。

## 2. Agent APIエンドポイント

各Agentは、以下のAPIエンドポイントを提供する。

### 2.1. タスク割り当て (POST /tasks)

*   **目的:** Coordinator AgentがDeveloper AgentなどのWorker Agentにタスクを割り当てる。
*   **HTTPメソッド:** `POST`
*   **パス:** `/tasks`
*   **リクエストボディ (JSON Schema):**
    ```json
    {
      "type": "object",
      "properties": {
        "taskId": {
          "type": "string",
          "description": "割り当てるタスクの一意なID。"
        },
        "taskType": {
          "type": "string",
          "description": "タスクの種類（例: 'code_generation', 'document_analysis', 'bug_fix'など）。"
        },
        "prompt": {
          "type": "string",
          "description": "タスク実行のためのプロンプトまたは指示。"
        },
        "context": {
          "type": "object",
          "description": "タスク実行に必要な追加のコンテキスト情報（例: ファイルパス、既存コードなど）。",
          "additionalProperties": true
        }
      },
      "required": ["taskId", "taskType", "prompt"]
    }
    ```
*   **レスポンスボディ (JSON Schema):**
    ```json
    {
      "type": "object",
      "properties": {
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
      "required": ["status"]
    }
    ```

### 2.2. タスク結果報告 (POST /tasks/{taskId}/result)

*   **目的:** Worker Agentが割り当てられたタスクの実行結果をCoordinator Agentに報告する。
*   **HTTPメソッド:** `POST`
*   **パス:** `/tasks/{taskId}/result`
*   **リクエストボディ (JSON Schema):**
    ```json
    {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": ["completed", "failed", "in_progress"],
          "description": "タスクの現在の状態。"
        },
        "result": {
          "type": "object",
          "description": "タスクの実行結果データ。タスクの種類によって異なる。",
          "additionalProperties": true
        },
        "errorMessage": {
          "type": "string",
          "description": "タスクが失敗した場合のエラーメッセージ。"
        }
      },
      "required": ["status"]
    }
    ```
*   **レスポンスボディ (JSON Schema):**
    ```json
    {
      "type": "object",
      "properties": {
        "success": {
          "type": "boolean",
          "description": "結果報告が正常に処理されたかどうか。"
        }
      },
      "required": ["success"]
    }
    ```

### 2.3. Agent状態取得 (GET /status)

*   **目的:** 他のAgentが自身の状態（稼働状況、処理中のタスクなど）を取得する。
*   **HTTPメソッド:** `GET`
*   **パス:** `/status`
*   **リクエストボディ:** なし
*   **レスポンスボディ (JSON Schema):**
    ```json
    {
      "type": "object",
      "properties": {
        "agentName": {
          "type": "string",
          "description": "Agentの名前。"
        },
        "role": {
          "type": "string",
          "description": "Agentの役割（例: 'Coordinator', 'Developer'）。"
        },
        "status": {
          "type": "string",
          "enum": ["idle", "busy", "error"],
          "description": "Agentの現在の状態。"
        },
        "currentTask": {
          "type": "string",
          "description": "現在処理中のタスクID（存在する場合）。"
        },
        "availableTools": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "このAgentが利用可能なMCPツールのリスト。"
        }
      },
      "required": ["agentName", "role", "status"]
    }
    ```

## 3. 認証・認可メカニズム

Agent間の通信には、以下の認証・認可メカニズムを導入する。

*   **共有シークレット:** 各Agentは、事前に設定された共有シークレット（APIキーなど）をHTTPヘッダー（例: `Authorization: Bearer <shared_secret>`）に含めて送信する。受信側Agentは、このシークレットを検証する。
*   **IPアドレス制限:** 信頼できるIPアドレスからの接続のみを許可する設定を可能にする。
*   **役割ベースの認可:** タスク割り当てや結果報告など、特定のAPIエンドポイントへのアクセスは、Agentの役割（例: Coordinatorのみが `/tasks` にPOST可能）に基づいて制限する。

## 4. エラーハンドリング

Agent間通信におけるエラーは、標準的なHTTPステータスコードとJSON形式のエラーレスポンスで処理する。

*   **400 Bad Request:** リクエストボディの形式が不正、必須パラメータが不足している場合。
*   **401 Unauthorized:** 認証情報（共有シークレット）が不正な場合。
*   **403 Forbidden:** 認証は成功したが、認可されていない操作の場合（例: 役割ベースの認可違反）。
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

## 5. 通信のセキュリティ

*   **HTTPSの利用:** 本番環境では、Agent間の通信は必ずHTTPSを介して行う。開発環境ではHTTPも許可する。
*   **入力値の検証:** すべてのAPIエンドポイントで、受信したリクエストボディの入力値を厳格に検証し、不正なデータや悪意のあるペイロードを防ぐ。
*   **ログ記録:** Agent間の通信ログ（リクエスト、レスポンス、エラー）を適切に記録し、監査とデバッグに利用する。
