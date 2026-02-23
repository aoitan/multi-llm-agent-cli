import { RoleName } from "../../domain/orchestration/entities/role";
import { RoleTaskStatus } from "../../domain/orchestration/entities/task";

export interface RoleDelegationEvent {
  event_type: "role_delegation";
  status: RoleTaskStatus;
  task_id: string;
  parent_task_id?: string;
  delegated_role: RoleName;
  delegated_at: string;
  result_at?: string;
  failure_reason?: string;
  retry_count?: number;
  loop_trigger?: "retry_limit" | "cycle_limit";
  loop_threshold?: number;
  loop_recent_history?: string[];
}
