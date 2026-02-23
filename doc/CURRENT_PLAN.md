# Implementation Plan: Issue #39 S2.1 ロール実行モデル

## 1. 概要とゴール (Summary & Goal)

- **Must**:
  - 論理ロール `coordinator/developer/reviewer/documenter` を定義し、実行時に参照できる。
  - 親タスクIDと子タスクIDの関係を追跡できる。
  - Control Node 内でロール委譲を実行し、どのロールへ委譲したかを表示・ログ出力できる。
  - F-101/F-102 の DoD（可視性・追跡性・監査可能性）を満たすテストを追加する。
- **Want**:
  - 複数ロールの並列実行最適化。
  - リモートAgent常駐構成との透過的連携。
  - 高度なタスク分解（自動再計画・再委譲）。

## 2. スコープ定義 (Scope Definition)

### ✅ In-Scope (やること)

- `src/domain/orchestration/entities/role.ts`（新規）
  - ロール名、責務説明、委譲可能先を持つ論理ロール定義を実装。
- `src/domain/orchestration/entities/task.ts`（新規）
  - `taskId/parentTaskId/role/status/timestamps/failureReason` を持つ親子タスクモデルを実装。
- `src/application/orchestration/dispatch-task.usecase.ts`（新規）
  - 親タスク作成、子タスク委譲、状態更新（queued/running/completed/failed）を一元管理。
- `src/application/orchestration/run-role-graph.usecase.ts`（新規）
  - 初期ロール（coordinator）から子ロールへの委譲フローを単一 Control Node 内で実行。
- `src/mcp/McpServer.ts`
  - 既存 `orchestrate/task` から上記 use case を呼び出し、委譲先ロールと親子タスク情報を通知/結果に含める。
- `src/operations/logging/chat-event-logger.ts`
  - ロール委譲イベントを監査ログとして記録できるエントリ型を追加。
- `src/shared/types/chat.ts` または `src/shared/types/events.ts`（新規）
  - ロール委譲通知に使う最小イベント型を追加し、MCP通知の構造を固定化。
- `src/tests/unit/application/dispatch-task.usecase.test.ts`（新規）
  - 親子整合性、失敗時の状態遷移、委譲履歴記録を検証。
- `src/tests/unit/application/run-role-graph.usecase.test.ts`（新規）
  - coordinator から各ロールへ委譲される最小シナリオを検証。
- `src/tests/acceptance/features/F-101.role-definition.acceptance.test.ts`（新規）
  - ロール定義が表示可能で、実行時ロール構成が記録されることを検証。
- `src/tests/acceptance/features/F-102.delegation.acceptance.test.ts`（新規）
  - 親子タスク追跡と委譲表示/ログ出力を end-to-end で検証。
- `README.md`
  - ロール実行モデル（MVP）の制約と確認手順を追記。

### ⛔ Non-Goals (やらないこと/スコープ外)

- **分散実行**: リモートAgent常駐、ノード間Agent通信は実装しない。
- **並列実行最適化**: F-103（ワーカープール、並列スケジューリング）は実装しない。
- **大規模再設計**: 既存CLI全体やMCPプロトコル全面刷新は行わない。
- **新規依存追加**: タスクキュー基盤やワークフレームワークなど外部ライブラリは導入しない。
- **認可機能の拡張**: F-402 相当のロールベース認可詳細は今回扱わない。

## 3. 実装ステップ (Implementation Steps)

1. [ ] **Step 1: ロール定義と親子タスクモデルを追加する**
   - _Action_: `role.ts` に標準ロール4種と責務マップを定義。
   - _Action_: `task.ts` に親子タスク追跡に必要な属性と状態遷移型を追加。
   - _Validation_: ロール参照と task モデル生成のユニットテストを作成。

2. [ ] **Step 2: 委譲ユースケースを実装する**
   - _Action_: `dispatch-task.usecase.ts` で親タスク発行、子タスク委譲、完了/失敗更新を実装。
   - _Action_: 失敗時に `failureReason` を保存し、親へ集約できるようにする。
   - _Validation_: 親子ID整合性、状態遷移、異常系のユニットテストを追加。

3. [ ] **Step 3: Control Node 内ロール実行フローへ接続する**
   - _Action_: `run-role-graph.usecase.ts` を作成し、coordinator -> worker role の単一ノード委譲フローを実装。
   - _Action_: `McpServer.ts` の `runOrchestration` を置き換え、委譲イベント（委譲先ロール、taskId、parentTaskId）を通知。
   - _Validation_: 既存 `orchestrate/task` の応答互換を保ちつつ、追加フィールドが返ることを検証。

4. [ ] **Step 4: 可視化と監査ログを実装する**
   - _Action_: 委譲開始/完了/失敗イベントの出力形式を固定化し、`chat-event-logger` で記録。
   - _Action_: ユーザー向け表示（通知メッセージ）に委譲先ロールを明示。
   - _Validation_: ログに `parentTaskId/childTaskId/delegatedRole/delegatedAt/resultAt/failureReason` が残ることを確認。

5. [ ] **Step 5: 受け入れテストとドキュメント整備**
   - _Action_: F-101/F-102 の acceptance テストを追加。
   - _Action_: README に MVP の制約（単一ノード内委譲、非対応範囲）を追記。
   - _Validation_: 追加テスト + 既存 F-001〜F-005 が通ることを確認。

## 4. 検証プラン (Verification Plan)

- 必須テスト:
  - `npm test -- src/tests/unit/application/dispatch-task.usecase.test.ts`
  - `npm test -- src/tests/unit/application/run-role-graph.usecase.test.ts`
  - `npm test -- src/tests/acceptance/features/F-101.role-definition.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-102.delegation.acceptance.test.ts`
- 回帰確認:
  - `npm test -- src/tests/acceptance/features/F-001.chat.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-002.streaming.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-003.model-selection.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-004.session.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-005.context.acceptance.test.ts`
- 最終確認:
  - `npm test`
- 手動確認:
  - `orchestrate/task` 実行時に「どのロールへ委譲したか」が通知で確認できること。
  - 親タスクから子タスクまでID連鎖が追跡でき、失敗時に理由が記録されること。

## 5. ガードレール (Guardrails for Coding Agent)

- `doc/CURRENT_PLAN.md` に記載したファイル以外は原則変更しない。
- 計画にない仕様追加（例: 並列実行、分散通信、認可詳細）は実施せず、別Issueへ切り出す。
- 既存 `orchestrate/task` の基本I/F（呼び出し方法・最終応答の返却）は互換を維持する。
- ログ項目は監査要件を優先し、欠落時は silent fail せず最低限の失敗理由を残す。
- 実装中にスコープ変更が必要になった場合は、先に本計画を更新して承認を得る。
