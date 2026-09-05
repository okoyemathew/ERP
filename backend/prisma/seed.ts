import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient, BusinessStatus, BranchStatus, UserStatus, EmployeeStatus } from '@prisma/client';

const prisma = new PrismaClient();

const BUSINESS_NAME = 'Smart POS Demo Business';
const CURRENCY = 'XAF';
const TIMEZONE = 'UTC';
const BUSINESS_STATUS = BusinessStatus.ACTIVE;

const BRANCH_NAME = 'Main Branch';
const BRANCH_CODE = 'MAIN';
const BRANCH_STATUS = BranchStatus.ACTIVE;

const ROLES = [
  'Owner',
  'Admin',
  'Manager',
  'Cashier',
  'Salesperson',
  'Inventory Officer',
  'Accountant',
  'Supervisor',
] as const;

type RoleName = (typeof ROLES)[number];

const PERMISSIONS = [
  { name: 'dashboard.view', module: 'Dashboard', description: 'View dashboard and analytics' },
  { name: 'users.manage', module: 'Users', description: 'Create, update, and manage users' },
  { name: 'employees.manage', module: 'Employees', description: 'Create, update, and manage employees' },
  { name: 'roles.manage', module: 'Roles', description: 'Create, update, and manage roles' },
  { name: 'businesses.manage', module: 'Businesses', description: 'Manage business settings and profile' },
  { name: 'products.manage', module: 'Products', description: 'Create, update, and manage products' },
  { name: 'categories.manage', module: 'Categories', description: 'Create, update, and manage categories' },
  { name: 'brands.manage', module: 'Brands', description: 'Create, update, and manage brands' },
  { name: 'units.manage', module: 'Units', description: 'Create, update, and manage units' },
  { name: 'inventory.manage', module: 'Inventory', description: 'Manage inventory records and stock' },
  { name: 'suppliers.manage', module: 'Suppliers', description: 'Create, update, and manage suppliers' },
  { name: 'customers.manage', module: 'Customers', description: 'Create, update, and manage customers' },
  { name: 'sales.manage', module: 'Sales', description: 'Create and manage sales transactions' },
  { name: 'credit-sales.manage', module: 'Credit Sales', description: 'Manage credit sales transactions' },
  { name: 'expenses.manage', module: 'Expenses', description: 'Create and manage expenses' },
  { name: 'reports.view', module: 'Reports', description: 'View reports and summaries' },
  { name: 'notifications.manage', module: 'Notifications', description: 'Manage system notifications' },
  { name: 'settings.manage', module: 'Settings', description: 'Update system settings' },
  { name: 'receipt.manage', module: 'Receipt', description: 'Manage receipt preferences and printing' },
  { name: 'goods-supplied.manage', module: 'Goods Supplied', description: 'Create and manage supplied goods' },
  { name: 'goods-disbursement.manage', module: 'Goods Disbursement', description: 'Create and manage goods disbursements' },
  { name: 'audit-logs.view', module: 'Audit Logs', description: 'View audit logs and activity history' },
];

const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  Owner: PERMISSIONS.map((permission) => permission.name),
  Admin: PERMISSIONS.filter((permission) => permission.name !== 'businesses.manage').map((permission) => permission.name),
  Manager: [
    'sales.manage',
    'inventory.manage',
    'customers.manage',
    'reports.view',
    'receipt.manage',
  ],
  Cashier: ['sales.manage', 'receipt.manage', 'customers.manage'],
  Salesperson: ['sales.manage', 'receipt.manage'],
  'Inventory Officer': ['inventory.manage', 'goods-supplied.manage', 'goods-disbursement.manage'],
  Accountant: ['expenses.manage', 'reports.view', 'credit-sales.manage'],
  Supervisor: ['reports.view', 'inventory.manage', 'sales.manage', 'receipt.manage'],
};

const ADMIN_EMAIL = 'admin@smartpos.com';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const ADMIN_FIRST_NAME = 'System';
const ADMIN_LAST_NAME = 'Administrator';
const EMPLOYEE_CODE = 'EMP0001';
const EMPLOYEE_DEPARTMENT = 'Administration';
const EMPLOYEE_DESIGNATION = 'System Administrator';
const EMPLOYEE_STATUS = EmployeeStatus.ACTIVE;

const CATEGORIES = [
  'Beverages',
  'Food',
  'Electronics',
  'Clothing',
  'Stationery',
  'Health',
  'Household',
];

const BRANDS = ['Generic'];

const UNITS = [
  { name: 'Piece', symbol: 'pc', description: 'Individual piece' },
  { name: 'Box', symbol: 'bx', description: 'Box quantity' },
  { name: 'Pack', symbol: 'pk', description: 'Pack quantity' },
  { name: 'Bottle', symbol: 'btl', description: 'Bottle volume' },
  { name: 'Kilogram', symbol: 'kg', description: 'Weight measurement' },
  { name: 'Liter', symbol: 'l', description: 'Volume measurement' },
  { name: 'Meter', symbol: 'm', description: 'Length measurement' },
];

const EXPENSE_CATEGORIES = [
  'Transport',
  'Salary',
  'Electricity',
  'Water',
  'Internet',
  'Maintenance',
  'Miscellaneous',
];

const BUSINESS_SETTINGS = {
  defaultCurrency: 'XAF',
  timezone: 'UTC',
  allowCreditSales: true,
  allowNegativeStock: false,
  offlineMode: true,
};

const RECEIPT_SETTINGS = {
  paperWidth: '80mm',
  autoPrint: false,
  footerMessage: 'Thank you for shopping with us.',
};

const TAX_SETTINGS = {
  vatPercentage: 0,
  enabled: false,
};

const NOTIFICATION_SETTINGS = {
  lowStockAlerts: true,
  dailySummary: true,
  weeklySummary: true,
  monthlySummary: true,
};

async function main() {
  if (!ADMIN_PASSWORD) {
    throw new Error('Missing required environment variable: SEED_ADMIN_PASSWORD');
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

  let business = await prisma.business.findFirst({
    where: { name: BUSINESS_NAME },
  });

  if (!business) {
    business = await prisma.business.create({
      data: {
        name: BUSINESS_NAME,
        currency: CURRENCY,
        timezone: TIMEZONE,
        status: BUSINESS_STATUS,
      },
    });
  } else {
    business = await prisma.business.update({
      where: { id: business.id },
      data: {
        currency: CURRENCY,
        timezone: TIMEZONE,
        status: BUSINESS_STATUS,
        updatedAt: new Date(),
      },
    });
  }

  const branch = await prisma.branch.upsert({
    where: { code: BRANCH_CODE },
    update: {
      name: BRANCH_NAME,
      businessId: business.id,
      status: BRANCH_STATUS,
      updatedAt: new Date(),
    },
    create: {
      businessId: business.id,
      name: BRANCH_NAME,
      code: BRANCH_CODE,
      status: BRANCH_STATUS,
    },
  });

  const roleRecords = await Promise.all(
    ROLES.map(async (roleName) =>
      prisma.role.upsert({
        where: {
          businessId_name: {
            businessId: business.id,
            name: roleName,
          },
        },
        update: {
          description: `${roleName} role`,
          updatedAt: new Date(),
        },
        create: {
          businessId: business.id,
          name: roleName,
          description: `${roleName} role`,
        },
      }),
    ),
  );

  const permissionRecords = await Promise.all(
    PERMISSIONS.map(async (permission) =>
      prisma.permission.upsert({
        where: {
          businessId_name: {
            businessId: business.id,
            name: permission.name,
          },
        },
        update: {
          module: permission.module,
          description: permission.description,
          updatedAt: new Date(),
        },
        create: {
          businessId: business.id,
          name: permission.name,
          module: permission.module,
          description: permission.description,
        },
      }),
    ),
  );

  const permissionsByName = new Map(permissionRecords.map((permission) => [permission.name, permission]));
  const rolesByName = new Map(roleRecords.map((role) => [role.name, role]));

  await prisma.$transaction(
    Object.entries(ROLE_PERMISSIONS).flatMap(([roleName, permissions]) =>
      permissions.map((permissionName) => {
        const role = rolesByName.get(roleName as RoleName);
        const permission = permissionsByName.get(permissionName);

        if (!role || !permission) {
          throw new Error(`Unable to assign permission ${permissionName} to role ${roleName}`);
        }

        return prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {
            createdAt: new Date(),
          },
          create: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }),
    ),
  );

  const ownerRole = rolesByName.get('Owner');
  if (!ownerRole) {
    throw new Error('Owner role not found');
  }

  const user = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: {
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      businessId: business.id,
      branchId: branch.id,
      roleId: ownerRole.id,
      status: UserStatus.ACTIVE,
      updatedAt: new Date(),
    },
    create: {
      businessId: business.id,
      branchId: branch.id,
      roleId: ownerRole.id,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      password: hashedPassword,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.employee.upsert({
    where: { userId: user.id },
    update: {
      employeeCode: EMPLOYEE_CODE,
      department: EMPLOYEE_DEPARTMENT,
      designation: EMPLOYEE_DESIGNATION,
      status: EMPLOYEE_STATUS,
      updatedAt: new Date(),
    },
    create: {
      businessId: business.id,
      userId: user.id,
      employeeCode: EMPLOYEE_CODE,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      department: EMPLOYEE_DEPARTMENT,
      designation: EMPLOYEE_DESIGNATION,
      status: EMPLOYEE_STATUS,
    },
  });

  await Promise.all(
    CATEGORIES.map((categoryName) =>
      prisma.category.upsert({
        where: {
          businessId_name: {
            businessId: business.id,
            name: categoryName,
          },
        },
        update: {
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          businessId: business.id,
          name: categoryName,
          isActive: true,
        },
      }),
    ),
  );

  await Promise.all(
    BRANDS.map((brandName) =>
      prisma.brand.upsert({
        where: {
          businessId_name: {
            businessId: business.id,
            name: brandName,
          },
        },
        update: {
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          businessId: business.id,
          name: brandName,
          isActive: true,
        },
      }),
    ),
  );

  await Promise.all(
    UNITS.map((unit) =>
      prisma.unit.upsert({
        where: {
          businessId_symbol: {
            businessId: business.id,
            symbol: unit.symbol,
          },
        },
        update: {
          name: unit.name,
          description: unit.description,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          businessId: business.id,
          name: unit.name,
          symbol: unit.symbol,
          description: unit.description,
          isActive: true,
        },
      }),
    ),
  );

  await Promise.all(
    EXPENSE_CATEGORIES.map((expenseCategoryName) =>
      prisma.expenseCategory.upsert({
        where: {
          businessId_name: {
            businessId: business.id,
            name: expenseCategoryName,
          },
        },
        update: {
          updatedAt: new Date(),
        },
        create: {
          businessId: business.id,
          name: expenseCategoryName,
        },
      }),
    ),
  );

  await prisma.businessSettings.upsert({
    where: { businessId: business.id },
    update: {
      currency: BUSINESS_SETTINGS.defaultCurrency,
      timezone: BUSINESS_SETTINGS.timezone,
      allowCreditSales: BUSINESS_SETTINGS.allowCreditSales,
      allowNegativeStock: BUSINESS_SETTINGS.allowNegativeStock,
      enableOfflineMode: BUSINESS_SETTINGS.offlineMode,
      updatedAt: new Date(),
    },
    create: {
      businessId: business.id,
      currency: BUSINESS_SETTINGS.defaultCurrency,
      timezone: BUSINESS_SETTINGS.timezone,
      allowCreditSales: BUSINESS_SETTINGS.allowCreditSales,
      allowNegativeStock: BUSINESS_SETTINGS.allowNegativeStock,
      enableOfflineMode: BUSINESS_SETTINGS.offlineMode,
    },
  });

  await prisma.receiptSettings.upsert({
    where: { businessId: business.id },
    update: {
      paperWidth: RECEIPT_SETTINGS.paperWidth,
      autoPrint: RECEIPT_SETTINGS.autoPrint,
      footerMessage: RECEIPT_SETTINGS.footerMessage,
      updatedAt: new Date(),
    },
    create: {
      businessId: business.id,
      paperWidth: RECEIPT_SETTINGS.paperWidth,
      autoPrint: RECEIPT_SETTINGS.autoPrint,
      footerMessage: RECEIPT_SETTINGS.footerMessage,
    },
  });

  await prisma.taxSettings.upsert({
    where: { businessId: business.id },
    update: {
      taxName: 'VAT',
      taxPercentage: TAX_SETTINGS.vatPercentage,
      taxEnabled: TAX_SETTINGS.enabled,
      updatedAt: new Date(),
    },
    create: {
      businessId: business.id,
      taxName: 'VAT',
      taxPercentage: TAX_SETTINGS.vatPercentage,
      taxEnabled: TAX_SETTINGS.enabled,
    },
  });

  await prisma.notificationSettings.upsert({
    where: { businessId: business.id },
    update: {
      lowStockAlert: NOTIFICATION_SETTINGS.lowStockAlerts,
      dailySalesSummary: NOTIFICATION_SETTINGS.dailySummary,
      weeklySalesSummary: NOTIFICATION_SETTINGS.weeklySummary,
      monthlySalesSummary: NOTIFICATION_SETTINGS.monthlySummary,
      updatedAt: new Date(),
    },
    create: {
      businessId: business.id,
      lowStockAlert: NOTIFICATION_SETTINGS.lowStockAlerts,
      dailySalesSummary: NOTIFICATION_SETTINGS.dailySummary,
      weeklySalesSummary: NOTIFICATION_SETTINGS.weeklySummary,
      monthlySalesSummary: NOTIFICATION_SETTINGS.monthlySummary,
    },
  });

  const existingSeedLog = await prisma.auditLog.findFirst({
    where: {
      businessId: business.id,
      entity: 'Seed',
      action: 'CREATE',
      description: 'Initial database seed completed successfully',
    },
  });

  if (!existingSeedLog) {
    await prisma.auditLog.create({
      data: {
        businessId: business.id,
        userId: user.id,
        entity: 'Seed',
        entityId: business.id,
        action: 'CREATE',
        description: 'Initial database seed completed successfully',
        ipAddress: '127.0.0.1',
      },
    });
  }
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
