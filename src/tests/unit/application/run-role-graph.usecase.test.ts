import { DispatchTaskUseCase } from "../../../application/orchestration/dispatch-task.usecase";
import { RunRoleGraphUseCase } from "../../../application/orchestration/run-role-graph.usecase";
import { RoleName } from "../../../domain/orchestration/entities/role";

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
});
