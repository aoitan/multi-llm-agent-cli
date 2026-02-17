# Implementation Plan: Issue #37 S1.2 ストリーミングUX

## 1. 概要とゴール (Summary & Goal)

- **Must**:
  - 応答テキストを完了前に逐次表示し続ける（既存の逐次表示を維持）。
  - 実行中であることをユーザーが識別できる表示を追加する（`Generating...` 相当）。
  - 応答の完了を明示する（done表示/状態更新/改行完了）。
  - ストリーミングの順序保証をテストで担保する。
  - F-002 の DoD（逐次表示、順序保持、実行中/完了表示）に適合する。
- **Want**:
  - 表示状態（pending/running/succeeded など）の全コマンド統一。
  - headless 向けイベント出力設計の同時拡張。

## 2. スコープ定義 (Scope Definition)

### ✅ In-Scope (やること)

- `src/interaction/cli/commands/chat.command.ts`
  - 1ターン中の表示状態を追加（開始時: 実行中、終了時: 完了）。
  - 逐次トークン表示の前後メッセージを最小変更で実装。
- `src/application/chat/run-chat.usecase.ts`
  - 既存の `runTurn` の順序性・終了条件を保持し、必要なら補助的な安全策のみ追加。
- `src/tests/unit/interaction/chat.command.test.ts`
  - 実行中表示と完了表示が出ることを検証。
  - 既存の逐次処理直列化テストを維持し、回帰を防ぐ。
- `src/tests/unit/application/run-chat.usecase.test.ts`
  - チャンク順序保持・`done` で終了することを明示的に検証（T1.2.3）。
- `src/tests/acceptance/features/F-002.streaming.acceptance.test.ts`（新規）
  - F-002 観点の受け入れテストを追加し、CLIでの可視挙動を確認。

### ⛔ Non-Goals (やらないこと/スコープ外)

- **リッチUI化**: TUI/GUI、スピナーライブラリ導入、装飾的レンダリングは行わない。
- **広範囲リファクタリング**: `src/cli/commands/*` や他機能（F-004以降）の設計変更は行わない。
- **ログ仕様拡張**: 監査ログスキーマの大規模変更や新規ログ基盤導入は行わない。
- **依存追加**: 新しい外部ライブラリは追加しない。

## 3. 実装ステップ (Implementation Steps)

1. [ ] **Step 1: 現行ストリーミング経路の固定化**
   - _Action_: `src/application/chat/run-chat.usecase.ts` の `runTurn` 挙動（順序・done終了）を仕様化するテストを先に追加/補強。
   - _Validation_: `src/tests/unit/application/run-chat.usecase.test.ts` で順序保証ケースが通る。

2. [ ] **Step 2: 実行中/完了表示の追加**
   - _Action_: `src/interaction/cli/commands/chat.command.ts` の `streamOneTurn` に実行中表示（開始）と完了表示（終了）を追加。
   - _Action_: 既存の `AI: ` プレフィックスと逐次 `process.stdout.write` の順序を壊さない。
   - _Validation_: `src/tests/unit/interaction/chat.command.test.ts` で表示文言と呼び出し順を検証。

3. [ ] **Step 3: F-002 受け入れテストの追加**
   - _Action_: `src/tests/acceptance/features/F-002.streaming.acceptance.test.ts` を追加し、以下を検証。
     - 完了前にチャンクが表示される。
     - 実行中表示と完了表示がユーザー可視である。
     - 重複表示せず順序が維持される。
   - _Validation_: `npm test` で新規 acceptance を含めて成功。

4. [ ] **Step 4: 最終検証と差分確認**
   - _Action_: 変更ファイルが計画内に限定されていることを確認。
   - _Validation_: F-002 DoD との対応表をPR説明に転記できる粒度で確認。

## 4. 検証プラン (Verification Plan)

- 必須テスト:
  - `npm test -- src/tests/unit/application/run-chat.usecase.test.ts`
  - `npm test -- src/tests/unit/interaction/chat.command.test.ts`
  - `npm test -- src/tests/acceptance/features/F-002.streaming.acceptance.test.ts`
- 最終テスト:
  - `npm test`
- 手動確認:
  - `chat "hello"` 実行時に、応答本文の逐次表示に加えて実行中表示が見える。
  - 応答終了時に完了が明示される（done表示または同等の完了サイン）。
  - 応答テキストの表示順が入力順・生成順と一致する。

## 5. ガードレール (Guardrails for Coding Agent)

- `doc/CURRENT_PLAN.md` に記載のないファイル変更は禁止する。
- 実装中に仕様追加が必要になった場合は、コード変更前に本計画を更新して承認を得る。
- 表示文言を変更する場合、対応するテスト期待値を同時更新し、意図をコメントまたはPR説明に残す。
- 既存の逐次出力ロジックを破壊しないことを最優先とし、必要最小限の差分で実装する。
