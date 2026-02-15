# MultiOllamaAgentCLI 抽象設計（v1.0）

## 1. 目的

`doc/specification_ideal_v1.md` と `doc/spec_user_visible_behavior.md` を満たすための、実装非依存な論理アーキテクチャを定義する。
本設計は「何をどの責務で分離するか」を示し、個別実装の判断基準を提供する。

## 2. 設計原則

1. Local-First: 既定はローカル完結、外部接続は明示管理。
2. Single Control Node: 実行制御・ツール実行・監査をCLI実行ノードへ集約。
3. Safety-by-Default: 既定権限を最小化し、危険操作は抑止/承認前提。
4. Observable-by-Default: すべての実行を状態・イベント・監査として追跡可能にする。
5. User-visible Contract First: 完了判定は内部実装ではなくDoD（ユーザー可視振る舞い）準拠で行う。

## 3. システム境界

### 3.1 In-Scope（v1.0）

- `Must` と `Should` 機能群（`doc/feature_list.md`）
- CLI対話/非対話、ロール委譲、MCP連携、権限制御、監査/ログ、headless
- 複数Ollama endpointの登録/切替/フォールバック

### 3.2 Out-of-Scope（v1.0）

- `Could` 機能（高度オーケストレーション、ブラウザ操作高度化、プラグイン一般化など）
- 分散Agent常駐やクラウド集中管理の前提設計

## 4. 論理アーキテクチャ

## 4.1 レイヤ構成

1. Experience Layer

- CLIコマンド、対話UI、headless出力
- 実行状態（`pending/running/waiting_approval/succeeded/failed/cancelled`）の表示責務

2. Application Layer

- コマンドユースケース（chat/session/model/endpoint/mcp）
- ロールオーケストレーション（委譲、並行実行、停止条件）

3. Domain Layer

- セッション管理、コンテキスト管理、モデル解決、タスク状態機械
- ポリシー判定（認可、許可レベル、危険コマンド判定）

4. Infrastructure Layer

- Ollama endpoint adapter
- MCP client/runtime adapter
- ログ/監査ストア、設定ローダー、ヘルスチェック

## 4.2 主要コンポーネント

1. Command Gateway

- CLI入力を正規化し、ユースケースへ受け渡す。

2. Orchestrator

- ロール実行計画の生成、タスク分割、親子タスク追跡。
- 並行実行時のスケジューリングと終了条件管理。

3. Session & Context Manager

- セッション開始/保存/復元/終了。
- 履歴保持、要約圧縮、破棄ポリシー適用。

4. Model & Endpoint Resolver

- モデル優先順（引数 > セッション > 既定）解決。
- endpoint選択、障害時フォールバック。

5. Tool Execution Gateway

- MCPおよび内製ツール（file_read/file_write/shell_exec）呼び出し。
- 実行前ポリシー判定、承認要求、実行後監査連携。

6. Policy Engine

- 認証/認可、`auto/ask/deny`、`read-only/workspace-write/full-access`、危険コマンド抑止。

7. Execution State Store

- タスク/実行状態の単一状態遷移管理。
- UI表示・イベント出力・監査出力の整合基点。

8. Observability Pipeline

- 実行サマリ、イベントログ、監査ログ、会話/結果ログ、エラーログを分離保存。

## 5. 主要データ契約（抽象）

1. TaskState

- `task_id`, `session_id`, `state`, `updated_at`, `reason`

2. ExecutionEvent

- `event_id`, `timestamp`, `task_id`, `type`, `payload`

3. AuditEvent

- `audit_id`, `actor`, `action`, `target`, `policy_result`, `approved_by`, `reason`

4. PolicyDecision

- `decision`（allow/ask/deny）, `mode`, `matched_rule`, `risk_level`

5. EndpointHealth

- `endpoint_id`, `status`, `latency`, `last_error`, `checked_at`

## 6. 主要シーケンス

1. 対話チャット

- Command Gatewayが入力受理
- Model Resolverでモデル確定
- Orchestratorがロール実行
- Tool Gatewayが必要ツール呼び出し
- State Store更新とストリーミング表示
- Observabilityへ全イベント記録

2. 承認付きツール実行

- Tool要求生成
- Policy Engineが`ask`判定
- UIで承認待ち表示（`waiting_approval`）
- 承認後実行、監査記録、状態遷移

3. headless/CI実行

- 装飾なし出力で進行表示
- JSONLイベントを逐次出力
- 終了コード規約（0/1/2/3）で機械判定

## 7. 非機能設計方針

1. 性能

- 初回応答・ツール起動はSLO監視対象としてメトリクス化。

2. 信頼性

- リトライ/バックオフとフォールバックをユースケース層から分離し再利用可能化。

3. セキュリティ

- 既定`read-only`、許可外パス拒否、危険操作の多段判定を標準化。

4. 監査性

- 破壊操作・権限変更・承認は必ず監査イベントを強制発行。

## 8. リリース構造（抽象）

1. MVP（Phase 1）

- コア対話、ロール委譲、MCP基本、権限制御、構造化ログ。

2. 運用強化（Phase 2）

- headless品質、並行実行強化、信頼性機能、DX拡張。

3. 高度化（Phase 3+）

- Could機能をプラグ可能な境界を維持したまま追加。

## 9. 設計上のガードレール

1. ユーザー可視仕様を破る変更は禁止（表示状態・エラー表示・ログ情報単位）。
2. 実行状態は単一路線の状態機械で管理し、表示/ログで二重管理しない。
3. Policy Engineをバイパスするツール実行経路を作らない。
4. 監査イベントは「発生したら必ず記録」を優先し、最適化は後段で行う。

## 10. 参照ドキュメント

- `doc/specification_ideal_v1.md`
- `doc/spec_user_visible_behavior.md`
- `doc/feature_list.md`
- `doc/deployment_model_single_control_node.md`
- `doc/roadmap.md`
- `doc/task_breakdown_epic_story_task.md`
