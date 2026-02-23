import { DispatchTaskUseCase } from "../../../application/orchestration/dispatch-task.usecase";
import { RunRoleGraphUseCase } from "../../../application/orchestration/run-role-graph.usecase";
import { RoleName } from "../../../domain/orchestration/entities/role";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("RunRoleGraphUseCase", () => {
  it("delegates tasks across developer/reviewer/documenter and returns final output", async () => {
    const times = [
      "2026-02-22T01:00:00.000Z",
      "2026-02-22T01:00:01.000Z",
      "2026-02-22T01:00:02.000Z",
      "2026-02-22T01:00:03.000Z",
      "2026-02-22T01:00:04.000Z",
      "2026-02-22T01:00:05.000Z",
      "2026-02-22T01:00:06.000Z",
      "2026-02-22T01:00:07.000Z",
    ];
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => times.shift() ?? "2026-02-22T01:00:09.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const runRole = jest.fn(async (role: RoleName, prompt: string) => {
      if (role === "developer") {
        return `dev:${prompt}`;
      }
      if (role === "reviewer") {
        return `review:${prompt}`;
      }
      return `doc:${prompt}`;
    });
    const useCase = new RunRoleGraphUseCase(dispatch, runRole);

    const result = await useCase.execute("fix bug");

    expect(result.finalResponse).toContain("doc:");
    expect(runRole.mock.calls.map((call) => call[0])).toEqual([
      "coordinator",
      "developer",
      "reviewer",
      "documenter",
    ]);
    const childEvents = result.events.filter(
      (event) => event.parent_task_id === result.rootTaskId,
    );
    expect(childEvents).toHaveLength(3);
    expect(childEvents.map((event) => event.delegated_role)).toEqual([
      "developer",
      "reviewer",
      "documenter",
    ]);
    expect(
      result.tasks
        .filter((task) => task.parentTaskId === result.rootTaskId)
        .map((task) => task.taskId),
    ).toEqual(["task-dev", "task-review", "task-doc"]);
  });

  it("marks child and root tasks failed when delegated role execution throws", async () => {
    const ids = ["task-root", "task-dev", "task-review"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T01:10:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const runRole = jest.fn(async (role: RoleName) => {
      if (role === "reviewer") {
        throw new Error("review failed");
      }
      return "ok";
    });
    const useCase = new RunRoleGraphUseCase(dispatch, runRole);

    await expect(useCase.execute("fix bug")).rejects.toThrow("review failed");
    const rootTask = dispatch.getTask("task-root");
    const reviewerTask = dispatch.getTask("task-review");
    expect(rootTask?.status).toBe("failed");
    expect(reviewerTask?.status).toBe("failed");
    expect(reviewerTask?.failureReason).toContain("review failed");
  });

  it("emits root failed event even when a child task has already failed", async () => {
    const ids = ["task-root", "task-dev", "task-review"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T01:12:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const onEvent = jest.fn();
    const runRole = jest.fn(async (role: RoleName) => {
      if (role === "reviewer") {
        throw new Error("review failed");
      }
      return "ok";
    });
    const useCase = new RunRoleGraphUseCase(dispatch, runRole, onEvent);

    await expect(useCase.execute("fix bug")).rejects.toThrow("review failed");
    expect(
      onEvent.mock.calls.some(
        (call) =>
          call[0].delegated_role === "coordinator" &&
          call[0].status === "failed",
      ),
    ).toBe(true);
  });

  it("emits a root failure event when coordinator fails before child delegation", async () => {
    const ids = ["task-root"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T01:15:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const onEvent = jest.fn();
    const runRole = jest.fn(async (role: RoleName) => {
      if (role === "coordinator") {
        throw new Error("coordinator failed");
      }
      return "ok";
    });
    const useCase = new RunRoleGraphUseCase(dispatch, runRole, onEvent);

    await expect(useCase.execute("fix bug")).rejects.toThrow(
      "coordinator failed",
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        delegated_role: "coordinator",
        status: "failed",
        failure_reason: "coordinator failed",
      }),
    );
    expect(dispatch.getTask("task-root")?.status).toBe("failed");
  });

  it("emits delegation events to audit logger callback", async () => {
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T01:20:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const runRole = jest.fn(async (role: RoleName, prompt: string) => {
      return `${role}:${prompt}`;
    });
    const onEvent = jest.fn();
    const useCase = new RunRoleGraphUseCase(dispatch, runRole, onEvent);

    await useCase.execute("summarize");

    expect(onEvent).toHaveBeenCalledTimes(4);
    expect(onEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event_type: "role_delegation",
        delegated_role: "developer",
      }),
    );
    expect(onEvent).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        event_type: "role_delegation",
        delegated_role: "coordinator",
      }),
    );
  });

  it("continues processing when audit callback throws", async () => {
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T01:30:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const runRole = jest.fn(
      async (role: RoleName, prompt: string) => `${role}:${prompt}`,
    );
    const onEvent = jest.fn().mockRejectedValue(new Error("socket closed"));
    const useCase = new RunRoleGraphUseCase(dispatch, runRole, onEvent);

    const result = await useCase.execute("summarize");

    expect(result.finalResponse).toContain("documenter:");
    expect(onEvent).toHaveBeenCalledTimes(4);
  });

  it("runs developer and reviewer concurrently when maxParallelRoles allows it", async () => {
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T01:40:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const developerDeferred = createDeferred<string>();
    const reviewerDeferred = createDeferred<string>();
    const runRole = jest.fn(async (role: RoleName, prompt: string) => {
      if (role === "coordinator") {
        return "plan";
      }
      if (role === "developer") {
        return developerDeferred.promise;
      }
      if (role === "reviewer") {
        return reviewerDeferred.promise;
      }
      return `doc:${prompt}`;
    });
    const useCase = new RunRoleGraphUseCase(dispatch, runRole, undefined, {
      maxParallelRoles: 2,
    });

    const resultPromise = useCase.execute("implement");
    await flushAsync();

    const calledRoles = runRole.mock.calls.map((call) => call[0]);
    expect(calledRoles).toContain("developer");
    expect(calledRoles).toContain("reviewer");

    developerDeferred.resolve("dev-result");
    reviewerDeferred.resolve("review-result");
    const result = await resultPromise;

    expect(result.finalResponse).toContain("doc:");
  });

  it("runs delegated roles sequentially when maxParallelRoles is 1", async () => {
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T01:50:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const developerDeferred = createDeferred<string>();
    const reviewerDeferred = createDeferred<string>();
    const runRole = jest.fn(async (role: RoleName) => {
      if (role === "coordinator") {
        return "plan";
      }
      if (role === "developer") {
        return developerDeferred.promise;
      }
      if (role === "reviewer") {
        return reviewerDeferred.promise;
      }
      return "done";
    });
    const useCase = new RunRoleGraphUseCase(dispatch, runRole, undefined, {
      maxParallelRoles: 1,
    });

    const resultPromise = useCase.execute("implement");
    await flushAsync();
    expect(runRole.mock.calls.map((call) => call[0])).toEqual([
      "coordinator",
      "developer",
    ]);

    developerDeferred.resolve("dev-result");
    await flushAsync();
    expect(runRole.mock.calls.map((call) => call[0])).toEqual([
      "coordinator",
      "developer",
      "reviewer",
    ]);

    reviewerDeferred.resolve("review-result");
    await resultPromise;
  });

  it("retries delegated role execution up to maxRetriesPerRole and then succeeds", async () => {
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T02:00:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    let developerAttempts = 0;
    const runRole = jest.fn(async (role: RoleName) => {
      if (role === "coordinator") {
        return "plan";
      }
      if (role === "developer") {
        developerAttempts += 1;
        if (developerAttempts === 1) {
          throw new Error("temporary failure");
        }
        return "dev-recovered";
      }
      if (role === "reviewer") {
        return "review-ok";
      }
      return "documented";
    });
    const useCase = new RunRoleGraphUseCase(dispatch, runRole, undefined, {
      maxRetriesPerRole: 1,
    });

    const result = await useCase.execute("implement");

    expect(result.finalResponse).toBe("documented");
    expect(
      runRole.mock.calls.filter((call) => call[0] === "developer"),
    ).toHaveLength(2);
  });

  it("fails when delegated role exceeds maxRetriesPerRole", async () => {
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T02:10:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const runRole = jest.fn(async (role: RoleName) => {
      if (role === "coordinator") {
        return "plan";
      }
      if (role === "developer") {
        throw new Error("persistent failure");
      }
      return "ok";
    });
    const useCase = new RunRoleGraphUseCase(dispatch, runRole, undefined, {
      maxRetriesPerRole: 1,
    });

    await expect(useCase.execute("implement")).rejects.toThrow(
      "persistent failure",
    );
    expect(
      runRole.mock.calls.filter((call) => call[0] === "developer"),
    ).toHaveLength(2);
  });

  it("does not count retries as loop cycles and reports retry limit", async () => {
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T02:20:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const runRole = jest.fn(async (role: RoleName) => {
      if (role === "coordinator") {
        return "plan";
      }
      if (role === "developer") {
        throw new Error("retry me");
      }
      return "ok";
    });
    const useCase = new RunRoleGraphUseCase(dispatch, runRole, undefined, {
      maxRetriesPerRole: 2,
      maxCycleCount: 1,
    });

    await expect(useCase.execute("implement")).rejects.toThrow(
      "Retry limit exceeded",
    );
    expect(
      runRole.mock.calls.filter((call) => call[0] === "developer"),
    ).toHaveLength(3);
  });

  it("applies retry guard to documenter role as well", async () => {
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T02:30:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    let docAttempts = 0;
    const runRole = jest.fn(async (role: RoleName) => {
      if (role === "coordinator") {
        return "plan";
      }
      if (role === "developer" || role === "reviewer") {
        return "ok";
      }
      docAttempts += 1;
      if (docAttempts === 1) {
        throw new Error("doc temporary");
      }
      return "doc final";
    });
    const useCase = new RunRoleGraphUseCase(dispatch, runRole, undefined, {
      maxRetriesPerRole: 1,
    });

    const result = await useCase.execute("implement");

    expect(result.finalResponse).toBe("doc final");
    expect(
      runRole.mock.calls.filter((call) => call[0] === "documenter"),
    ).toHaveLength(2);
  });
});
