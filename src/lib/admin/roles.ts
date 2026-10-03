import type { AdminRole } from "@/lib/db/schema";

export const ROLE_RANK: Record<AdminRole, number> = { waiter: 1, manager: 2, owner: 3 };
export const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Владелец",
  manager: "Управляющий",
  waiter: "Официант (просмотр)",
};

export function hasRole(role: AdminRole, min: AdminRole) {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
