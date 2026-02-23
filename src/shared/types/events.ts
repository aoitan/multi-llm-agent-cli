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
}
