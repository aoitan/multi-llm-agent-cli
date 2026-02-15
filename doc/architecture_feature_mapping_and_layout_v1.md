# MultiOllamaAgentCLI 具体設計（機能接続 + ディレクトリ/ファイル階層）v1.0

## 1. 目的

本書は `doc/abstract_design_v1.md` を実装可能な粒度へ具体化し、`doc/feature_list.md` の各機能（F-001〜F-607）を、
「どのサブシステムが責務を持ち、どのディレクトリ/ファイルに実装されるか」へ接続する。

## 2. アーキテクチャ方針（理想）

1. Hexagonal + DDD-lite

- `domain` は純粋ルール、`application` はユースケース、`adapters` は外部I/O。

2. Feature Slice + Shared Kernel

- 機能群（chat/orchestration/tools/security/ops/extensibility）ごとに縦切りし、
  状態・イベント・ポリシーは共通カーネルへ集約する。

3. Policy First Execution

- すべての破壊的/外部操作は `policy` を必ず通過。

4. Event-Sourced Observability

- UI表示・機械可読出力・監査は同一イベント系列を一次ソースにする。

## 3. サブシステム定義

1. `interaction`

- CLI対話/ヘッドレス、状態表示、ユーザー入力受付。

2. `session-context`

- セッション永続化、履歴、要約、コンテキスト破棄。

3. `orchestration`

- ロール定義、タスク分解、委譲、並行実行、停止制御。

4. `tooling`

- MCP接続・管理、内製ツール（file_read/file_write/shell_exec）。

5. `model-endpoint`

- モデル解決、endpoint管理、フォールバック/分散。

6. `security-policy`

- 認証、認可、パス制限、許可レベル、権限モード、危険コマンド防止。

7. `operations`

- エラー分類、リトライ、ヘルスチェック、構造化ログ、監査、チェックポイント。

8. `extensibility`

- 設定スキーマ、カスタムコマンド、Recipe、スケジュール、プラグイン。

## 4. 機能IDトレーサビリティ（F-ID -> 実装責務）

## 4.1 コア対話・実行

- F-001, F-002, F-007 -> `interaction`, `application/chat`, `operations/event-stream`
- F-003 -> `model-endpoint/model-resolution`
- F-004, F-005 -> `session-context`
- F-006 -> `operations/event-stream`（JSONL writer）

## 4.2 ロールオーケストレーション

- F-101 -> `orchestration/role-catalog`
- F-102 -> `orchestration/delegation`（親子タスク追跡）
- F-103 -> `orchestration/scheduler`（並行ワーカー）
- F-104 -> `orchestration/planner`（高度分解）
- F-105 -> `orchestration/loop-guard`

## 4.3 MCP・ツール

- F-201 -> `tooling/mcp-client`
- F-202 -> `interaction/commands/mcp-*` + `application/mcp-admin`
- F-203 -> `tooling/builtin/file-read`
- F-204 -> `tooling/builtin/file-write`
- F-205 -> `tooling/builtin/shell-exec`
- F-206 -> `tooling/external-registry`
- F-207 -> `tooling/browser-ops`

## 4.4 モデル運用

- F-301 -> `model-endpoint/registry`
- F-302 -> `model-endpoint/selection`
- F-303 -> `model-endpoint/fallback`
- F-304 -> `model-endpoint/load-balancer`

## 4.5 セキュリティ

- F-401 -> `security-policy/authn`
- F-402 -> `security-policy/authz`
- F-403 -> `security-policy/path-guard`
- F-404 -> `security-policy/approval-policy`
- F-405 -> `security-policy/permission-mode`
- F-406 -> `security-policy/dangerous-command-guard`

## 4.6 信頼性・運用

- F-501 -> `operations/error-taxonomy`
- F-502 -> `operations/retry`
- F-503 -> `operations/health`
- F-504 -> `operations/structured-logging`
- F-505 -> `operations/audit`
- F-506 -> `operations/checkpoint`

## 4.7 開発者体験・拡張

- F-601 -> `extensibility/config-schema`
- F-602 -> `extensibility/custom-commands`
- F-603 -> `extensibility/recipes`
- F-604 -> `extensibility/scheduler`
- F-605 -> `extensibility/context-ref`
- F-606 -> `extensibility/cost-optimizer`
- F-607 -> `extensibility/plugin-system`

## 5. 理想ディレクトリ/ファイル階層

```text
src/
  main.ts                                # エントリポイント
  bootstrap/
    container.ts                         # DIコンテナ初期化
    config-loader.ts                     # 設定ロードと検証起動

  shared/
    types/
      ids.ts                             # session_id/task_id/audit_id
      states.ts                          # TaskState enum
      events.ts                          # 共通イベント型
    errors/
      error-codes.ts                     # エラー分類コード(F-501)
      app-error.ts
    policy/
      decision.ts                        # allow/ask/deny
    telemetry/
      correlation.ts                     # correlation_idの伝播

  interaction/
    cli/
      command-registry.ts                # 全コマンド登録
      commands/
        chat.command.ts                  # F-001/F-002/F-003/F-007
        session.command.ts               # F-004/F-005
        model.command.ts                 # F-003
        endpoint.command.ts              # F-301/F-302
        mcp.command.ts                   # F-202
        run.command.ts                   # headless実行(F-006/F-007)
    presenter/
      state-presenter.ts                 # 状態表示統一
      error-presenter.ts                 # 次アクション付きエラー表示

  application/
    chat/
      run-chat.usecase.ts                # 対話/単発の起点
      stream-response.usecase.ts         # ストリーミング統合
    session/
      save-session.usecase.ts
      load-session.usecase.ts
      compact-context.usecase.ts
    orchestration/
      dispatch-task.usecase.ts
      run-role-graph.usecase.ts
    tooling/
      execute-tool.usecase.ts            # ポリシー経由でツール実行
    model-endpoint/
      resolve-model.usecase.ts
      select-endpoint.usecase.ts
    operations/
      emit-event.usecase.ts
      classify-error.usecase.ts

  domain/
    session-context/
      entities/
        session.ts
        context-window.ts
      services/
        context-policy.ts
    orchestration/
      entities/
        role.ts
        task.ts
      services/
        delegation-policy.ts
        loop-detector.ts
    model-endpoint/
      entities/
        endpoint.ts
        model-selection.ts
      services/
        fallback-policy.ts
        load-balancer.ts
    security-policy/
      entities/
        permission-mode.ts
        approval-mode.ts
      services/
        authz-policy.ts
        command-guard.ts
        path-guard.ts
    operations/
      entities/
        execution-event.ts
        audit-event.ts
      services/
        retry-policy.ts
        health-policy.ts

  ports/
    inbound/
      command-handler.ts
    outbound/
      llm-client.port.ts
      mcp-client.port.ts
      event-store.port.ts
      audit-store.port.ts
      session-store.port.ts
      secret-store.port.ts
      clock.port.ts

  adapters/
    ollama/
      ollama-client.adapter.ts
      endpoint-health.adapter.ts
    mcp/
      mcp-client.adapter.ts
      mcp-registry.adapter.ts
    tooling/
      builtin/
        file-read.tool.ts
        file-write.tool.ts
        shell-exec.tool.ts
    storage/
      fs/
        session-store.fs.ts
        event-store.jsonl.ts
        audit-store.jsonl.ts
        checkpoint-store.fs.ts
    security/
      token-auth.adapter.ts
    logging/
      structured-logger.adapter.ts

  extensibility/
    config-schema/
      config.schema.ts                   # F-601
      validate-config.ts
    custom-commands/
      command-loader.ts                  # F-602
    recipes/
      recipe-loader.ts                   # F-603
    scheduler/
      cron-runner.ts                     # F-604
    context-ref/
      resolver.ts                        # F-605
    cost-optimizer/
      usage-meter.ts                     # F-606
    plugin-system/
      plugin-host.ts                     # F-607
      plugin-api.ts

  contracts/
    event-schema/
      execution-event.schema.json
      audit-event.schema.json
    api/
      headless-result.schema.json

  tests/
    unit/
      domain/
      application/
    integration/
      cli/
      adapters/
    acceptance/
      features/
        F-001.chat.acceptance.test.ts
        F-002.streaming.acceptance.test.ts
        ...

  tools/
    fixtures/
    testkit/
      fake-ports.ts
      scenario-runner.ts
```

## 6. ファイル責務ルール（必須）

1. `*.usecase.ts`

- I/OはPort経由のみ。CLI表示やFS直接アクセスを禁止。

2. `domain/**`

- 外部ライブラリ依存を禁止（純粋ロジックのみ）。

3. `adapters/**`

- 外部プロトコル/Ollama/MCP/FS/OS依存を吸収。

4. `interaction/**`

- 表示責務のみ。ビジネス判断を持たない。

5. `operations/event + audit`

- すべての実行パスで発行必須。欠損はバグとして扱う。

## 7. 機能実装順（理想）

1. Platform Core

- `shared`, `ports`, `operations(event/log/error)` を先行実装。

2. User Core（Must）

- F-001〜F-005, F-101〜F-102, F-201〜F-205, F-301〜F-302, F-401〜F-404, F-406, F-501, F-504, F-601。

3. Operational Readiness（Should）

- F-006, F-007, F-103, F-105, F-303, F-405, F-502, F-503, F-505, F-506, F-602, F-603。

4. Advanced Extensions（Could）

- F-104, F-207, F-304, F-604, F-605, F-606, F-607。

## 8. 受け入れ可能性を担保するテスト接続

1. Feature Acceptance Tests

- F-ID単位で `tests/acceptance/features/F-xxx.*` を必須化。

2. Contract Tests

- `contracts/event-schema/*.json` とJSONL出力の整合を自動検証。

3. Policy Regression Tests

- セキュリティ機能（F-401〜F-406）は拒否系ケースを成功系以上に保持する。

## 9. 現在構成からの移行設計（最小）

1. 既存 `src/cli`, `src/mcp`, `src/ollama` は `adapters` + `interaction` へ再配置。
2. 既存 `src/config.ts` は `bootstrap/config-loader.ts` と `extensibility/config-schema/*` に分割。
3. 既存テストは `tests/integration/cli` に移し、F-ID受け入れテストを新設。

## 10. 設計決定ログ（ADR化対象）

- ADR-001: Hexagonal + Feature Slice採用
- ADR-002: Event/Auditを一次ソースにする
- ADR-003: Policy Engineの強制経由
- ADR-004: Single Control Node固定
- ADR-005: F-IDベース受け入れテストを正準化
