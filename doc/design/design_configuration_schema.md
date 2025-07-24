# 設定ファイルスキーマの詳細定義

本ドキュメントでは、MultiOllamaAgentCLIプロジェクトで使用される主要な設定ファイル（`agent-config.yaml` および `config.yaml`）のスキーマを詳細に定義する。

## 1. `agent-config.yaml` スキーマ

各Agent専用の設定ファイルであり、Agentの役割、使用モデル、指示対象のAgent一覧、MCPサーバー呼び出しポリシーなどを定義する。

```yaml
# agent-config.yaml のスキーマ定義
# 各Agentインスタンスが自身の動作を設定するために使用する

agent:
  name: string  # Agentの一意な名前 (例: "coordinator-agent-1", "developer-agent-alpha")
  role: string  # Agentの役割 (例: "Coordinator", "Developer", "Reviewer", "Documenter")
  description: string? # Agentの簡単な説明
  model: string # このAgentが使用するOllamaモデル名 (例: "llama3", "mistral")
  ollamaApiUrl: string # このAgentが接続するOllama APIのエンドポイントURL (例: "http://localhost:11434")
  targetAgents: # このAgentが指示を送信できる他のAgentのリスト
    - name: string # 対象Agentの名前
      url: string  # 対象AgentのAPIエンドポイントURL (例: "http://192.168.1.100:8000")
  mcpPolicy: # MCPサーバー呼び出しポリシー
    default: "auto" | "ask" | "deny" # デフォルトのポリシー
    tools: # ツールごとのオーバーライドポリシー
      "tool_name_1": "auto" | "ask" | "deny"
      "tool_name_2": "auto" | "ask" | "deny"
  security:
    allowedPaths: # このAgentがアクセスを許可されるファイルパスのリスト (絶対パス)
      - string
    blockedCommands: # このAgentが実行を禁止されるシェルコマンドのリスト (正規表現または完全一致)
      - string
    askConfirmationCommands: # 実行前にユーザー確認を求めるシェルコマンドのリスト
      - string
```

### `agent-config.yaml` の例

```yaml
agent:
  name: my-coordinator
  role: Coordinator
  description: "メインの指示出しAgent"
  model: llama3
  ollamaApiUrl: "http://localhost:11434"
  targetAgents:
    - name: my-developer
      url: "http://192.168.1.101:8001"
    - name: my-reviewer
      url: "http://192.168.1.102:8002"
  mcpPolicy:
    default: ask
    tools:
      file_read: auto
      file_write: ask
      shell_exec: deny
  security:
    allowedPaths:
      - "/home/user/projects/my_project"
      - "/tmp/shared_data"
    blockedCommands:
      - "rm -rf"
      - "sudo"
    askConfirmationCommands:
      - "apt install"
      - "npm install"
```

## 2. `config.yaml` スキーマ

CLIおよびシステム全体で参照される共通設定ファイルであり、登録されているAgent一覧、グローバルな許可ポリシー、パス制限などを定義する。

```yaml
# config.yaml のスキーマ定義
# CLIおよびシステム全体で参照される共通設定

system:
  defaultAgent: string? # デフォルトで使用するAgentの名前
  ollama:
    defaultModel: string # デフォルトで使用するOllamaモデル名
    endpoints: # 登録されているOllamaエンドポイントのリスト
      - name: string # エンドポイントの名前
        url: string  # Ollama APIのエンドポイントURL
  agents: # システムに登録されているAgentのリスト
    - name: string # Agentの名前
      url: string  # AgentのAPIエンドポイントURL
      role: string # Agentの役割 (例: "Coordinator", "Developer")
  security:
    globalAllowedPaths: # システム全体で許可されるファイルパスのリスト (絶対パス)
      - string
    globalBlockedCommands: # システム全体で実行を禁止されるシェルコマンドのリスト
      - string
    globalAskConfirmationCommands: # 実行前にユーザー確認を求めるシェルコマンドのリスト
      - string
  logging:
    level: "debug" | "info" | "warn" | "error" | "fatal" # ログレベル
    outputPath: string? # ログ出力パス (省略時は標準出力)
  session:
    savePath: string # セッション保存ディレクトリのパス
    autoSave: boolean # セッションを自動保存するかどうか
```

### `config.yaml` の例

```yaml
system:
  defaultAgent: my-coordinator
  ollama:
    defaultModel: llama3
    endpoints:
      - name: local-ollama
        url: "http://localhost:11434"
      - name: remote-ollama
        url: "http://192.168.1.200:11434"
  agents:
    - name: my-coordinator
      url: "http://localhost:8000"
      role: Coordinator
    - name: my-developer
      url: "http://192.168.1.101:8001"
      role: Developer
  security:
    globalAllowedPaths:
      - "/home/user/shared_data"
    globalBlockedCommands:
      - "format C:"
    globalAskConfirmationCommands:
      - "rm -rf /"
  logging:
    level: info
    outputPath: "./logs/multiollama.log"
  session:
    savePath: "./sessions"
    autoSave: true
```
