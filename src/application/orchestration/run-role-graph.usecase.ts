import { DispatchTaskUseCase } from "./dispatch-task.usecase";
import { createHash } from "crypto";
import { RoleDelegationEvent } from "../../shared/types/events";
import { RoleTask } from "../../domain/orchestration/entities/task";
import { RoleName } from "../../domain/orchestration/entities/role";

class LoopThresholdExceededError extends Error {
  constructor(
    readonly role: RoleName,
    readonly threshold: number,
    readonly recentHistory: string[],
  ) {
    super(`Loop threshold exceeded: role=${role}, threshold=${threshold}`);
    this.name = "LoopThresholdExceededError";
  }
}

class RetryLimitExceededError extends Error {
  constructor(
    readonly role: RoleName,
    readonly retryCount: number,
    readonly threshold: number,
    readonly causeMessage: string,
  ) {
    super(
      `Retry limit exceeded: role=${role}, retries=${retryCount}, threshold=${threshold}, cause=${causeMessage}`,
    );
    this.name = "RetryLimitExceededError";
  }
}

export interface RunRoleGraphOptions {
  maxParallelRoles?: number;
  maxRetriesPerRole?: number;
  maxCycleCount?: number;
}

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
      signal?: AbortSignal,
    ) => Promise<string>,
    private readonly onEvent?: (
      event: RoleDelegationEvent,
    ) => void | Promise<void>,
    private readonly options: RunRoleGraphOptions = {},
  ) {}

  async execute(userPrompt: string): Promise<RunRoleGraphResult> {
    const maxParallelRoles = Math.max(1, this.options.maxParallelRoles ?? 2);
    const maxRetriesPerRole = Math.max(0, this.options.maxRetriesPerRole ?? 0);
    const maxCycleCount = Math.max(1, this.options.maxCycleCount ?? 3);
    const cycleCounts = new Map<string, number>();
    const abortController = new AbortController();
    const rootTask = this.dispatchTask.createRootTask(
      "coordinator",
      userPrompt,
    );
    this.dispatchTask.markTaskRunning(rootTask.taskId);
    const events: RoleDelegationEvent[] = [];
    const allTasks: RoleTask[] = [rootTask];

    try {
      const coordinatorOutput = await this.runRoleWithRetryAndCycleGuard(
        "coordinator",
        userPrompt,
        maxRetriesPerRole,
        maxCycleCount,
        cycleCounts,
        ["start->coordinator"],
        false,
        abortController.signal,
      );
      const delegatedRoles: RoleName[] = ["developer", "reviewer"];
      const delegatedTasks = delegatedRoles.map((role) =>
        this.dispatchTask.delegateTask(
          rootTask.taskId,
          role,
          coordinatorOutput,
        ),
      );
      allTasks.push(...delegatedTasks);

      const delegatedOutputs = await this.executeInPool(
        delegatedTasks,
        maxParallelRoles,
        abortController,
        async (task) => {
          this.dispatchTask.markTaskRunning(task.taskId);
          try {
            const output = await this.runRoleWithRetryAndCycleGuard(
              task.role,
              task.prompt,
              maxRetriesPerRole,
              maxCycleCount,
              cycleCounts,
              [`coordinator->${task.role}`],
              true,
              abortController.signal,
            );
            const completed = this.dispatchTask.completeTask(
              task.taskId,
              output,
            );
            await this.pushEvent(events, this.buildEvent(completed));
            return output;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            const failedTask = this.dispatchTask.failTask(task.taskId, message);
            if (error instanceof RetryLimitExceededError) {
              failedTask.retryCount = error.retryCount;
              failedTask.loopTrigger = "retry_limit";
              failedTask.loopThreshold = error.threshold;
            } else if (error instanceof LoopThresholdExceededError) {
              failedTask.loopTrigger = "cycle_limit";
              failedTask.loopThreshold = error.threshold;
              failedTask.loopRecentHistory = error.recentHistory;
            }
            await this.pushEvent(events, this.buildEvent(failedTask));
            throw error;
          }
        },
      );

      const documenterTask = this.dispatchTask.delegateTask(
        rootTask.taskId,
        "documenter",
        this.buildDocumenterPrompt(delegatedRoles, delegatedOutputs),
      );
      allTasks.push(documenterTask);
      this.dispatchTask.markTaskRunning(documenterTask.taskId);
      const finalResponse = await this.runRoleWithRetryAndCycleGuard(
        "documenter",
        documenterTask.prompt,
        maxRetriesPerRole,
        maxCycleCount,
        cycleCounts,
        ["coordinator->documenter"],
        true,
        abortController.signal,
      );
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
        if (error instanceof RetryLimitExceededError) {
          failedTask.retryCount = error.retryCount;
          failedTask.loopTrigger = "retry_limit";
          failedTask.loopThreshold = error.threshold;
        } else if (error instanceof LoopThresholdExceededError) {
          failedTask.loopTrigger = "cycle_limit";
          failedTask.loopThreshold = error.threshold;
          failedTask.loopRecentHistory = error.recentHistory;
        }
        await this.pushEvent(events, this.buildEvent(failedTask));
      }
      const failedRoot = this.dispatchTask.failTask(rootTask.taskId, message);
      await this.pushEvent(events, this.buildEvent(failedRoot));
      throw error;
    }
  }

  private buildDocumenterPrompt(
    roles: RoleName[],
    outputs: Map<string, string>,
  ): string {
    return roles
      .map((role) => `[${role}]\n${outputs.get(role) ?? ""}`)
      .join("\n\n");
  }

  private async executeInPool(
    tasks: RoleTask[],
    concurrency: number,
    abortController: AbortController,
    worker: (task: RoleTask) => Promise<string>,
  ): Promise<Map<string, string>> {
    const outputMap = new Map<string, string>();
    let firstError: unknown;
    let cursor = 0;
    let aborted = false;
    const workers = Array.from(
      { length: Math.min(concurrency, tasks.length) },
      async () => {
        while (!aborted && cursor < tasks.length) {
          const index = cursor;
          cursor += 1;
          const task = tasks[index];
          if (!task) {
            continue;
          }
          try {
            outputMap.set(task.role, await worker(task));
          } catch (error) {
            if (!firstError) {
              firstError = error;
            }
            aborted = true;
            abortController.abort();
          }
        }
      },
    );
    await Promise.all(workers);
    if (firstError) {
      throw firstError;
    }
    return outputMap;
  }

  private async runRoleWithRetryAndCycleGuard(
    role: RoleName,
    prompt: string,
    maxRetriesPerRole: number,
    maxCycleCount: number,
    cycleCounts: Map<string, number>,
    transitionHistory: string[],
    wrapRetryLimitError: boolean,
    signal?: AbortSignal,
  ): Promise<string> {
    this.assertCycleLimit(role, transitionHistory, maxCycleCount, cycleCounts);
    for (let attempt = 0; attempt <= maxRetriesPerRole; attempt += 1) {
      if (signal?.aborted) {
        throw new Error("Execution aborted");
      }
      try {
        return await this.runRole(role, prompt, signal);
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        if (
          attempt === maxRetriesPerRole &&
          (!wrapRetryLimitError || maxRetriesPerRole === 0)
        ) {
          throw error;
        }
        if (attempt === maxRetriesPerRole) {
          const causeMessage =
            error instanceof Error ? error.message : String(error);
          throw new RetryLimitExceededError(
            role,
            attempt,
            maxRetriesPerRole,
            causeMessage,
          );
        }
      }
    }
    throw new Error("Unreachable");
  }

  private assertCycleLimit(
    role: RoleName,
    transitionHistory: string[],
    maxCycleCount: number,
    cycleCounts: Map<string, number>,
  ): void {
    const key = this.createCycleHistoryKey(transitionHistory);
    const count = (cycleCounts.get(key) ?? 0) + 1;
    cycleCounts.set(key, count);
    if (count > maxCycleCount) {
      throw new LoopThresholdExceededError(role, maxCycleCount, [
        ...transitionHistory,
      ]);
    }
  }

  private createCycleHistoryKey(transitionHistory: string[]): string {
    const digest = createHash("sha256")
      .update(transitionHistory.join("|"))
      .digest("hex")
      .slice(0, 16);
    return `path#${digest}`;
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
      retry_count: task.retryCount,
      loop_trigger: task.loopTrigger,
      loop_threshold: task.loopThreshold,
      loop_recent_history: task.loopRecentHistory,
    };
  }
}
