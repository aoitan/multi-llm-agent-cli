import { DispatchTaskUseCase } from "../../../application/orchestration/dispatch-task.usecase";
import {
  isRoleName,
  listRoleDefinitions,
} from "../../../domain/orchestration/entities/role";

describe("DispatchTaskUseCase", () => {
  it("provides standard role definitions", () => {
    const roles = listRoleDefinitions();

    expect(roles.map((role) => role.name)).toEqual([
      "coordinator",
      "developer",
      "reviewer",
      "documenter",
    ]);
    expect(isRoleName("coordinator")).toBe(true);
    expect(isRoleName("developer")).toBe(true);
    expect(isRoleName("reviewer")).toBe(true);
    expect(isRoleName("documenter")).toBe(true);
    expect(isRoleName("unknown")).toBe(false);
  });

  it("tracks parent-child tasks and completion metadata", () => {
    const times = [
      "2026-02-22T00:00:00.000Z",
      "2026-02-22T00:00:01.000Z",
      "2026-02-22T00:00:02.000Z",
      "2026-02-22T00:00:03.000Z",
    ];
    const ids = ["task-root", "task-child"];
    const useCase = new DispatchTaskUseCase(
      () => times.shift() ?? "2026-02-22T00:00:09.000Z",
      () => ids.shift() ?? "task-extra",
    );

    const root = useCase.createRootTask("coordinator", "root prompt");
    const child = useCase.delegateTask(root.taskId, "developer", "sub prompt");
    useCase.markTaskRunning(child.taskId);
    const completed = useCase.completeTask(child.taskId, "done");

    expect(root.parentTaskId).toBeUndefined();
    expect(child.parentTaskId).toBe(root.taskId);
    expect(completed.status).toBe("completed");
    expect(completed.output).toBe("done");
    expect(completed.resultAt).toBe("2026-02-22T00:00:02.000Z");
    expect(
      useCase.listChildren(root.taskId).map((task) => task.taskId),
    ).toEqual(["task-child"]);
  });

  it("preserves failure reason and task status on delegation failure", () => {
    const times = [
      "2026-02-22T00:10:00.000Z",
      "2026-02-22T00:10:01.000Z",
      "2026-02-22T00:10:02.000Z",
    ];
    const ids = ["task-root", "task-child"];
    const useCase = new DispatchTaskUseCase(
      () => times.shift() ?? "2026-02-22T00:10:09.000Z",
      () => ids.shift() ?? "task-extra",
    );

    const root = useCase.createRootTask("coordinator", "root prompt");
    const child = useCase.delegateTask(
      root.taskId,
      "reviewer",
      "review prompt",
    );
    const failed = useCase.failTask(child.taskId, "tool timeout");

    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("tool timeout");
    expect(failed.resultAt).toBe("2026-02-22T00:10:02.000Z");
    expect(useCase.getTask(child.taskId)?.parentTaskId).toBe(root.taskId);
  });

  it("rejects delegation when parent task does not exist", () => {
    const useCase = new DispatchTaskUseCase();

    expect(() =>
      useCase.delegateTask("missing-parent", "developer", "sub prompt"),
    ).toThrow("Parent task not found");
  });

  it("rejects delegation when role policy does not allow it", () => {
    const ids = ["task-root", "task-child"];
    const useCase = new DispatchTaskUseCase(
      () => "2026-02-22T00:20:00.000Z",
      () => ids.shift() ?? "task-extra",
    );
    const root = useCase.createRootTask("documenter", "root prompt");

    expect(() =>
      useCase.delegateTask(root.taskId, "developer", "sub prompt"),
    ).toThrow("Role delegation is not allowed");
  });

  it("uses collision-safe default task ids", () => {
    const useCase = new DispatchTaskUseCase(() => "2026-02-22T00:30:00.000Z");
    const root = useCase.createRootTask("coordinator", "root");
    const child1 = useCase.delegateTask(root.taskId, "developer", "dev");
    const child2 = useCase.delegateTask(root.taskId, "reviewer", "review");

    expect(root.taskId).not.toEqual(child1.taskId);
    expect(child1.taskId).not.toEqual(child2.taskId);
    expect(root.taskId.startsWith("task-")).toBe(true);
  });
});
