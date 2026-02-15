# 配置モデル仕様: Single Control Node

## 1. 目的

運用負荷を最小化するため、ツール配布先を `CLI実行ノード` のみに限定する。

## 2. 配置原則

- インストール対象:
  - `multiollama CLI`
  - Orchestrator / Role Runtime
  - MCPクライアント・MCP管理機能
  - ログ/監査出力機能

- 非インストール対象:
  - リモートの作業マシン（Ollama提供マシン）
  - 上記ノードには `Ollama API` のみ配置する

## 3. 通信モデル

1. ユーザーはCLI実行ノードでコマンド実行する。
2. Control Nodeが論理ロールを内部で並行実行する。
3. 各ロールは必要なモデルをリモート/ローカルOllama endpointへ非同期送信する。
4. ツール実行はControl Node上のMCP連携で完結する。

## 4. 期待される効果

- 各マシンへのAgent配布・更新が不要になる。
- バージョン差異起因の障害を低減できる。
- 監査ログを単一点で収集しやすい。

## 5. 制約

- Control Nodeが単一障害点になり得る。
- 高負荷時はControl Nodeのリソース設計が重要。

## 6. 関連

- 理想仕様: [./specification_ideal_v1.md](./specification_ideal_v1.md)
- 機能一覧: [./feature_list.md](./feature_list.md)
- ユーザー可視振る舞い仕様: [./spec_user_visible_behavior.md](./spec_user_visible_behavior.md)
