# MultiOllamaAgentCLI 機能一覧

本ドキュメントは、理想仕様と追加検討要件を統合した機能一覧である。  
旧仕様は `/Users/aoitan/workspace/mla_work/codex/doc/archive/specs/` にアーカイブ済み。

## 1. コア対話・実行機能

| ID | 機能名 | 概要 | 優先度 |
|---|---|---|---|
| [F-001](/Users/aoitan/workspace/mla_work/codex/doc/features/F-001.md) | CLIチャット実行 | プロンプト送信とLLM応答表示（単発/対話モード） | Must |
| [F-002](/Users/aoitan/workspace/mla_work/codex/doc/features/F-002.md) | ストリーミング表示 | LLM応答をチャンク単位で逐次表示 | Must |
| [F-003](/Users/aoitan/workspace/mla_work/codex/doc/features/F-003.md) | モデル選択 | 実行モデルをコマンド引数または設定で切替 | Must |
| [F-004](/Users/aoitan/workspace/mla_work/codex/doc/features/F-004.md) | セッション管理 | `start/save/load` による会話状態の保存・復元 | Must |
| [F-005](/Users/aoitan/workspace/mla_work/codex/doc/features/F-005.md) | コンテキスト管理 | 履歴保持、要約、破棄などの制御 | Must |
| [F-006](/Users/aoitan/workspace/mla_work/codex/doc/features/F-006.md) | 機械可読イベント出力 | JSONLなどで実行イベントを出力（CI連携向け） | Should |
| [F-007](/Users/aoitan/workspace/mla_work/codex/doc/features/F-007.md) | ヘッドレス実行 | 非対話実行モード（自動化・バッチ利用） | Should |

## 2. ロールオーケストレーション

| ID | 機能名 | 概要 | 優先度 |
|---|---|---|---|
| [F-101](/Users/aoitan/workspace/mla_work/codex/doc/features/F-101.md) | ロール定義 | Coordinator/Developer/Reviewer等の論理ロール定義 | Must |
| [F-102](/Users/aoitan/workspace/mla_work/codex/doc/features/F-102.md) | ロール間タスク委譲 | 単一Control Node内でタスク割当・結果集約 | Must |
| [F-103](/Users/aoitan/workspace/mla_work/codex/doc/features/F-103.md) | 複数ロール協調実行 | 複数ロールを並行実行し複数Ollama endpointへ非同期実行 | Should |
| [F-104](/Users/aoitan/workspace/mla_work/codex/doc/features/F-104.md) | 高度オーケストレーション | 指示者/作業者モデルのタスク分解・統合 | Could |
| [F-105](/Users/aoitan/workspace/mla_work/codex/doc/features/F-105.md) | ループ検知/終了条件 | 無限ループ防止とタスク停止制御 | Should |

## 3. MCP・ツール連携

| ID | 機能名 | 概要 | 優先度 |
|---|---|---|---|
| [F-201](/Users/aoitan/workspace/mla_work/codex/doc/features/F-201.md) | MCPクライアント接続 | Control Node経由でMCPサーバーを利用 | Must |
| [F-202](/Users/aoitan/workspace/mla_work/codex/doc/features/F-202.md) | MCP管理コマンド | `mcp list/enable/disable/status` で登録管理 | Must |
| [F-203](/Users/aoitan/workspace/mla_work/codex/doc/features/F-203.md) | 内製ツール: file_read | 許可パス内ファイルの読み取り | Must |
| [F-204](/Users/aoitan/workspace/mla_work/codex/doc/features/F-204.md) | 内製ツール: file_write | 許可パス内ファイルの書き込み（上書き制御） | Must |
| [F-205](/Users/aoitan/workspace/mla_work/codex/doc/features/F-205.md) | 内製ツール: shell_exec | 制約付きコマンド実行（ブラックリスト/確認） | Must |
| [F-206](/Users/aoitan/workspace/mla_work/codex/doc/features/F-206.md) | 外部MCPサーバー連携 | 要約・翻訳・検索など外部ツール接続 | Should |
| [F-207](/Users/aoitan/workspace/mla_work/codex/doc/features/F-207.md) | ブラウザ操作ツール連携 | Web調査/操作系ツールをMCP経由で利用 | Could |

## 4. エンドポイント・モデル運用

| ID | 機能名 | 概要 | 優先度 |
|---|---|---|---|
| [F-301](/Users/aoitan/workspace/mla_work/codex/doc/features/F-301.md) | 複数Ollamaエンドポイント登録 | `endpoint add/remove/list` を提供 | Must |
| [F-302](/Users/aoitan/workspace/mla_work/codex/doc/features/F-302.md) | エンドポイント切替 | `endpoint use` で実行先を変更 | Must |
| [F-303](/Users/aoitan/workspace/mla_work/codex/doc/features/F-303.md) | フォールバック | 障害時に別エンドポイントへ切替 | Should |
| [F-304](/Users/aoitan/workspace/mla_work/codex/doc/features/F-304.md) | ラウンドロビン | 複数エンドポイントへの分散実行 | Could |

## 5. セキュリティ・権限

| ID | 機能名 | 概要 | 優先度 |
|---|---|---|---|
| [F-401](/Users/aoitan/workspace/mla_work/codex/doc/features/F-401.md) | 認証 | CLI-ControlNode/Ollama/MCP間の共有シークレット認証 | Must |
| [F-402](/Users/aoitan/workspace/mla_work/codex/doc/features/F-402.md) | 認可 | ロール/ポリシーに基づく実行可否判定 | Must |
| [F-403](/Users/aoitan/workspace/mla_work/codex/doc/features/F-403.md) | パスアクセス制御 | 起動ディレクトリ制限と `--allow-path` 例外許可 | Must |
| [F-404](/Users/aoitan/workspace/mla_work/codex/doc/features/F-404.md) | コマンド許可レベル | `auto/ask/deny` の許可制御 | Must |
| [F-405](/Users/aoitan/workspace/mla_work/codex/doc/features/F-405.md) | 権限モード切替 | `read-only/workspace-write/full-access` の明示モード | Should |
| [F-406](/Users/aoitan/workspace/mla_work/codex/doc/features/F-406.md) | 危険コマンド防止 | ブラックリストと事前確認で破壊操作を抑止 | Must |

## 6. 信頼性・運用・監査

| ID | 機能名 | 概要 | 優先度 |
|---|---|---|---|
| [F-501](/Users/aoitan/workspace/mla_work/codex/doc/features/F-501.md) | エラー分類と処理方針 | システム/アプリ/ユーザーエラーの統一運用 | Must |
| [F-502](/Users/aoitan/workspace/mla_work/codex/doc/features/F-502.md) | リトライ/バックオフ | 一時障害時の自動再試行 | Should |
| [F-503](/Users/aoitan/workspace/mla_work/codex/doc/features/F-503.md) | ヘルスチェック | Control Node/MCP/エンドポイントの監視 | Should |
| [F-504](/Users/aoitan/workspace/mla_work/codex/doc/features/F-504.md) | 構造化ログ | JSONログとレベル運用（DEBUG-ERROR等） | Must |
| [F-505](/Users/aoitan/workspace/mla_work/codex/doc/features/F-505.md) | 監査ログ | 誰が何を実行/承認したか追跡可能にする | Should |
| [F-506](/Users/aoitan/workspace/mla_work/codex/doc/features/F-506.md) | チェックポイント/ロールバック | 実行前後状態の保存と復元 | Should |

## 7. 開発者体験・拡張

| ID | 機能名 | 概要 | 優先度 |
|---|---|---|---|
| [F-601](/Users/aoitan/workspace/mla_work/codex/doc/features/F-601.md) | 設定スキーマ | `config.yaml` / `agent-config.yaml` の厳密定義 | Must |
| [F-602](/Users/aoitan/workspace/mla_work/codex/doc/features/F-602.md) | カスタムコマンド | プロジェクト固有の定型コマンド拡張 | Should |
| [F-603](/Users/aoitan/workspace/mla_work/codex/doc/features/F-603.md) | Recipe/Prompt Pack | 再利用可能な実行手順テンプレート | Should |
| [F-604](/Users/aoitan/workspace/mla_work/codex/doc/features/F-604.md) | スケジュール実行 | 定期実行、再試行、結果保存 | Could |
| [F-605](/Users/aoitan/workspace/mla_work/codex/doc/features/F-605.md) | 明示的コンテキスト指定 | `@file` / `@diff` 等の対象明示入力 | Could |
| [F-606](/Users/aoitan/workspace/mla_work/codex/doc/features/F-606.md) | コスト可視化/圧縮 | トークン消費表示と会話圧縮（compact） | Could |
| [F-607](/Users/aoitan/workspace/mla_work/codex/doc/features/F-607.md) | プラグイン機構 | 追加ツール/フック/拡張APIの導入 | Could |

## 8. 実装優先セット（推奨）

- Phase A (MVP): `F-001`〜`F-005`, `F-101`〜`F-102`, `F-201`〜`F-205`, `F-301`〜`F-302`, `F-401`〜`F-404`, `F-501`, `F-504`, `F-601`
- Phase B (実運用強化): `F-006`, `F-007`, `F-303`, `F-405`, `F-502`, `F-503`, `F-505`, `F-506`, `F-602`, `F-603`
- Phase C (高度化): `F-104`, `F-207`, `F-304`, `F-604`, `F-605`, `F-606`, `F-607`


## 9. 詳細仕様リンク

- 機能別仕様インデックス: [/Users/aoitan/workspace/mla_work/codex/doc/features/README.md](/Users/aoitan/workspace/mla_work/codex/doc/features/README.md)
- 理想仕様: [/Users/aoitan/workspace/mla_work/codex/doc/specification_ideal_v1.md](/Users/aoitan/workspace/mla_work/codex/doc/specification_ideal_v1.md)
- ユーザー可視振る舞い仕様: [/Users/aoitan/workspace/mla_work/codex/doc/spec_user_visible_behavior.md](/Users/aoitan/workspace/mla_work/codex/doc/spec_user_visible_behavior.md)
- 配置モデル仕様: [/Users/aoitan/workspace/mla_work/codex/doc/deployment_model_single_control_node.md](/Users/aoitan/workspace/mla_work/codex/doc/deployment_model_single_control_node.md)
