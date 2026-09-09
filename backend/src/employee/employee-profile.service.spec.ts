import { EmployeeStatus, Prisma, ProductReturnRequestStatus, SaleStatus } from '@prisma/client';
import { EmployeeService } from './employee.service';

const businessId = '11111111-1111-1111-1111-111111111111';
const employeeId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';
const productId = '44444444-4444-4444-4444-444444444444';

const employee = {
  id: employeeId,
  businessId,
  userId,
  employeeCode: 'OWNER-0001',
  firstName: 'Okoye',
  lastName: 'Matthew Ikechukwu',
  gender: null,
  dateOfBirth: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  state: null,
  country: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  department: 'Management',
  designation: 'Business Owner',
  hireDate: null,
  salary: null,
  profileImage: null,
  lastLogin: null,
  status: EmployeeStatus.ACTIVE,
  canLogin: true,
  canSell: true,
  canManageStock: true,
  canManageExpenses: true,
  canPrintReceipt: true,
  notes: null,
  isSynced: true,
  syncVersion: 1,
  deviceId: null,
  deletedAt: null,
  createdAt: new Date('2026-09-09T08:00:00.000Z'),
  updatedAt: new Date('2026-09-09T08:00:00.000Z'),
  user: {
    id: userId,
    username: 'owner',
    password: 'hidden',
    status: 'ACTIVE',
    lastLogin: null,
    role: { id: 'role-owner', name: 'Owner', description: 'Owner', rolePermissions: [] },
    branch: null,
  },
};

function createPrismaMock() {
  const prisma: any = {
    employee: { findFirst: jest.fn() },
    sale: { count: jest.fn(), aggregate: jest.fn() },
    payment: { count: jest.fn() },
    expense: { count: jest.fn() },
    userSession: { findMany: jest.fn() },
    saleItem: { findMany: jest.fn() },
    goodsDisbursement: { findMany: jest.fn() },
    productReturnRequest: { findMany: jest.fn() },
  };

  return prisma;
}

describe('EmployeeService profile stock', () => {
  it('does not let old sales consume newly supplied owner or employee stock', async () => {
    const prisma = createPrismaMock();
    const service = new EmployeeService(prisma as never, {} as never);

    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.sale.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    prisma.payment.count.mockResolvedValue(0);
    prisma.expense.count.mockResolvedValue(0);
    prisma.userSession.findMany.mockResolvedValue([]);
    prisma.sale.aggregate.mockResolvedValue({
      _sum: { totalAmount: new Prisma.Decimal(0) },
    });
    prisma.productReturnRequest.findMany.mockResolvedValue([]);
    prisma.goodsDisbursement.findMany.mockResolvedValue([
      {
        id: '55555555-5555-5555-5555-555555555555',
        employeeId,
        disbursementNumber: 'GD-001',
        disbursementDate: new Date('2026-09-09T10:00:00.000Z'),
        destination: 'Okoye Matthew Ikechukwu',
        remarks: null,
        items: [
          {
            id: '66666666-6666-6666-6666-666666666666',
            productId,
            quantity: 20,
            product: {
              id: productId,
              name: 'Salt',
              sku: 'SALT-6',
              barcode: null,
              sellingPrice: new Prisma.Decimal(80),
              isActive: true,
            },
            createdAt: new Date('2026-09-09T10:00:00.000Z'),
          },
        ],
      },
    ]);
    prisma.saleItem.findMany.mockResolvedValue([
      {
        productId,
        quantity: 69,
        totalAmount: new Prisma.Decimal(5520),
        sale: {
          saleDate: new Date('2026-09-08T10:00:00.000Z'),
        },
        product: {
          id: productId,
          name: 'Salt',
          sku: 'SALT-6',
          barcode: null,
          sellingPrice: new Prisma.Decimal(80),
          inventory: { quantityOnHand: 0, quantityAvailable: 0 },
        },
      },
    ]);

    const response = await service.getProfile(businessId, employeeId);

    expect(response.profileActivity?.stock[0]).toEqual(
      expect.objectContaining({
        productId,
        suppliedQuantity: 20,
        quantitySold: 0,
        quantityInHand: 20,
      }),
    );
  });
});
