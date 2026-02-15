# 内製MCPツールの詳細定義

本ドキュメントでは、MultiOllamaAgentCLIが提供する内製MCPサーバー（`mcp-server/file-read`、`mcp-server/file-write`、`mcp-server/shell-exec`）が公開するMCPツールの詳細なインターフェースを定義する。

各ツールはMCPの `Tool` 定義に準拠し、`name`、`description`、`inputSchema`、`outputSchema`、およびセキュリティポリシーを明確にする。

---

## 1. `mcp-server/file-read` (ファイル読み込みツール)

### 目的

指定されたパスのファイルを読み込み、その内容を返す。

### ツール定義

```json
{
  "name": "file_read",
  "description": "指定されたパスのファイルを読み込み、その内容を返します。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "読み込むファイルのパス。絶対パスまたは許可されたルートディレクトリからの相対パスを指定。"
      }
    },
    "required": ["path"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "content": {
        "type": "string",
        "description": "読み込んだファイルの内容。"
      }
    },
    "required": ["content"]
  },
  "annotations": {
    "readOnlyHint": true,
    "openWorldHint": false
  }
}
```

### セキュリティポリシー

- **パスの制限:** 読み込み可能なファイルパスは、CLIの起動ディレクトリ配下、または `--allow-path` オプションで明示的に許可されたパスに限定される。
- **シンボリックリンクの禁止:** シンボリックリンクを辿って許可されていないパスにアクセスすることを禁止する。
- **バイナリファイルの制限:** テキストファイル以外のバイナリファイル（例: `.exe`, `.zip` など）の読み込みは原則禁止とする。許可する場合は、MIMEタイプによる厳格なチェックを行う。

---

## 2. `mcp-server/file-write` (ファイル書き込みツール)

### 目的

指定されたパスにファイルを作成または上書きし、内容を書き込む。

### ツール定義

```json
{
  "name": "file_write",
  "description": "指定されたパスにファイルを作成または上書きし、内容を書き込みます。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "書き込むファイルのパス。絶対パスまたは許可されたルートディレクトリからの相対パスを指定。"
      },
      "content": {
        "type": "string",
        "description": "ファイルに書き込む内容。"
      },
      "overwrite": {
        "type": "boolean",
        "description": "既存のファイルを上書きするかどうか。falseの場合、ファイルが存在するとエラーを返す。",
        "default": false
      }
    },
    "required": ["path", "content"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": {
        "type": "boolean",
        "description": "書き込みが成功したかどうか。"
      }
    },
    "required": ["success"]
  },
  "annotations": {
    "readOnlyHint": false,
    "destructiveHint": true,
    "idempotentHint": false,
    "openWorldHint": false
  }
}
```

### セキュリティポリシー

- **パスの制限:** 書き込み可能なファイルパスは、CLIの起動ディレクトリ配下、または `--allow-path` オプションで明示的に許可されたパスに限定される。
- **シンボリックリンクの禁止:** シンボリックリンクを辿って許可されていないパスにアクセスすることを禁止する。
- **上書きの確認:** `overwrite` が `true` の場合のみ既存ファイルを上書きを許可する。`false` の場合はファイルが存在するとエラーを返す。
- **実行可能ファイルの禁止:** 実行可能ファイル（例: `.exe`, `.sh` など）の書き込みは原則禁止とする。MIMEタイプによる厳格なチェックを行う。

---

## 3. `mcp-server/shell-exec` (シェル実行ツール)

### 目的

指定されたシェルコマンドを実行し、その標準出力と標準エラー出力を返す。

### ツール定義

```json
{
  "name": "shell_exec",
  "description": "指定されたシェルコマンドを実行し、その標準出力と標準エラー出力を返します。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "実行するシェルコマンド。"
      },
      "args": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "コマンドに渡す引数の配列。",
        "default": []
      },
      "cwd": {
        "type": "string",
        "description": "コマンドを実行する作業ディレクトリ。絶対パスまたは許可されたルートディレクトリからの相対パスを指定。省略された場合はCLIの起動ディレクトリ。"
      }
    },
    "required": ["command"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "stdout": {
        "type": "string",
        "description": "コマンドの標準出力。"
      },
      "stderr": {
        "type": "string",
        "description": "コマンドの標準エラー出力。"
      },
      "exitCode": {
        "type": "number",
        "description": "コマンドの終了コード。"
      }
    },
    "required": ["stdout", "stderr", "exitCode"]
  },
  "annotations": {
    "readOnlyHint": false,
    "destructiveHint": true,
    "openWorldHint": true
  }
}
```

### セキュリティポリシー

- **コマンドのブラックリスト:** `rm -rf`, `shutdown`, `format` など、システムに重大な影響を与える可能性のあるコマンドはブラックリストとして定義し、実行を禁止する。
- **ユーザー確認:** 危険度が高いと判断されるコマンド（例: `sudo`, `apt install` など）については、実行前にユーザーに確認を求める（`ask` ポリシー）。
- **作業ディレクトリの制限:** `cwd` で指定可能なディレクトリは、CLIの起動ディレクトリ配下、または `--allow-path` オプションで明示的に許可されたパスに限定される。
- **環境変数の制限:** シェル実行時に渡される環境変数を制限し、機密情報へのアクセスを防ぐ。
- **タイムアウト:** コマンド実行にタイムアウトを設定し、無限ループやハングアップを防ぐ。

---
