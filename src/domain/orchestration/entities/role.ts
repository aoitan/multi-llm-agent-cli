export type RoleName = "coordinator" | "developer" | "reviewer" | "documenter";

export interface RoleDefinition {
  name: RoleName;
  responsibility: string;
  delegatableTo: RoleName[];
}

const ROLE_CATALOG: ReadonlyArray<RoleDefinition> = [
  {
    name: "coordinator",
    responsibility: "ユーザー要求を解釈し、実行計画と委譲順序を決める。",
    delegatableTo: ["developer", "reviewer", "documenter"],
  },
  {
    name: "developer",
    responsibility: "実装タスクを処理し、成果物を生成する。",
    delegatableTo: ["reviewer", "documenter"],
  },
  {
    name: "reviewer",
    responsibility: "成果物を検証し、不備やリスクを指摘する。",
    delegatableTo: ["documenter"],
  },
  {
    name: "documenter",
    responsibility: "最終成果をユーザー向けに整理して出力する。",
    delegatableTo: [],
  },
];

export function listRoleDefinitions(): RoleDefinition[] {
  return ROLE_CATALOG.map((role) => ({
    ...role,
    delegatableTo: [...role.delegatableTo],
  }));
}

export function getRoleDefinition(roleName: RoleName): RoleDefinition {
  const role = ROLE_CATALOG.find((item) => item.name === roleName);
  if (!role) {
    throw new Error(`Unknown role: ${roleName}`);
  }
  return { ...role, delegatableTo: [...role.delegatableTo] };
}

export function canDelegateRole(fromRole: RoleName, toRole: RoleName): boolean {
  const from = getRoleDefinition(fromRole);
  return from.delegatableTo.includes(toRole);
}

export function isRoleName(value: string): value is RoleName {
  return ROLE_CATALOG.some((role) => role.name === value);
}
