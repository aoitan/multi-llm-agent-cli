# Implementation Plan: Issue #40 S2.2 並行実行と停止制御

## 1. 概要とゴール (Summary & Goal)

- **Must**:
  - `coordinator` からの委譲を、複数ロール（少なくとも `developer` / `reviewer`）で並行実行できる。
  - 並行実行中の各ロールについて、開始/終了時刻と成功/失敗が追跡できる。
  - 再試行上限と再循環上限（ループ閾値）を実装し、閾値超過時は自動停止して理由を可視化できる。
  - F-103 / F-105 の DoD を満たすユニット・受け入れテストを追加する。
- **Want**:
  - 並列度の動的最適化（負荷に応じた自動調整）。
  - 複数ノードへまたがる分散ジョブ実行。

## 2. スコープ定義 (Scope Definition)

### ✅ In-Scope (やること)

- `src/application/orchestration/run-role-graph.usecase.ts`
  - 直列実行フローを、ワーカープールを用いた並行実行フローへ拡張。
  - 再試行上限（roleごとの retry）と再循環上限（同一パターン反復）を判定し、停止理由を失敗イベントへ反映。
- `src/application/orchestration/dispatch-task.usecase.ts`
  - リトライ時のタスク状態更新を破綻なく扱えるように状態遷移を補強（必要最小限）。
- `src/domain/orchestration/entities/task.ts`
  - リトライ回数・停止理由追跡に必要な最小フィールドを追加（必要な場合のみ）。
- `src/shared/types/events.ts`
  - 停止理由・閾値情報を運べるイベント型へ拡張（既存 `role_delegation` を壊さない後方互換）。
- `src/mcp/McpServer.ts`
  - 並行実行時のロール別時間/結果、および自動停止理由を `task_status_update` で通知。
- `src/operations/logging/chat-event-logger.ts`
  - ループ停止トリガー、閾値、直前反復履歴を監査ログに記録できるよう拡張。
- `src/tests/unit/application/run-role-graph.usecase.test.ts`
  - 並行実行、再試行上限、ループ閾値超過停止のユニットテストを追加。
- `src/tests/unit/operations/chat-event-logger.test.ts`
  - 停止理由/閾値/反復履歴ログの永続化を検証。
- `src/tests/acceptance/features/F-103.parallel-role-execution.acceptance.test.ts`（新規）
  - 複数ロール協調実行時に分担結果とロール別ステータスが可視化されることを検証。
- `src/tests/acceptance/features/F-105.loop-guard.acceptance.test.ts`（新規）
  - ループ閾値超過で自動停止し、理由が表示・記録されることを検証。
- `README.md`
  - 並行実行と停止制御の制約（MVP範囲）と確認手順を追記。

### ⛔ Non-Goals (やらないこと/スコープ外)

- **分散ジョブスケジューラ**: 複数ノード分散、永続キュー、ワーカー常駐化は実装しない。
- **大規模リファクタリング**: オーケストレーション以外のCLI/MCP層の全面再設計は行わない。
- **新規依存追加**: 外部ジョブキュー/ワークフローエンジンは導入しない。
- **仕様拡張**: 優先度スケジューリング、SLAベース再実行、可観測性ダッシュボード新設は行わない。

## 3. 実装ステップ (Implementation Steps)

1. [ ] **Step 1: 並行実行モデルと上限ポリシーを定義する**
   - _Action_: `run-role-graph.usecase.ts` に実行オプション（`maxParallelRoles` / `maxRetriesPerRole` / `maxCycleCount`）を導入。
   - _Action_: coordinator出力を入力として、`developer` と `reviewer` を同時実行し、結果を `documenter` が集約する基本フローを設計。
   - _Validation_: 既存直列シナリオとの互換（最終応答型・イベント返却型）をユニットテストで固定。

2. [ ] **Step 2: 非同期ワーカープールを実装する**
   - _Action_: `run-role-graph.usecase.ts` に Promise ベースの軽量ワーカープールを実装し、同時実行数を制御。
   - _Action_: 各タスクの開始/終了時刻、成功/失敗をイベントに反映。
   - _Validation_: 並行時に処理時間が独立して記録され、複数child taskイベントが生成されることをテスト。

3. [ ] **Step 3: 再試行上限とループ検知を実装する**
   - _Action_: role実行失敗時に上限付き再試行を実装し、上限超過で fail-fast する。
   - _Action_: 同一パターンの反復（role+prompt等）を追跡し、`maxCycleCount` 超過時に自動停止。
   - _Validation_: 「再試行で復帰するケース」「上限超過で停止するケース」「ループ検知で停止するケース」をユニットテストで追加。

4. [ ] **Step 4: 通知・監査ログをF-103/F-105要件へ合わせる**
   - _Action_: `McpServer.ts` の通知にロール別結果、停止トリガー、閾値、停止理由を含める。
   - _Action_: `chat-event-logger.ts` にループ停止関連フィールド（trigger/threshold/recentHistory）を記録。
   - _Validation_: ログ出力テストで必須フィールドが欠けないこと、既存イベント型が壊れないことを確認。

5. [ ] **Step 5: 受け入れテストとドキュメント更新**
   - _Action_: F-103/F-105 の受け入れテストを新規追加し、既存 F-101/F-102 回帰も実施。
   - _Action_: `README.md` にMVPの停止制御仕様（上限値、挙動、非対応事項）を追記。
   - _Validation_: 対象テスト群と全体テストを通過。

## 4. 検証プラン (Verification Plan)

- 必須テスト:
  - `npm test -- src/tests/unit/application/run-role-graph.usecase.test.ts`
  - `npm test -- src/tests/unit/operations/chat-event-logger.test.ts`
  - `npm test -- src/tests/acceptance/features/F-103.parallel-role-execution.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-105.loop-guard.acceptance.test.ts`
- 回帰確認:
  - `npm test -- src/tests/acceptance/features/F-101.role-definition.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-102.delegation.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-102.delegation-mcp.acceptance.test.ts`
- 最終確認:
  - `npm test`
- 手動確認:
  - `orchestrate/task` 実行時に、並行ロールの進行が `task_status_update` で追えること。
  - ループ/再試行上限超過時に自動停止し、停止理由・閾値・直前履歴が通知とログの双方で確認できること。

## 5. ガードレール (Guardrails for Coding Agent)

- `doc/CURRENT_PLAN.md` に列挙したファイル以外は変更しない。
- 並行実行はアプリ内ワーカープールに限定し、分散実行や永続キューは実装しない。
- 既存 `orchestrate/task` の外部I/F（呼び出し方法・応答の基本形）は維持する。
- 停止制御は必ず「安全側停止（fail-safe）」を優先し、閾値超過時に継続実行しない。
- スコープ外の改善提案が出た場合は、実装せず別Issue化を提案する。

## 6. コーディングフェーズへの指示 (Instruction for Coding Phase)

> `doc/CURRENT_PLAN.md` の手順に従ってコードを書いてください。  
> **重要:** この計画書に書かれていないファイル修正やリファクタリングは**厳禁**です。  
> もし計画に不足がある場合は、勝手に進めず、計画の修正を提案してください。
