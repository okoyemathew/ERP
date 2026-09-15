import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { InventoryController } from '../src/inventory/inventory.controller';
import { InventoryService } from '../src/inventory/inventory.service';
import { InventoryTransactionService } from '../src/inventory/inventory-transaction.service';
import { SalesService } from '../src/sales/sales.service';
import { CreditSalesService } from '../src/credit-sales/credit-sales.service';
import { EmployeeService } from '../src/employee/employee.service';

// Never fall back to DATABASE_URL: these tests must use an isolated local database.
const url = process.env.RETURN_TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
run('partial returns through NestJS and PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let fixture: Awaited<ReturnType<typeof seed>>;

  async function seed(
    ownerSold = false,
    credit = false,
    paid = 0,
    discounted = true,
  ) {
    const business = await prisma.business.create({
      data: { name: `Return test ${randomUUID()}` },
    });
    const businessId = business.id;
    const ownerRole = await prisma.role.create({
      data: { businessId, name: 'Owner' },
    });
    const employeeRole = await prisma.role.create({
      data: { businessId, name: 'Cashier' },
    });
    const makeUser = (roleId: string) =>
      prisma.user.create({
        data: {
          businessId,
          roleId,
          firstName: 'Test',
          lastName: 'Seller',
          username: randomUUID(),
          password: 'not-a-login',
        },
      });
    const owner = await makeUser(ownerRole.id);
    const employee = await makeUser(employeeRole.id);
    const seller = ownerSold ? owner : employee;
    const profile = await prisma.employee.create({
      data: {
        businessId,
        userId: seller.id,
        employeeCode: 'SELLER',
        firstName: 'Test',
        lastName: 'Seller',
      },
    });
    const category = await prisma.category.create({
      data: { businessId, name: 'Food' },
    });
    const unit = await prisma.unit.create({
      data: { businessId, name: 'Unit', symbol: 'u' },
    });
    const product = (name: string, price: number) =>
      prisma.product.create({
        data: {
          businessId,
          categoryId: category.id,
          unitId: unit.id,
          name,
          sku: name,
          purchasePrice: price / 2,
          sellingPrice: price,
          baseSellingPrice: price,
          inventory: {
            create: {
              businessId,
              quantityOnHand: 10,
              quantityAvailable: 10,
              averageCost: price / 2,
            },
          },
        },
      });
    const salt = await product('Salt', 100);
    const maggi = await product('Maggi', 200);
    await prisma.goodsDisbursement.create({
      data: {
        businessId,
        employeeId: profile.id,
        disbursementNumber: 'SUPPLY',
        disbursementDate: new Date('2026-01-01'),
        items: {
          create: [
            { productId: salt.id, quantity: 20 },
            { productId: maggi.id, quantity: 50 },
          ],
        },
      },
    });
    const total = discounted ? 11880 : 12000;
    const customer = await prisma.customer.create({
      data: {
        businessId,
        firstName: 'Customer',
        phone: randomUUID(),
        outstandingBalance: credit ? total - paid : 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        businessId,
        customerId: customer.id,
        userId: seller.id,
        saleNumber: 'SALE-1001',
        subtotal: 12000,
        discountAmount: discounted ? 200 : 0,
        taxAmount: discounted ? 80 : 0,
        totalAmount: total,
        amountPaid: credit ? paid : total,
        balanceDue: credit ? total - paid : 0,
        paymentStatus: credit ? (paid ? 'PARTIAL' : 'UNPAID') : 'PAID',
        status: 'COMPLETED',
        items: {
          create: [
            {
              productId: salt.id,
              quantity: 20,
              unitPrice: 100,
              discountAmount: discounted ? 40 : 0,
              taxAmount: discounted ? 20 : 0,
              totalAmount: discounted ? 1980 : 2000,
            },
            {
              productId: maggi.id,
              quantity: 50,
              unitPrice: 200,
              discountAmount: discounted ? 160 : 0,
              taxAmount: discounted ? 60 : 0,
              totalAmount: discounted ? 9900 : 10000,
            },
          ],
        },
      },
      include: { items: true },
    });
    await prisma.payment.create({
      data: {
        businessId,
        saleId: sale.id,
        customerId: customer.id,
        userId: seller.id,
        paymentMethod: credit ? 'CREDIT' : 'CASH',
        amount: total,
      },
    });
    const creditSale = credit
      ? await prisma.creditSale.create({
          data: {
            saleId: sale.id,
            customerId: customer.id,
            totalCredit: total,
            amountPaid: paid,
            balance: total - paid,
            status: paid ? 'PARTIALLY_PAID' : 'ACTIVE',
          },
        })
      : null;
    if (paid && creditSale)
      await prisma.creditPayment.create({
        data: {
          creditSaleId: creditSale.id,
          customerId: customer.id,
          userId: seller.id,
          amount: paid,
          paymentMethod: 'CASH',
        },
      });
    return {
      businessId,
      owner,
      employee,
      seller,
      profile,
      customer,
      sale,
      salt,
      maggi,
      creditSale,
      saltItem: sale.items.find((i) => i.productId === salt.id)!,
      maggiItem: sale.items.find((i) => i.productId === maggi.id)!,
    };
  }

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (
      !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
      parsed.port !== '55439'
    )
      throw new Error(
        'Use only the isolated return-test database on localhost:55439',
      );
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
    const service = new InventoryService(
      prisma as never,
      new InventoryTransactionService(prisma as never),
      {} as never,
    );
    const module = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [{ provide: InventoryService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    // Authentication transport is supplied by the harness; service authorization is real.
    app.use((req: any, _res: any, next: () => void) => {
      const user =
        req.headers['x-test-role'] === 'owner' ? fixture.owner : fixture.seller;
      req.user = {
        ...user,
        roleName: user.id === fixture.owner.id ? 'Owner' : 'Cashier',
        employeeId: fixture.profile.id,
      };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  const base = () => `/businesses/${fixture.businessId}/inventory`;
  const initiate = (
    quantity: number,
    saleItemId = fixture.saltItem.id,
    productId = fixture.salt.id,
  ) =>
    request(app.getHttpServer())
      .post(`${base()}/return-requests`)
      .send({ saleItemId, productId, quantity, unitCost: 99999 });
  const approve = (id: string) =>
    request(app.getHttpServer())
      .patch(`${base()}/return-requests/${id}/approve`)
      .set('x-test-role', 'owner')
      .send({});
  const reject = (id: string) =>
    request(app.getHttpServer())
      .patch(`${base()}/return-requests/${id}/reject`)
      .set('x-test-role', 'owner')
      .send({});
  const available = () =>
    request(app.getHttpServer())
      .get(`${base()}/return-availability/${fixture.saltItem.id}`)
      .expect(200);
  async function stock(productId = fixture.salt.id) {
    const sales = new SalesService(prisma as never);
    return (sales as any).sellerProductStockSnapshot(
      fixture.businessId,
      productId,
      {
        useEmployeeStock: true,
        userId: fixture.seller.id,
        stockMatch: [{ employeeId: fixture.profile.id }],
      },
      prisma,
    );
  }

  it('returns 1 then 2 Salt, rejects 18 when 17 remain, and leaves all 50 Maggi untouched', async () => {
    fixture = await seed();
    const first = await initiate(1).expect(201);
    expect(first.body).toMatchObject({
      quantity: 1,
      saleItemId: fixture.saltItem.id,
      originalSellerId: fixture.seller.id,
      status: 'PENDING',
    });
    expect((await stock()).availableQuantity).toBe(0);
    expect((await available()).body.quantityAvailable).toBe(19);
    await approve(first.body.id).expect(200);
    expect((await stock()).availableQuantity).toBe(1);
    const second = await initiate(2).expect(201);
    await approve(second.body.id).expect(200);
    expect((await available()).body).toMatchObject({
      quantitySold: 20,
      quantityReturned: 3,
      quantityPending: 0,
      quantityAvailable: 17,
    });
    await initiate(18).expect(400);
    expect((await stock()).availableQuantity).toBe(3);
    const profile = await new EmployeeService(
      prisma as never,
      {} as never,
    ).getProfile(fixture.businessId, fixture.profile.id);
    expect(
      profile.profileActivity?.stock.find(
        (item) => item.productId === fixture.salt.id,
      )?.quantityInHand,
    ).toBe(3);
    expect(
      profile.profileActivity?.stock.find(
        (item) => item.productId === fixture.maggi.id,
      )?.quantityInHand,
    ).toBe(0);
    expect(
      (
        await prisma.saleItem.findUniqueOrThrow({
          where: { id: fixture.saltItem.id },
        })
      ).quantity,
    ).toBe(20);
    expect((await stock(fixture.maggi.id)).availableQuantity).toBe(0);
    expect(
      (await prisma.sale.findUniqueOrThrow({ where: { id: fixture.sale.id } }))
        .status,
    ).toBe('COMPLETED');
    expect(
      await prisma.productReturnRequest.count({
        where: { productId: fixture.maggi.id },
      }),
    ).toBe(0);
    expect(
      await prisma.notification.count({ where: { userId: fixture.owner.id } }),
    ).toBe(2);
  });

  it('puts exactly 2 owner-sold Salt into personal stock without changing the warehouse', async () => {
    fixture = await seed(true, false, 0, false);
    const pending = await initiate(2).expect(201);
    await approve(pending.body.id).expect(200);
    const salt = await prisma.inventory.findUniqueOrThrow({
      where: { productId: fixture.salt.id },
    });
    expect(salt.quantityAvailable).toBe(10);
    expect((await stock()).availableQuantity).toBe(2);
    const profile = await new EmployeeService(prisma as never, {} as never).getProfile(fixture.businessId, fixture.profile.id);
    expect(profile.profileActivity?.stock.find(item => item.productId === fixture.salt.id)?.quantityInHand).toBe(2);
    expect(Number(salt.averageCost)).toBe(50);
    expect(
      (
        await prisma.inventory.findUniqueOrThrow({
          where: { productId: fixture.maggi.id },
        })
      ).quantityAvailable,
    ).toBe(10);
    expect(await prisma.inventoryTransaction.count({ where: { productId: fixture.salt.id, transactionType: 'RETURN' } })).toBe(0);
    expect(
      (
        await prisma.auditLog.findFirstOrThrow({
          where: { entityId: pending.body.id, action: 'UPDATE' },
        })
      ).description,
    ).toContain('return value 200.00');
  });

  it.each([0, 400])(
    'adjusts credit for exactly 2 discounted/taxed Salt with %i already paid, preserving payments',
    async (paid) => {
      fixture = await seed(false, true, paid);
      const paymentHistory = await prisma.payment.findMany({
        where: { saleId: fixture.sale.id },
      });
      const creditHistory = await prisma.creditPayment.findMany({
        where: { creditSaleId: fixture.creditSale!.id },
      });
      const pending = await initiate(2).expect(201);
      expect(pending.body.creditSaleId).toBe(fixture.creditSale!.id);
      expect(
        Number(
          (
            await prisma.creditSale.findUniqueOrThrow({
              where: { id: fixture.creditSale!.id },
            })
          ).balance,
        ),
      ).toBe(11880 - paid);
      await approve(pending.body.id).expect(200);
      const credit = await prisma.creditSale.findUniqueOrThrow({
        where: { id: fixture.creditSale!.id },
      });
      expect(Number(credit.balance)).toBe(11880 - paid - 198);
      expect(Number(credit.amountPaid)).toBe(paid);
      expect(
        Number(
          (
            await prisma.customer.findUniqueOrThrow({
              where: { id: fixture.customer.id },
            })
          ).outstandingBalance,
        ),
      ).toBe(11880 - paid - 198);
      expect((await stock()).availableQuantity).toBe(2);
      expect(
        await prisma.payment.findMany({ where: { saleId: fixture.sale.id } }),
      ).toEqual(paymentHistory);
      expect(
        await prisma.creditPayment.findMany({
          where: { creditSaleId: fixture.creditSale!.id },
        }),
      ).toEqual(creditHistory);
      expect(
        (
          await prisma.auditLog.findFirstOrThrow({
            where: { entityId: pending.body.id, action: 'UPDATE' },
          })
        ).description,
      ).toContain('return value 198.00');
    },
  );

  it('keeps the return credit when a customer makes a later payment', async () => {
    fixture = await seed(false, true, 400);
    await approve((await initiate(2).expect(201)).body.id).expect(200);
    const service = new CreditSalesService(prisma as never);
    await service.collectPayment(
      fixture.businessId,
      fixture.creditSale!.id,
      { amount: 100, paymentMethod: 'CARD' },
      {
        ...fixture.seller,
        roleName: 'Cashier',
        employeeId: fixture.profile.id,
      } as never,
    );
    const credit = await prisma.creditSale.findUniqueOrThrow({
      where: { id: fixture.creditSale!.id },
    });
    const invoice = await prisma.sale.findUniqueOrThrow({
      where: { id: fixture.sale.id },
    });
    expect(Number(credit.balance)).toBe(11182);
    expect(Number(invoice.balanceDue)).toBe(11182);
    expect(Number(invoice.amountPaid)).toBe(500);
    expect(
      await prisma.creditPayment.count({
        where: { creditSaleId: fixture.creditSale!.id },
      }),
    ).toBe(2);
  });

  it('serializes a credit payment against return approval without losing either adjustment', async () => {
    fixture = await seed(false, true, 400);
    const pending = await initiate(2).expect(201);
    const service = new CreditSalesService(prisma as never);
    await Promise.all([
      approve(pending.body.id).expect(200),
      service.collectPayment(
        fixture.businessId,
        fixture.creditSale!.id,
        { amount: 100, paymentMethod: 'CARD' },
        {
          ...fixture.seller,
          roleName: 'Cashier',
          employeeId: fixture.profile.id,
        } as never,
      ),
    ]);
    expect(
      Number(
        (
          await prisma.creditSale.findUniqueOrThrow({
            where: { id: fixture.creditSale!.id },
          })
        ).balance,
      ),
    ).toBe(11182);
    expect(
      Number(
        (
          await prisma.sale.findUniqueOrThrow({
            where: { id: fixture.sale.id },
          })
        ).balanceDue,
      ),
    ).toBe(11182);
    expect((await stock()).availableQuantity).toBe(2);
  });

  it('allocates fractional-cent sale values across successive partial returns without losing money', async () => {
    fixture = await seed();
    await prisma.saleItem.update({
      where: { id: fixture.saltItem.id },
      data: { quantity: 3, totalAmount: 1 },
    });
    const values: string[] = [];
    for (let count = 0; count < 3; count++) {
      const pending = await initiate(1).expect(201);
      await approve(pending.body.id).expect(200);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: pending.body.id, action: 'UPDATE' },
      });
      values.push(audit.description!.split('return value ')[1]);
    }
    expect(values).toEqual(['0.33', '0.34', '0.33']);
    expect((await available()).body.quantityAvailable).toBe(0);
  });

  it('releases a rejected pending quantity without changing stock or credit', async () => {
    fixture = await seed(false, true, 400);
    const pending = await initiate(3).expect(201);
    expect((await available()).body.quantityAvailable).toBe(17);
    await reject(pending.body.id).expect(200);
    expect((await available()).body).toMatchObject({
      quantityReturned: 0,
      quantityPending: 0,
      quantityAvailable: 20,
    });
    expect((await stock()).availableQuantity).toBe(0);
    expect(
      Number(
        (
          await prisma.creditSale.findUniqueOrThrow({
            where: { id: fixture.creditSale!.id },
          })
        ).balance,
      ),
    ).toBe(11480);
    await approve(pending.body.id).expect(404);
  });

  it('serializes simultaneous reservations and prevents double approval', async () => {
    fixture = await seed(true);
    const responses = await Promise.all([initiate(12), initiate(12)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    const pending = responses.find((r) => r.status === 201)!;
    expect((await available()).body.quantityAvailable).toBe(8);
    const decisions = await Promise.all([
      approve(pending.body.id),
      approve(pending.body.id),
    ]);
    expect(decisions.map((r) => r.status).sort()).toEqual([200, 404]);
    expect(
      (
        await prisma.inventory.findUniqueOrThrow({
          where: { productId: fixture.salt.id },
        })
      ).quantityAvailable,
    ).toBe(10);
    expect((await stock()).availableQuantity).toBe(12);
    expect(
      await prisma.inventoryTransaction.count({
        where: { productId: fixture.salt.id, transactionType: 'RETURN' },
      }),
    ).toBe(0);
  });

  it('enforces authorization, item/product linkage and positive whole quantities in the backend', async () => {
    fixture = await seed();
    for (const quantity of [0, -1, 1.5, 999])
      await initiate(quantity).expect(400);
    await initiate(1, fixture.saltItem.id, fixture.maggi.id).expect(404);
    await initiate(1, randomUUID()).expect(404);
    await initiate(1).set('x-test-role', 'owner').expect(403);
    const pending = await initiate(1).expect(201);
    await request(app.getHttpServer())
      .patch(`${base()}/return-requests/${pending.body.id}/approve`)
      .send({})
      .expect(403);
    expect((await stock()).availableQuantity).toBe(0);
  });

  it('marks an invoice fully returned only after every unit of both products is approved', async () => {
    fixture = await seed();
    await approve((await initiate(20).expect(201)).body.id).expect(200);
    expect(
      (await prisma.sale.findUniqueOrThrow({ where: { id: fixture.sale.id } }))
        .status,
    ).toBe('COMPLETED');
    await approve(
      (await initiate(50, fixture.maggiItem.id, fixture.maggi.id).expect(201))
        .body.id,
    ).expect(200);
    expect(
      (await prisma.sale.findUniqueOrThrow({ where: { id: fixture.sale.id } }))
        .status,
    ).toBe('REFUNDED');
    expect((await stock()).availableQuantity).toBe(20);
    expect((await stock(fixture.maggi.id)).availableQuantity).toBe(50);
    await initiate(1).expect(400);
  });

  it('repairs legacy partial-refund status without resetting return history', async () => {
    fixture = await seed();
    await approve((await initiate(2).expect(201)).body.id).expect(200);
    await prisma.sale.update({
      where: { id: fixture.sale.id },
      data: { status: 'REFUNDED' },
    });
    const migration = readFileSync(
      join(
        __dirname,
        '../prisma/migrations/20260915120000_preserve_partially_returned_sales/migration.sql',
      ),
      'utf8',
    );
    await prisma.$executeRawUnsafe(migration);
    expect(
      (await prisma.sale.findUniqueOrThrow({ where: { id: fixture.sale.id } }))
        .status,
    ).toBe('COMPLETED');
    expect((await available()).body).toMatchObject({
      quantityReturned: 2,
      quantityAvailable: 18,
    });
    expect((await stock()).availableQuantity).toBe(2);
  });
});
