# 複数Ollamaエンドポイント管理の設計

## 概要

複数のOllamaエンドポイントを効率的に管理し、CLIから登録・選択・削除できる仕組みを設計します。また、`OllamaClient`がこれらのエンドポイントを透過的に利用できるようにします。

## エンドポイントのデータ構造

各Ollamaエンドポイントは以下の情報を持つものとします。

- `name`: エンドポイントを識別するための一意な名前（例: `local`, `remote-server-1`）
- `url`: Ollama APIのエンドポイントURL（例: `http://localhost:11434`, `http://192.168.1.100:11434`）

これらのエンドポイントは、設定ファイル（`config.json`）に保存されるものとします。

```json
{
  "defaultModel": "llama2",
  "endpoints": [
    { "name": "local", "url": "http://localhost:11434" },
    { "name": "remote", "url": "http://192.168.1.100:11434" }
  ],
  "currentEndpoint": "local" // 現在使用中のエンドポイントの名前
}
```

## 設定管理

`src/config.ts` を拡張し、`endpoints` のリストと `currentEndpoint` を管理できるようにします。

- `addEndpoint(name: string, url: string)`: 新しいエンドポイントを追加します。
- `removeEndpoint(name: string)`: 指定されたエンドポイントを削除します。
- `setCurrentEndpoint(name: string)`: 現在使用するエンドポイントを設定します。
- `getEndpoint(name?: string)`: 指定された名前のエンドポイント、または現在のエンドポイントのURLを返します。

## CLIコマンド

以下のCLIコマンドを `multi-llm-agent-cli model` サブコマンドの下に実装します。

- `multi-llm-agent-cli endpoint add <name> <url>`: 新しいOllamaエンドポイントを登録します。
- `multi-llm-agent-cli endpoint remove <name>`: 登録済みのOllamaエンドポイントを削除します。
- `multi-llm-agent-cli endpoint use <name>`: デフォルトで使用するOllamaエンドポイントを切り替えます。
- `multi-llm-agent-cli endpoint list`: 登録済みのOllamaエンドポイントを一覧表示します。

## OllamaClientの変更

`OllamaClient`は、インスタンス化時に`baseUrl`を直接受け取るのではなく、`config.ts`から現在のエンドポイントのURLを取得するように変更します。これにより、CLIでエンドポイントを切り替えた際に、`OllamaClient`が自動的に新しいエンドポイントを使用するようになります。

## ラウンドロビンオーケストレーション（将来的な検討）

複数のエンドポイントが登録されている場合、`chat`コマンドなどで自動的にエンドポイントを切り替えるラウンドロビン方式を将来的に検討します。これは、`OllamaClient`内部でエンドポイントのリストを管理し、リクエストごとに次のエンドポイントを選択するロジックを実装することで実現できます。
