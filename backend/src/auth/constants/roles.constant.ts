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
