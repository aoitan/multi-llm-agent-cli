# MultiOllamaAgentCLI 移行作業計画（仕様書v0.5対応）

## 🎯 目的

既存リポジトリ（`multi-llm-agent-cli-docs-specifications.zip` の状態）から、仕様書 v0.5 に基づいた設計・実装に移行することを目的とする。

- MCP仕様、Agent構成、ロール分担の再設計
- CLIインターフェースの拡張
- セキュリティ制約の強化（ローカル完結・ファイル制限）
- MCPとLangChainなど外部ツールの統合方針を明確化

---

## ✅ MVP（最小実用構成）

以下の構成を最速で動作確認することで、全体アーキテクチャのコア結合を早期検証する：

- [ ] CoordinatorとDeveloperのAgentを手動起動（config定義による役割分担含む）
- [ ] `mcp-server/file-read`（内製MCPサーバー）をNode.js/TypeScriptで実装・起動
- [ ] CLIからプロンプト送信 → CoordinatorがDeveloperに指示 → DeveloperがMCP経由でファイル読み込み → 応答返却の一連動作が完結する

---

## 🗂 移行作業ステップ一覧（タスク依存ベース）

> ※工程はタスク依存関係に従って進行、期間ベースでは管理しない

### 1. ドキュメント構成整理（v0.5準拠）

- [ ] `spec_functional.md`: 機能仕様書（`new-specification.md` からリネーム）
- [ ] `spec_architecture.md`: アーキテクチャ構成・MCP関係図（Mermaid図に注釈追加：**CLIからのMCP呼び出しは管理用途に限定**）
- [ ] `doc/design/design_mcp_protocol.md`: MCP設計と通信責務の整理（**呼び出し経路の原則＝Agent経由／例外＝管理系CLI** を明記）
- [ ] `doc/design/design_agent_roles.md`: Agentのロール定義・役割ごとの配置
- [ ] `doc/design/design_langchain_mcp.md`: LangChain等の連携方針（**MCPサーバー越し**であるべきことを明記）
- [ ] `doc/testing_strategy.md`: テスト戦略（Unit, Integration, E2E分類、ツール候補）

---

### 2. Agent構成の再定義とconfig化

- [ ] `agent-config.yaml`: 各Agent専用の設定ファイルを分離
  - [ ] `examples/agent-config.coordinator.yaml`
  - [ ] `examples/agent-config.developer.yaml`
- [ ] `config.yaml`: CLI/全体で参照する構成と制約設定（Agent一覧、許可ポリシー、パス制限など）

---

### 3. MCPプロトコル実装と登録管理

- [ ] MCP Client（共通RPCインターフェース）の実装
- [ ] CLIからMCPサーバーを登録・許可・確認できる機能群（**CLIから直接呼ぶことが許される唯一の用途**）
  - [ ] `multiollama mcp list`
  - [ ] `multiollama mcp enable/disable`
  - [ ] `multiollama mcp status`
- [ ] 🔬 **[テスト] MCP Client単体テスト作成**

---

### 4. CLI機能の拡張（仕様v0.5準拠）

- [ ] 対話中コマンド実行の許可制御（auto / ask / deny）
- [ ] セッション管理機能
  - [ ] `multiollama session start / end / save / load`
- [ ] `!`付きコマンドによるシェルパススルー
- [ ] パス制限：`--allow-path` / `--deny-up-dir` 起動オプション
- [ ] 🔬 **[テスト] CLIセッション・コマンド結合テスト作成**

---

### 5. セキュリティ制約の適用

- [ ] CLI・Agent双方で：
  - [ ] 起動ディレクトリ外ファイルアクセス制限（例外は `--allow-path`）
  - [ ] ログ出力・履歴保存（セッション/操作履歴/MCPログ）
  - [ ] 危険コマンドの拒否制御（`rm -rf`, `shutdown` など）
- [ ] 🔬 **[テスト] ファイル制限・コマンド許可制約の検証テスト**

---

### 6. MCPサーバー構成の設計と導入

- [ ] 内製MCPサーバー（Node.js/TSで実装）
  - [ ] `mcp-server/file-read`
  - [ ] `mcp-server/file-write`
  - [ ] `mcp-server/shell-exec`
- [ ] 外部MCPサーバー調査（必要に応じて導入）
  - [ ] LangChain連携用（RAG / LangGraph）
  - [ ] 翻訳、検索、整形など単機能サーバー
- [ ] 🧩 **補足**：MCPサーバーはツール単位で分離（1サーバー1責務）原則に基づく

---

### 7. アーキテクチャ構成図の反映と実装整備

- [ ] Mermaid構成図のアップデート（**注釈付き**）
- [ ] READMEおよび `spec_architecture.md` に掲載
- [ ] 手動設定でのAgent接続から開始し、LAN内自動検出は後工程へ切り出し（MVP範囲外）

---

## 🧩 注意点・設計原則

- MCPは **ゲートウェイではなく共通RPC仕様** であることに注意
- MCPサーバーは **各ツールごとに独立してよい**（再利用・疎結合の観点）
- LangChainは **Agent内部で直接呼び出さず、MCPサーバー越し** に呼び出す
- CLIがMCPを直接呼ぶのは **登録管理用途などの例外のみ**
- 本プロジェクトでは **MCP自体の実装は行わず、公式ライブラリやSDKを活用**
- 処理はすべて **ローカル完結**、外部API通信は許可制を経由する
