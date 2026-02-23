import { DispatchTaskUseCase } from "../../../application/orchestration/dispatch-task.usecase";
import { RunRoleGraphUseCase } from "../../../application/orchestration/run-role-graph.usecase";
import { RoleName } from "../../../domain/orchestration/entities/role";
import { RoleDelegationEvent } from "../../../shared/types/events";

describe("F-105 Loop guard acceptance", () => {
  it("stops automatically when loop threshold is exceeded and records stop reason", async () => {
    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T03:20:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const auditEvents: RoleDelegationEvent[] = [];
    const runRole = jest.fn(async (role: RoleName) => {
      if (role === "coordinator") {
        return "plan";
      }
      if (role === "developer") {
        throw new Error("temporary failure");
      }
      return "ok";
    });
    const useCase = new RunRoleGraphUseCase(
      dispatch,
      runRole,
      async (event) => {
        auditEvents.push(event);
      },
      {
        maxParallelRoles: 1,
        maxRetriesPerRole: 2,
        maxCycleCount: 1,
      },
    );

    await expect(useCase.execute("implement feature")).rejects.toThrow(
      "Retry limit exceeded",
    );

    expect(runRole.mock.calls.map((call) => call[0])).toEqual([
      "coordinator",
      "developer",
      "developer",
      "developer",
    ]);
    expect(runRole).not.toHaveBeenCalledWith("reviewer", expect.any(String));

    const failedDelegationEvent = auditEvents.find(
      (event) =>
        event.delegated_role === "developer" &&
        event.status === "failed" &&
        event.failure_reason?.includes("Retry limit exceeded"),
    );
    expect(failedDelegationEvent).toEqual(
      expect.objectContaining({
        loop_trigger: "retry_limit",
        loop_threshold: 2,
      }),
    );
  });
});
