# Implementation Plan: Issue #38 S1.3 セッション・コンテキスト

## 1. 概要とゴール (Summary & Goal)

- **Must**:
  - `session start/save/load/end` を CLI から実行できる。
  - セッション保存後、`load` で会話文脈（最低: モデル設定 + 会話履歴）が再利用できる。
  - コンテキスト管理として「履歴保持」「明示破棄」「最小要約圧縮」をユーザー操作で制御できる。
  - チャット実行時にコンテキスト方針（保持件数、圧縮有無）を確認できる。
  - F-004/F-005 の DoD を満たす回帰テストを追加する。
- **Want**:
  - トークン数の高精度見積もり。
  - 複数ノード間のセッション共有。
  - 高度な要約アルゴリズム（段階要約・意味圧縮最適化）。

## 2. スコープ定義 (Scope Definition)

### ✅ In-Scope (やること)

- `src/ports/outbound/session-store.port.ts`
  - モデル保存だけでなく、セッション状態（履歴・メタ・コンテキスト方針）を扱える最小 API を追加。
- `src/adapters/session/in-memory-session-store.adapter.ts`
  - 新しい SessionStorePort 契約に追従し、テスト用の完全動作実装を追加。
- `src/adapters/session/file-session-store.adapter.ts`
  - `~/.multi-llm-agent-cli/session.json` を拡張し、セッション情報の保存/復元/削除を実装。
- `src/application/chat/run-chat.usecase.ts`
  - セッション開始・読込結果を使って、1ターン実行時の入力コンテキストを組み立てる責務を最小追加。
- `src/interaction/cli/commands/chat.command.ts`
  - `sessionId` 指定時の履歴反映、ターン完了時の履歴更新、コンテキスト方針表示を追加。
- `src/main.ts`
  - `session start/save/load/end` コマンドを追加し、既存 `chat` と同じ use case / store を利用。
- `src/tests/unit/application/run-chat.usecase.test.ts`
  - セッション復元・保持件数・破棄・要約反映のユニットテストを追加。
- `src/tests/unit/application/main.program.test.ts`
  - `session` サブコマンド登録と引数受け渡しを検証。
- `src/tests/acceptance/features/F-004.session.acceptance.test.ts`（新規）
  - 保存→復元で文脈再利用されることを検証。
- `src/tests/acceptance/features/F-005.context.acceptance.test.ts`（新規）
  - 保持/破棄/要約の操作結果が次ターンに反映されることを検証。
- `README.md`
  - `session` コマンドとコンテキスト管理の MVP 仕様を最小追記。

### ⛔ Non-Goals (やらないこと/スコープ外)

- **分散セッション同期**: 複数マシン・複数プロセス間の同期は実装しない。
- **大規模リファクタリング**: 既存のモジュール構成全面変更は行わない。
- **新規依存追加**: 要約や永続化のために新しい外部ライブラリは導入しない。
- **高度メモリ戦略**: ベクトルDB連携、長期記憶、自動重要度抽出は対象外。
- **F-006/F-007 の同時拡張**: event-output/headless の新機能追加は行わない。

## 3. 実装ステップ (Implementation Steps)

1. [ ] **Step 1: セッションデータ契約を定義する**
   - _Action_: `SessionStorePort` にセッション状態取得/保存/終了 API を追加し、型を定義する。
   - _Action_: in-memory / file adapter を同契約へ合わせる。
   - _Validation_: 既存 F-003 テストが回帰しないことを確認。

2. [ ] **Step 2: session start/save/load/end を実装する**
   - _Action_: `main.ts` に `session` サブコマンド群を追加し、開始・保存・読込・終了を操作可能にする。
   - _Action_: 成功時に保存先/対象 session id を標準出力に明示する。
   - _Validation_: `main.program` 系ユニットテストでコマンド登録と action 挙動を検証。

3. [ ] **Step 3: チャットと履歴永続化を接続する**
   - _Action_: `chat.command.ts` でセッション履歴をロードして初期 `messages` に反映。
   - _Action_: 各ターン完了時に user/assistant 発話をセッションへ保存。
   - _Validation_: 連続2ターンで履歴が再利用されるテストを追加。

4. [ ] **Step 4: 最小コンテキスト管理（保持/破棄/要約）を追加する**
   - _Action_: 保持件数ポリシー（過去Nターン）を導入し、投入メッセージを制限する。
   - _Action_: 明示破棄（全破棄 or 範囲破棄）を `session` コマンドで提供。
   - _Action_: 要約圧縮は「古い履歴を1メッセージへ要約」する最小実装に限定する。
   - _Validation_: F-005 受け入れテストで保持/破棄/圧縮の反映を確認。

5. [ ] **Step 5: 受け入れテストとドキュメントを整える**
   - _Action_: `F-004`/`F-005` acceptance テストを追加。
   - _Action_: README の `session` 操作例と制約（MVP）を更新。
   - _Validation_: `npm test` 全体成功、DoD 対応を確認。

## 4. 検証プラン (Verification Plan)

- 必須テスト:
  - `npm test -- src/tests/unit/application/run-chat.usecase.test.ts`
  - `npm test -- src/tests/unit/application/main.program.test.ts`
  - `npm test -- src/tests/acceptance/features/F-004.session.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-005.context.acceptance.test.ts`
- 回帰確認:
  - `npm test -- src/tests/acceptance/features/F-001.chat.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-002.streaming.acceptance.test.ts`
  - `npm test -- src/tests/acceptance/features/F-003.model-selection.acceptance.test.ts`
- 最終確認:
  - `npm test`
- 手動確認:
  - `session start` → `chat` 実行 → `session save` → `session load` 後に文脈が再利用されること。
  - コンテキスト破棄/要約操作後の次ターンで、反映された履歴のみ送信されること。

## 5. ガードレール (Guardrails for Coding Agent)

- `doc/CURRENT_PLAN.md` に記載したファイル以外は原則変更しない。
- 実装中に追加仕様が必要になった場合は、先に本計画を更新して承認を得る。
- 既存 F-001/F-002/F-003 の振る舞い（逐次表示、モデル解決優先順、対話 UX）を壊さない。
- 永続化フォーマット変更時は後方互換（既存 `session.json` 読み込み失敗時の安全側処理）を維持する。
- 複雑化を避け、MVP では「最小機能で受け入れ条件を満たす」ことを優先する。
