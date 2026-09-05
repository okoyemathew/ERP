export const SYSTEM_ROLES = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  SALESPERSON: 'Salesperson',
  INVENTORY_OFFICER: 'Inventory Officer',
  ACCOUNTANT: 'Accountant',
  SUPERVISOR: 'Supervisor',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

export const ADMIN_ROLE_NAMES: readonly SystemRole[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
];

export function normalizeSystemRoleName(
  roleName: string | null | undefined,
): SystemRole | null {
  const normalized = roleName?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return (
    (Object.values(SYSTEM_ROLES) as SystemRole[]).find(
      (systemRole) => systemRole.toLowerCase() === normalized,
    ) ?? null
  );
}
