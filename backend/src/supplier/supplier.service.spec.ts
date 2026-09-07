import { AuditAction } from '@prisma/client';
import { SupplierService } from './supplier.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

const businessId = '11111111-1111-1111-1111-111111111111';
const supplierId = '22222222-2222-2222-2222-222222222222';
const employeeUserId = '33333333-3333-3333-3333-333333333333';
const purchaseOrderId = '44444444-4444-4444-4444-444444444444';
const goodsSuppliedId = '55555555-5555-5555-5555-555555555555';

const employee: AuthenticatedUser = {
  id: employeeUserId,
  username: 'inventory',
  businessId,
  branchId: null,
  roleId: null,
  roleName: 'Inventory Officer',
  employeeId: '66666666-6666-6666-6666-666666666666',
};

function createPrismaMock() {
  return {
    auditLog: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ entityId: purchaseOrderId }])
        .mockResolvedValueOnce([{ entityId: goodsSuppliedId }]),
    },
    supplier: {
      findFirst: jest.fn().mockResolvedValue({
        id: supplierId,
        businessId,
        companyName: 'Supplier One',
        phone: '08000000000',
        outstandingBalance: 0,
        status: 'ACTIVE',
      }),
    },
  };
}

describe('SupplierService activity scoping', () => {
  it('scopes nested supplier activity to records created by the authenticated employee', async () => {
    const prisma = createPrismaMock();
    const service = new SupplierService(prisma as never);

    await service.findOne(businessId, supplierId, employee);

    expect(prisma.auditLog.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          businessId,
          userId: employeeUserId,
          action: AuditAction.CREATE,
          entity: 'PurchaseOrder',
        }),
      }),
    );
    expect(prisma.auditLog.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          businessId,
          userId: employeeUserId,
          action: AuditAction.CREATE,
          entity: 'GoodsSupplied',
        }),
      }),
    );
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          purchaseOrders: expect.objectContaining({
            where: { id: { in: [purchaseOrderId] } },
          }),
          goodsSupplied: expect.objectContaining({
            where: { id: { in: [goodsSuppliedId] } },
          }),
        }),
      }),
    );
  });
});
