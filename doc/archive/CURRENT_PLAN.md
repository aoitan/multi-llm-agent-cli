# Implementation Plan: Issue #36 S1.1 CLIチャット基盤（理想アーキテクチャ再設計）

## 1. 概要とゴール (Summary & Goal)

- **Must**:
  - `doc/archive/specs/abstract_design_v1.md` と `doc/archive/specs/architecture_feature_mapping_and_layout_v1.md` に準拠した、グリーンフィールド前提の設計へ更新する。
  - F-001（CLIチャット実行）/F-003（モデル選択）を「最小縦スライス」で成立させる設計にする。
  - モデル選択優先順 `引数 > セッション > 既定` を `application/model-endpoint` のユースケースとして定義する。
  - モデル未存在時のエラー導線（候補提示または `model list` 導線）を `interaction/presenter` で統一表示できる設計にする。
- **Want**:
  - F-002/F-004/F-006/F-007 へ拡張しやすいポート境界を同時に確定する。
  - acceptance test を F-ID 単位で増設しやすいテスト配置に寄せる。

## 2. スコープ定義 (Scope Definition)

### ✅ In-Scope (やること)

- 現行コード互換を捨て、Issue #36 を理想構成で再設計する。
- 対象サブシステム（最小）:
  - `interaction`（CLI command + presenter）
  - `application/chat`（run-chat usecase）
  - `application/model-endpoint`（resolve-model usecase）
  - `domain/model-endpoint`（model selection rule）
  - `ports/outbound`（`llm-client.port.ts`, `session-store.port.ts`）
  - `adapters/ollama`（port実装）
- 最小ファイル計画（新規前提）:
  - `src/main.ts`
  - `src/interaction/cli/commands/chat.command.ts`
  - `src/interaction/presenter/error-presenter.ts`
  - `src/application/chat/run-chat.usecase.ts`
  - `src/application/model-endpoint/resolve-model.usecase.ts`
  - `src/domain/model-endpoint/services/model-resolution-policy.ts`
  - `src/ports/outbound/llm-client.port.ts`
  - `src/ports/outbound/session-store.port.ts`
  - `src/adapters/ollama/ollama-client.adapter.ts`
  - `src/tests/acceptance/features/F-001.chat.acceptance.test.ts`
  - `src/tests/acceptance/features/F-003.model-selection.acceptance.test.ts`

### ⛔ Non-Goals (やらないこと/スコープ外)

- **後続機能**: F-004（保存/復元）、F-005（圧縮）、F-101以降のロールオーケストレーションは今回実装しない。
- **運用拡張**: フォールバック（F-303）、ラウンドロビン（F-304）、監査フル実装（F-505）は設計上の接続点だけ用意し、機能実装はしない。
- **移行対応**: 既存 `src/cli/commands/*.ts` との後方互換・段階移行は考慮しない。
- **依存追加の最適化**: パフォーマンス最適化・可観測性高度化は別フェーズで扱う。

## 3. 実装ステップ (Implementation Steps)

1. [ ] **Step 1: 骨格（Hexagonal境界）を先行作成**
   - _Action_: `shared`/`ports`/`application`/`domain`/`interaction`/`adapters` の最小ディレクトリを作成し、依存方向を固定する。
   - _Action_: `interaction -> application -> domain` のみ参照可能、`application` の外部I/Oは `ports` 経由のみとする。
   - _Validation_: import 依存を静的に確認し、逆流参照がないことをレビューで確認。

2. [ ] **Step 2: モデル解決ユースケースを実装**
   - _Action_: `resolve-model.usecase.ts` で優先順 `CLI引数 > セッション保存値 > 既定設定値` を厳密実装。
   - _Action_: `model-resolution-policy.ts` を純粋関数化し、テスト容易性を担保する。
   - _Validation_: F-003 受け入れテストで優先順を3ケース検証。

3. [ ] **Step 3: チャット実行ユースケースを実装**
   - _Action_: `run-chat.usecase.ts` で単発/対話の統一フローを実装し、解決モデルをセッション中固定する。
   - _Action_: 未存在モデル時は `error-presenter` を通して導線付きエラーを返す。
   - _Validation_: F-001 受け入れテストで単発/対話の双方を確認。

4. [ ] **Step 4: CLI接続と受け入れテスト**
   - _Action_: `chat.command.ts` でCLI引数を正規化して `run-chat.usecase` へ委譲（表示ロジックはpresenterへ分離）。
   - _Action_: `F-001`/`F-003` の acceptance test を追加し、DoD基準で完了判定できる状態にする。
   - _Validation_: `npm test` で acceptance を含む全テスト成功。

## 4. 検証プラン (Verification Plan)

- 受け入れテスト（必須）:
  - `F-001.chat.acceptance.test.ts`
  - `F-003.model-selection.acceptance.test.ts`
- ユニットテスト（必須）:
  - `model-resolution-policy.ts` の純粋ロジック
  - `run-chat.usecase.ts` の分岐（単発/対話/未存在モデル）
- 手動確認（最小）:
  - `chat "hello"` が既定モデルで応答
  - `chat --model <name> "hello"` が指定モデルで応答
  - 存在しないモデルで実行時に次アクション付きエラーを表示

## 5. ガードレール (Guardrails for Coding Agent)

- 現行コードの互換維持は要求しない。設計整合性を最優先する。
- `domain` に外部依存を入れない。外部I/Oは必ず `ports` と `adapters` へ隔離する。
- `interaction` は表示と入力正規化のみを担当し、業務判断を持たせない。
- 破壊的変更を許容するが、今回の実装対象は F-001/F-003 の縦スライスに限定する。
- スコープ外要求が発生した場合は実装を止め、`CURRENT_PLAN.md` を先に更新する。
