import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";

async function withTempHome(
  run: (tempHome: string) => Promise<void>,
): Promise<void> {
  const tempHome = await fsp.mkdtemp(
    path.join(os.tmpdir(), "mla-session-store-"),
  );
  const previousConfigDir = process.env.MULTI_LLM_AGENT_CONFIG_DIR;
  const previousLockTimeout = process.env.MULTI_LLM_SESSION_LOCK_TIMEOUT_MS;
  const previousLockRetry = process.env.MULTI_LLM_SESSION_LOCK_RETRY_DELAY_MS;
  const previousLockStale = process.env.MULTI_LLM_SESSION_LOCK_STALE_MS;
  process.env.MULTI_LLM_AGENT_CONFIG_DIR = path.join(
    tempHome,
    ".multi-llm-agent-cli",
  );
  jest.resetModules();

  try {
    await run(tempHome);
  } finally {
    if (previousConfigDir === undefined) {
      delete process.env.MULTI_LLM_AGENT_CONFIG_DIR;
    } else {
      process.env.MULTI_LLM_AGENT_CONFIG_DIR = previousConfigDir;
    }
    if (previousLockTimeout === undefined) {
      delete process.env.MULTI_LLM_SESSION_LOCK_TIMEOUT_MS;
    } else {
      process.env.MULTI_LLM_SESSION_LOCK_TIMEOUT_MS = previousLockTimeout;
    }
    if (previousLockRetry === undefined) {
      delete process.env.MULTI_LLM_SESSION_LOCK_RETRY_DELAY_MS;
    } else {
      process.env.MULTI_LLM_SESSION_LOCK_RETRY_DELAY_MS = previousLockRetry;
    }
    if (previousLockStale === undefined) {
      delete process.env.MULTI_LLM_SESSION_LOCK_STALE_MS;
    } else {
      process.env.MULTI_LLM_SESSION_LOCK_STALE_MS = previousLockStale;
    }
    await fsp.rm(tempHome, { recursive: true, force: true });
  }
}

describe("FileSessionStoreAdapter", () => {
  it("accepts legacy-compatible session ids with dot and colon", async () => {
    await withTempHome(async () => {
      const { FileSessionStoreAdapter } =
        await import("../../../adapters/session/file-session-store.adapter");
      const adapter = new FileSessionStoreAdapter();
      const sessionId = "legacy.v1:session-01";

      await adapter.saveSession(sessionId, {
        model: "model-a",
        messages: [{ role: "user", content: "hello" }],
        policy: { maxTurns: 3, summaryEnabled: false },
        updatedAt: new Date().toISOString(),
      });

      const loaded = await adapter.getSession(sessionId);
      expect(loaded?.model).toBe("model-a");
      expect(loaded?.messages).toEqual([{ role: "user", content: "hello" }]);
    });
  });

  it("recovers stale lock left by dead process", async () => {
    await withTempHome(async (tempHome) => {
      const { FileSessionStoreAdapter } =
        await import("../../../adapters/session/file-session-store.adapter");
      const adapter = new FileSessionStoreAdapter();
      const configDir = path.join(tempHome, ".multi-llm-agent-cli");
      const lockPath = path.join(configDir, "session.lock");

      await fsp.mkdir(configDir, { recursive: true });
      await fsp.writeFile(
        lockPath,
        JSON.stringify({ pid: 999999, createdAt: Date.now() - 120_000 }),
        "utf-8",
      );

      await adapter.saveSession("s-1", {
        model: "model-a",
        messages: [],
        policy: { maxTurns: 10, summaryEnabled: false },
        updatedAt: new Date().toISOString(),
      });

      await expect(fsp.stat(lockPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      const loaded = await adapter.getSession("s-1");
      expect(loaded?.model).toBe("model-a");
    });
  });

  it("respects lock timeout and stale thresholds from env", async () => {
    await withTempHome(async (tempHome) => {
      process.env.MULTI_LLM_SESSION_LOCK_TIMEOUT_MS = "120";
      process.env.MULTI_LLM_SESSION_LOCK_RETRY_DELAY_MS = "10";
      process.env.MULTI_LLM_SESSION_LOCK_STALE_MS = "3600000";
      jest.resetModules();

      const { FileSessionStoreAdapter } =
        await import("../../../adapters/session/file-session-store.adapter");
      const adapter = new FileSessionStoreAdapter();
      const configDir = path.join(tempHome, ".multi-llm-agent-cli");
      const lockPath = path.join(configDir, "session.lock");

      await fsp.mkdir(configDir, { recursive: true });
      await fsp.writeFile(
        lockPath,
        JSON.stringify({ pid: 999999, createdAt: Date.now() - 120_000 }),
        "utf-8",
      );

      await expect(
        adapter.saveSession("s-1", {
          model: "model-a",
          messages: [],
          policy: { maxTurns: 10, summaryEnabled: false },
          updatedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow("Timed out waiting for session lock after 120ms");
    });
  });

  it("backs up non-object JSON roots and continues safely", async () => {
    await withTempHome(async (tempHome) => {
      const { FileSessionStoreAdapter } =
        await import("../../../adapters/session/file-session-store.adapter");
      const adapter = new FileSessionStoreAdapter();
      const configDir = path.join(tempHome, ".multi-llm-agent-cli");
      const sessionFile = path.join(configDir, "session.json");

      await fsp.mkdir(configDir, { recursive: true });
      await fsp.writeFile(sessionFile, "null", "utf-8");

      await expect(adapter.getSession("s-1")).resolves.toBeUndefined();

      const files = await fsp.readdir(configDir);
      expect(
        files.some((file) => file.startsWith("session.json.corrupt-")),
      ).toBe(true);
    });
  });

  it("sanitizes malformed session fields from valid JSON", async () => {
    await withTempHome(async (tempHome) => {
      const { FileSessionStoreAdapter } =
        await import("../../../adapters/session/file-session-store.adapter");
      const adapter = new FileSessionStoreAdapter();
      const configDir = path.join(tempHome, ".multi-llm-agent-cli");
      const sessionFile = path.join(configDir, "session.json");

      await fsp.mkdir(configDir, { recursive: true });
      await fsp.writeFile(
        sessionFile,
        JSON.stringify({
          sessions: {
            "s-1": {
              model: 123,
              summary: { text: "bad" },
              messages: [
                { role: "user", content: "ok" },
                { role: "assistant", content: 100 },
                { role: 10, content: "ng" },
              ],
              policy: { maxTurns: -3, summaryEnabled: "on" },
              savedAt: 1,
              loadedAt: { bad: true },
              updatedAt: 999,
            },
          },
        }),
        "utf-8",
      );

      const session = await adapter.getSession("s-1");
      expect(session?.model).toBeUndefined();
      expect(session?.summary).toBeUndefined();
      expect(session?.messages).toEqual([{ role: "user", content: "ok" }]);
      expect(session?.policy).toEqual({ maxTurns: 10, summaryEnabled: false });
      expect(session?.savedAt).toBeUndefined();
      expect(session?.loadedAt).toBeUndefined();
      expect(session?.updatedAt).toEqual(expect.any(String));
    });
  });
});
