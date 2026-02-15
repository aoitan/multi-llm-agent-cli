import { runCli } from "./main";

void runCli(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLI実行でエラーが発生しました: ${message}`);
  process.exitCode = 1;
});
