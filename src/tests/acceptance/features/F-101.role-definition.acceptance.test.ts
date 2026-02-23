import { DispatchTaskUseCase } from "../../../application/orchestration/dispatch-task.usecase";
import { RunRoleGraphUseCase } from "../../../application/orchestration/run-role-graph.usecase";
import { listRoleDefinitions } from "../../../domain/orchestration/entities/role";

describe("F-101 Role Definition acceptance", () => {
  it("shows standard roles and records actually used role composition", async () => {
    const roles = listRoleDefinitions();
    expect(roles.map((role) => role.name)).toEqual([
      "coordinator",
      "developer",
      "reviewer",
      "documenter",
    ]);

    const ids = ["task-root", "task-dev", "task-review", "task-doc"];
    const dispatch = new DispatchTaskUseCase(
      () => "2026-02-22T02:00:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const runRole = jest.fn(
      async (role: string, prompt: string) => `${role}:${prompt}`,
    );
    const useCase = new RunRoleGraphUseCase(dispatch, runRole);

    const result = await useCase.execute("implement feature");
    const usedRoles = result.tasks.map((task) => task.role);

    expect(usedRoles).toEqual([
      "coordinator",
      "developer",
      "reviewer",
      "documenter",
    ]);
    expect(runRole.mock.calls.map((call) => call[0])).toEqual([
      "coordinator",
      "developer",
      "reviewer",
      "documenter",
    ]);
  });
});
