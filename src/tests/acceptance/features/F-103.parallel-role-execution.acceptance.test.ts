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

describe("F-103 Parallel role execution acceptance", () => {
  it("runs delegated roles in parallel and keeps per-role result visibility", async () => {
    const times = [
      "2026-02-22T03:00:00.000Z",
      "2026-02-22T03:00:01.000Z",
      "2026-02-22T03:00:02.000Z",
      "2026-02-22T03:00:03.000Z",
      "2026-02-22T03:00:04.000Z",
      "2026-02-22T03:00:05.000Z",
      "2026-02-22T03:00:06.000Z",
      "2026-02-22T03:00:07.000Z",
      "2026-02-22T03:00:08.000Z",
      "2026-02-22T03:00:09.000Z",
    ];
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => times.shift() ?? "2026-02-22T03:00:10.000Z",
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
    const useCase = new RunRoleGraphUseCase(dispatch, runRole);

    const resultPromise = useCase.execute("implement feature");
    await flushAsync();
    const calledRoles = runRole.mock.calls.map((call) => call[0]);
    expect(calledRoles).toContain("developer");
    expect(calledRoles).toContain("reviewer");

    developerDeferred.resolve("dev-output");
    reviewerDeferred.resolve("review-output");
    const result = await resultPromise;

    const childEvents = result.events.filter(
      (event) => event.parent_task_id === result.rootTaskId,
    );
    expect(childEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          delegated_role: "developer",
          status: "completed",
        }),
        expect.objectContaining({
          delegated_role: "reviewer",
          status: "completed",
        }),
      ]),
    );
    expect(
      childEvents.every(
        (event) =>
          event.delegated_at !== undefined && event.result_at !== undefined,
      ),
    ).toBe(true);
    expect(result.finalResponse).toContain("doc:");
  });
});
