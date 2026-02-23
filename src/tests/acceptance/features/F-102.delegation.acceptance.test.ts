import { DispatchTaskUseCase } from "../../../application/orchestration/dispatch-task.usecase";
import { RunRoleGraphUseCase } from "../../../application/orchestration/run-role-graph.usecase";
import { RoleName } from "../../../domain/orchestration/entities/role";
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
      async (role: RoleName, prompt: string) => `${role}:${prompt}`,
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
    expect(auditEvents).toHaveLength(4);
    const childAuditEvents = auditEvents.filter(
      (event) => event.parent_task_id === result.rootTaskId,
    );
    expect(childAuditEvents).toHaveLength(3);
    expect(
      childAuditEvents.every(
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
      async (role: RoleName, prompt: string) => {
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
    const failedReviewerEvent = auditEvents.find(
      (event) =>
        event.delegated_role === "reviewer" && event.status === "failed",
    );
    expect(failedReviewerEvent).toEqual(
      expect.objectContaining({
        delegated_role: "reviewer",
        status: "failed",
        failure_reason:
          "Retry limit exceeded: role=reviewer, retries=0, threshold=0, cause=policy violation",
        loop_trigger: "retry_limit",
        retry_count: 0,
      }),
    );
    expect(
      auditEvents.some(
        (event) =>
          event.delegated_role === "coordinator" && event.status === "failed",
      ),
    ).toBe(true);
  });
});
