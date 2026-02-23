import { randomUUID } from "crypto";
import {
  canDelegateRole,
  RoleName,
} from "../../domain/orchestration/entities/role";
import { RoleTask } from "../../domain/orchestration/entities/task";

export class DispatchTaskUseCase {
  private readonly tasks = new Map<string, RoleTask>();

  constructor(
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createTaskId: () => string = () => `task-${randomUUID()}`,
  ) {}

  createRootTask(role: RoleName, prompt: string): RoleTask {
    const task: RoleTask = {
      taskId: this.createTaskId(),
      role,
      prompt,
      status: "queued",
      delegatedAt: this.now(),
    };
    this.tasks.set(task.taskId, task);
    return task;
  }

  delegateTask(parentTaskId: string, role: RoleName, prompt: string): RoleTask {
    const parentTask = this.tasks.get(parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task not found: ${parentTaskId}`);
    }
    if (!canDelegateRole(parentTask.role, role)) {
      throw new Error(
        `Role delegation is not allowed: ${parentTask.role} -> ${role}`,
      );
    }

    const task: RoleTask = {
      taskId: this.createTaskId(),
      parentTaskId,
      role,
      prompt,
      status: "queued",
      delegatedAt: this.now(),
    };
    this.tasks.set(task.taskId, task);
    return task;
  }

  markTaskRunning(taskId: string): RoleTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    task.status = "running";
    return task;
  }

  completeTask(taskId: string, output: string): RoleTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    task.status = "completed";
    task.output = output;
    task.resultAt = this.now();
    return task;
  }

  failTask(taskId: string, reason: string): RoleTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    task.status = "failed";
    task.failureReason = reason;
    task.resultAt = this.now();
    return task;
  }

  getTask(taskId: string): RoleTask | undefined {
    return this.tasks.get(taskId);
  }

  listChildren(parentTaskId: string): RoleTask[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.parentTaskId === parentTaskId,
    );
  }
}
