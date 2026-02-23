import { DispatchTaskUseCase } from "../../../application/orchestration/dispatch-task.usecase";
import { RunRoleGraphUseCase } from "../../../application/orchestration/run-role-graph.usecase";
import { RoleDelegationEvent } from "../../../shared/types/events";

describe("F-102 Role Delegation acceptance", () => {
  it("tracks parent-child task consistency and delegation summary events", async () => {
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T02:10:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const auditEvents: RoleDelegationEvent[] = [];
    const useCase = new RunRoleGraphUseCase(
      dispatch,
      async (role: string, prompt: string) => `${role}:${prompt}`,
      async (event) => {
        auditEvents.push(event);
      },
    );

    const result = await useCase.execute("implement feature");
    const childTasks = result.tasks.filter(
      (task) => task.parentTaskId === result.rootTaskId,
    );

    expect(childTasks).toHaveLength(3);
    expect(
      childTasks.every((task) => task.parentTaskId === result.rootTaskId),
    ).toBe(true);
    expect(auditEvents).toHaveLength(3);
    expect(
      auditEvents.every(
        (event) =>
          event.parent_task_id === result.rootTaskId &&
          event.result_at !== undefined &&
          event.failure_reason === undefined,
      ),
    ).toBe(true);
  });

  it("records failure reason when delegated role fails", async () => {
    const ids = ["task-root", "task-dev", "task-review"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T02:20:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const auditEvents: RoleDelegationEvent[] = [];
    const useCase = new RunRoleGraphUseCase(
      dispatch,
      async (role: string, prompt: string) => {
        if (role === "reviewer") {
          throw new Error("policy violation");
        }
        return `${role}:${prompt}`;
      },
      async (event) => {
        auditEvents.push(event);
      },
    );

    await expect(useCase.execute("implement feature")).rejects.toThrow(
      "policy violation",
    );
    expect(auditEvents[auditEvents.length - 1]).toEqual(
      expect.objectContaining({
        delegated_role: "reviewer",
        status: "failed",
        failure_reason: "policy violation",
      }),
    );
  });
});
