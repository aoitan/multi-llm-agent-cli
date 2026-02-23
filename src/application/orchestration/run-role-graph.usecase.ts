import { DispatchTaskUseCase } from "./dispatch-task.usecase";
import { RoleDelegationEvent } from "../../shared/types/events";
import { RoleTask } from "../../domain/orchestration/entities/task";
import { RoleName } from "../../domain/orchestration/entities/role";

export interface RunRoleGraphResult {
  rootTaskId: string;
  finalResponse: string;
  events: RoleDelegationEvent[];
  tasks: RoleTask[];
}

export class RunRoleGraphUseCase {
  constructor(
    private readonly dispatchTask: DispatchTaskUseCase,
    private readonly runRole: (
      role: RoleName,
      prompt: string,
    ) => Promise<string>,
    private readonly onEvent?: (
      event: RoleDelegationEvent,
    ) => void | Promise<void>,
  ) {}

  async execute(userPrompt: string): Promise<RunRoleGraphResult> {
    const rootTask = this.dispatchTask.createRootTask(
      "coordinator",
      userPrompt,
    );
    this.dispatchTask.markTaskRunning(rootTask.taskId);
    const events: RoleDelegationEvent[] = [];
    const allTasks: RoleTask[] = [rootTask];

    try {
      const coordinatorOutput = await this.runRole("coordinator", userPrompt);
      const developerTask = this.dispatchTask.delegateTask(
        rootTask.taskId,
        "developer",
        coordinatorOutput,
      );
      allTasks.push(developerTask);
      this.dispatchTask.markTaskRunning(developerTask.taskId);
      const developerOutput = await this.runRole(
        "developer",
        coordinatorOutput,
      );
      const developerCompleted = this.dispatchTask.completeTask(
        developerTask.taskId,
        developerOutput,
      );
      await this.pushEvent(events, this.buildEvent(developerCompleted));

      const reviewerTask = this.dispatchTask.delegateTask(
        rootTask.taskId,
        "reviewer",
        developerOutput,
      );
      allTasks.push(reviewerTask);
      this.dispatchTask.markTaskRunning(reviewerTask.taskId);
      const reviewerOutput = await this.runRole("reviewer", developerOutput);
      const reviewerCompleted = this.dispatchTask.completeTask(
        reviewerTask.taskId,
        reviewerOutput,
      );
      await this.pushEvent(events, this.buildEvent(reviewerCompleted));

      const documenterTask = this.dispatchTask.delegateTask(
        rootTask.taskId,
        "documenter",
        reviewerOutput,
      );
      allTasks.push(documenterTask);
      this.dispatchTask.markTaskRunning(documenterTask.taskId);
      const finalResponse = await this.runRole("documenter", reviewerOutput);
      const documenterCompleted = this.dispatchTask.completeTask(
        documenterTask.taskId,
        finalResponse,
      );
      await this.pushEvent(events, this.buildEvent(documenterCompleted));
      const rootCompleted = this.dispatchTask.completeTask(
        rootTask.taskId,
        finalResponse,
      );
      await this.pushEvent(events, this.buildEvent(rootCompleted));

      return {
        rootTaskId: rootTask.taskId,
        finalResponse,
        events,
        tasks: allTasks,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const runningChild = allTasks
        .filter((task) => task.parentTaskId === rootTask.taskId)
        .find((task) => task.status === "running");
      if (runningChild) {
        const failedTask = this.dispatchTask.failTask(
          runningChild.taskId,
          message,
        );
        await this.pushEvent(events, this.buildEvent(failedTask));
      }
      const failedRoot = this.dispatchTask.failTask(rootTask.taskId, message);
      if (!runningChild) {
        await this.pushEvent(events, this.buildEvent(failedRoot));
      }
      throw error;
    }
  }

  private async pushEvent(
    events: RoleDelegationEvent[],
    event: RoleDelegationEvent,
  ): Promise<void> {
    events.push(event);
    if (this.onEvent) {
      try {
        await this.onEvent(event);
      } catch (error) {
        // Keep event callback failures visible without breaking orchestration.
        console.error("Role delegation event propagation failed:", error);
      }
    }
  }

  private buildEvent(task: RoleTask): RoleDelegationEvent {
    return {
      event_type: "role_delegation",
      status: task.status,
      task_id: task.taskId,
      parent_task_id: task.parentTaskId,
      delegated_role: task.role,
      delegated_at: task.delegatedAt,
      result_at: task.resultAt,
      failure_reason: task.failureReason,
    };
  }
}
