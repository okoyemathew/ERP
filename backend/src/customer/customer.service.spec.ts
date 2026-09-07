import { CustomerService } from './customer.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

const businessId = '11111111-1111-1111-1111-111111111111';
const customerId = '22222222-2222-2222-2222-222222222222';
const employeeUserId = '33333333-3333-3333-3333-333333333333';

const employee: AuthenticatedUser = {
  id: employeeUserId,
  username: 'cashier',
  businessId,
  branchId: null,
  roleId: null,
  roleName: 'Cashier',
  employeeId: '44444444-4444-4444-4444-444444444444',
};

function createPrismaMock() {
  return {
    customer: {
      findFirst: jest.fn().mockResolvedValue({
        id: customerId,
        businessId,
        firstName: 'Ada',
        lastName: 'Lovelace',
        companyName: null,
        phone: '08000000000',
        email: null,
        creditLimit: { sub: jest.fn() },
        outstandingBalance: 0,
        status: 'ACTIVE',
      }),
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('CustomerService activity scoping', () => {
  it('scopes nested customer activity to the authenticated employee', async () => {
    const prisma = createPrismaMock();
    const service = new CustomerService(prisma as never, {} as never);

    await service.findOne(businessId, customerId, employee);

    expect(prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: customerId, businessId, deletedAt: null },
        include: expect.objectContaining({
          sales: expect.objectContaining({
            where: expect.objectContaining({ userId: employeeUserId }),
          }),
          payments: expect.objectContaining({
            where: expect.objectContaining({
              businessId,
              sale: expect.objectContaining({ userId: employeeUserId }),
            }),
          }),
          creditSales: expect.objectContaining({
            where: expect.objectContaining({
              sale: expect.objectContaining({
                businessId,
                userId: employeeUserId,
              }),
            }),
          }),
          creditPayments: expect.objectContaining({
            where: expect.objectContaining({
              creditSale: expect.objectContaining({
                sale: expect.objectContaining({
                  businessId,
                  userId: employeeUserId,
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('scopes customer list relation counts to the authenticated employee', async () => {
    const prisma = createPrismaMock();
    prisma.customer.count.mockResolvedValue(0);
    const service = new CustomerService(prisma as never, {} as never);

    await service.findAll(businessId, {}, employee);

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          _count: {
            select: expect.objectContaining({
              sales: expect.objectContaining({
                where: expect.objectContaining({ userId: employeeUserId }),
              }),
              payments: expect.objectContaining({
                where: expect.objectContaining({
                  sale: expect.objectContaining({ userId: employeeUserId }),
                }),
              }),
            }),
          },
        },
      }),
    );
  });
});
