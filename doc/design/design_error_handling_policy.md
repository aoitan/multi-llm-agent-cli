# 包括的なエラーハンドリングポリシーの策定

本ドキュメントでは、MultiOllamaAgentCLIアプリケーション全体におけるエラーハンドリングのポリシーと具体的なガイドラインを定義する。これにより、エラー発生時の挙動を予測可能にし、システムの堅牢性と運用性を向上させる。

## 1. エラー分類

アプリケーションで発生するエラーを以下のカテゴリに分類し、それぞれに応じた処理を行う。

*   **システムエラー:**
    *   **ネットワークエラー:** 接続タイムアウト、DNS解決失敗、接続拒否など。
    *   **ファイルシステムエラー:** ファイルの読み書き失敗、パスが見つからない、権限エラーなど。
    *   **リソース不足エラー:** メモリ不足、ディスク容量不足など。
    *   **外部サービスエラー:** Ollama API、MCPサーバー、他のAgentからのエラー応答（5xx系）。
*   **アプリケーションエラー:**
    *   **入力検証エラー:** ユーザー入力、設定ファイル、APIリクエストのパラメータが不正な場合。
    *   **ロジックエラー:** プログラムのバグ、予期せぬ状態遷移など。
    *   **セキュリティエラー:** 認証失敗、認可拒否、不正な操作検知など。
*   **ユーザーエラー:**
    *   ユーザーの操作ミス、無効なコマンド入力など。

## 2. エラー処理の原則

*   **早期検知と早期終了:** エラーは可能な限り発生源に近い場所で検知し、不正な状態での処理続行を防ぐために早期に終了する。
*   **適切なエラー伝播:** エラーは、そのエラーを処理できる適切なレイヤーまで伝播させる。低レベルのエラーは高レベルで意味のあるエラーに変換する。
*   **ユーザーへの明確な通知:** CLIを通じてユーザーにエラーが発生したことを明確に伝え、可能であれば解決策や次のアクションを提示する。
*   **詳細なログ記録:** エラー発生時のコンテキスト（スタックトレース、関連データ、ユーザーIDなど）を詳細にログに記録する。
*   **リソースの解放:** エラー発生時でも、開いているファイルハンドル、ネットワーク接続、メモリなどのリソースは適切に解放する。
*   **セキュリティ:** エラーメッセージに機密情報を含めない。スタックトレースは開発・デバッグ時のみ表示し、本番環境では抑制する。

## 3. エラー処理フロー

### 3.1. システムエラー

*   **ネットワークエラー:**
    *   **リトライ:** 一時的なネットワークエラー（接続リセット、タイムアウトなど）の場合、指数バックオフなどの戦略で複数回リトライを試みる。
    *   **フォールバック:** 複数のOllamaエンドポイントやAgentが設定されている場合、接続可能な次のエンドポイント/Agentへのフォールバックを試みる。
    *   **ユーザー通知:** リトライ/フォールバックが失敗した場合、ユーザーにネットワーク接続の問題を通知し、確認を促す。
    *   **ログ:** エラーの詳細（接続先、エラーコード、リトライ回数など）を `ERROR` レベルで記録する。
*   **ファイルシステムエラー:**
    *   **ユーザー通知:** ファイルが見つからない、権限がないなどの場合、具体的なエラーメッセージをユーザーに表示する。
    *   **ログ:** エラーの詳細（ファイルパス、操作内容、エラーコードなど）を `ERROR` レベルで記録する。
*   **外部サービスエラー (5xx系):**
    *   **リトライ:** 一時的なサーバーエラーの場合、リトライを試みる。
    *   **フォールバック:** 複数のエンドポイントが設定されている場合、フォールバックを試みる。
    *   **ユーザー通知:** サービスが利用できない旨をユーザーに通知する。
    *   **ログ:** 外部サービスからのエラー応答の詳細を `ERROR` レベルで記録する。

### 3.2. アプリケーションエラー

*   **入力検証エラー:**
    *   **ユーザー通知:** 不正な入力内容を具体的に指摘し、正しい形式を提示する。
    *   **ログ:** `WARN` または `ERROR` レベルで、不正な入力内容と発生箇所を記録する。
*   **ロジックエラー:**
    *   **ユーザー通知:** 「予期せぬエラーが発生しました。開発者に連絡してください。」といった一般的なメッセージを表示する。
    *   **ログ:** スタックトレースを含む詳細なエラー情報を `FATAL` レベルで記録する。可能であれば、エラー発生時のアプリケーションの状態も記録する。
*   **セキュリティエラー:**
    *   **ユーザー通知:** 「認証に失敗しました」や「操作が許可されていません」といった明確なメッセージを表示する。
    *   **ログ:** 認証試行、認可拒否などのセキュリティ関連イベントを `WARN` または `ERROR` レベルで記録する。不正アクセス試行は `FATAL` レベルで記録し、セキュリティアラートを発する。

### 3.3. ユーザーエラー

*   **ユーザー通知:** コマンドの誤り、無効なオプションなど、ユーザーの操作ミスに起因するエラーは、分かりやすいメッセージで正しい使い方を提示する。
*   **ログ:** `INFO` または `WARN` レベルで、ユーザーの操作とエラー内容を記録する。

## 4. ロギングポリシー

アプリケーション全体で統一されたロギングポリシーを適用する。

*   **ロギングライブラリ:** Node.js環境では `winston` や `pino` などのロギングライブラリを使用する。
*   **ログレベル:**
    *   `DEBUG`: 開発時のみ有効。詳細な処理フロー、変数の中身など。
    *   `INFO`: 通常のアプリケーションの動作状況、主要なイベント（起動、終了、タスク開始/完了など）。
    *   `WARN`: 潜在的な問題、推奨されない操作、軽微なエラーで処理が続行可能な場合。
    *   `ERROR`: 処理の続行が困難なエラー、予期せぬ例外、外部サービスからのエラー応答など。
    *   `FATAL`: アプリケーションのクラッシュにつながる致命的なエラー、セキュリティ侵害の可能性など。
*   **ログフォーマット:** JSON形式を推奨。タイムスタンプ、ログレベル、メッセージ、コンポーネント名、関連するデータ（例: `taskId`, `sessionId`）を含める。
*   **ログ出力先:**
    *   開発時: コンソール出力。
    *   本番時: ファイル出力（ローテーション設定）、または集中ログ管理システム（例: ELK Stack, Datadog）への転送。
*   **機密情報:** ログにパスワード、APIキー、個人情報などの機密情報を直接出力しない。マスキングまたはハッシュ化を検討する。

## 5. リトライとフォールバック戦略

ネットワーク通信や外部サービス呼び出しにおいて、一時的な障害に対応するためのリトライとフォールバック戦略を導入する。

*   **リトライ:**
    *   **対象:** ネットワークエラー、外部サービスからの5xx系エラー、デッドロックなど一時的なエラー。
    *   **戦略:** 指数バックオフ（Exponential Backoff）とジッター（Jitter）を組み合わせる。最大リトライ回数と最大待機時間を設定する。
    *   **実装:** `axios-retry` などのライブラリを活用する。
*   **フォールバック:**
    *   **対象:** 複数のOllamaエンドポイントやAgentが設定されている場合。
    *   **戦略:** 現在のエンドポイント/Agentが応答しない、またはエラーを返す場合、設定された次のエンドポイント/Agentへの切り替えを試みる。ラウンドロビンやヘルスチェックに基づく選択を検討する。
    *   **ユーザー通知:** フォールバックが発生したことをユーザーに通知する。

## 6. 監視とアラート

主要なエラーや異常な挙動を監視し、必要に応じてアラートを発する。

*   **監視対象:**
    *   `FATAL` レベルのエラーログ。
    *   リトライが最大回数に達したエラー。
    *   AgentやMCPサーバーのヘルスチェック失敗。
    *   セキュリティ関連の警告やエラー。
*   **アラート:** Slack、メール、PagerDutyなど、適切なチャネルを通じて開発チームに通知する。
