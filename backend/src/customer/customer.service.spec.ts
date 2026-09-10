import { CustomerService } from './customer.service';
import { CreditSaleStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

const businessId = '11111111-1111-1111-1111-111111111111';
const customerId = '22222222-2222-2222-2222-222222222222';
const employeeUserId = '33333333-3333-3333-3333-333333333333';
const ownerUserId = '55555555-5555-5555-5555-555555555555';

const employee: AuthenticatedUser = {
  id: employeeUserId,
  username: 'cashier',
  businessId,
  branchId: null,
  roleId: null,
  roleName: 'Cashier',
  employeeId: '44444444-4444-4444-4444-444444444444',
};

const owner: AuthenticatedUser = {
  ...employee,
  id: ownerUserId,
  username: 'owner',
  roleName: 'Owner',
  employeeId: null,
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
  it('stores the authenticated user as the customer registrar when creating customers', async () => {
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          id: customerId,
          ...data,
        })),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const service = new CustomerService(prisma as never, {} as never);

    await service.create(
      businessId,
      {
        firstName: 'Ada',
        phone: '08000000000',
      },
      employee,
    );

    expect(prisma.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId,
          createdById: employeeUserId,
        }),
      }),
    );
  });

  it('scopes nested customer activity to the authenticated employee', async () => {
    const prisma = createPrismaMock();
    const service = new CustomerService(prisma as never, {} as never);

    await service.findOne(businessId, customerId, employee);

    expect(prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: customerId,
          businessId,
          deletedAt: null,
          OR: expect.arrayContaining([
            { createdById: employeeUserId },
          ]),
        }),
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
        where: expect.objectContaining({
          businessId,
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { createdById: employeeUserId },
              ]),
            }),
          ]),
        }),
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

  it('scopes owner customer lists to customers registered or sold by the owner', async () => {
    const prisma = createPrismaMock();
    prisma.customer.count.mockResolvedValue(0);
    const service = new CustomerService(prisma as never, {} as never);

    await service.findAll(businessId, {}, owner);

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId,
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { createdById: ownerUserId },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('keeps credit sale and linked sale balances partial after a partial credit payment', async () => {
    const saleId = '66666666-6666-6666-6666-666666666666';
    const creditSaleId = '77777777-7777-7777-7777-777777777777';
    const paymentDate = new Date('2026-09-10T12:00:00.000Z');
    const tx = {
      creditSale: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: creditSaleId,
            saleId,
            customerId,
            amountPaid: new Prisma.Decimal(0),
            balance: new Prisma.Decimal(5000),
            createdAt: new Date('2026-09-09T12:00:00.000Z'),
            sale: {
              id: saleId,
              businessId,
              totalAmount: new Prisma.Decimal(5000),
              payments: [
                {
                  paymentMethod: PaymentMethod.CREDIT,
                  amount: new Prisma.Decimal(5000),
                },
              ],
            },
          },
        ]),
        update: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { balance: new Prisma.Decimal(3000) },
        }),
      },
      creditPayment: {
        create: jest.fn().mockResolvedValue({
          id: '88888888-8888-8888-8888-888888888888',
          amount: new Prisma.Decimal(2000),
        }),
      },
      sale: {
        update: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { balanceDue: new Prisma.Decimal(3000) },
        }),
      },
      customer: {
        update: jest.fn().mockResolvedValue({
          id: customerId,
          firstName: 'Ada',
          lastName: 'Lovelace',
          companyName: null,
          outstandingBalance: new Prisma.Decimal(3000),
        }),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: customerId }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new CustomerService(prisma as never, {} as never);

    await service.collectCreditPayment(
      businessId,
      customerId,
      {
        creditSaleId,
        amount: 2000,
        paymentMethod: PaymentMethod.CARD,
        paymentDate,
      },
      employee,
    );

    expect(tx.creditSale.update).toHaveBeenCalledWith({
      where: { id: creditSaleId },
      data: {
        amountPaid: new Prisma.Decimal(2000),
        balance: new Prisma.Decimal(3000),
        status: CreditSaleStatus.PARTIALLY_PAID,
      },
    });
    expect(tx.sale.update).toHaveBeenCalledWith({
      where: { id: saleId },
      data: {
        amountPaid: new Prisma.Decimal(2000),
        balanceDue: new Prisma.Decimal(3000),
        paymentStatus: PaymentStatus.PARTIAL,
      },
    });
    expect(tx.creditPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: new Prisma.Decimal(2000),
          paymentDate,
        }),
      }),
    );
  });
});
