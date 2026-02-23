import { RoleName } from "./role";

export type RoleTaskStatus = "queued" | "running" | "completed" | "failed";

export interface RoleTask {
  taskId: string;
  parentTaskId?: string;
  role: RoleName;
  prompt: string;
  status: RoleTaskStatus;
  delegatedAt: string;
  resultAt?: string;
  failureReason?: string;
  retryCount?: number;
  loopTrigger?: "retry_limit" | "cycle_limit";
  loopThreshold?: number;
  loopRecentHistory?: string[];
  output?: string;
}
