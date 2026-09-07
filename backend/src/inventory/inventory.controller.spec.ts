import { ForbiddenException } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

const businessId = '11111111-1111-1111-1111-111111111111';
const otherBusinessId = '22222222-2222-2222-2222-222222222222';

const user: AuthenticatedUser = {
  id: '33333333-3333-3333-3333-333333333333',
  username: 'cashier',
  businessId,
  branchId: null,
  roleId: null,
  roleName: 'Cashier',
  employeeId: '44444444-4444-4444-4444-444444444444',
};

describe('InventoryController business access', () => {
  it('rejects route business ids that do not match the authenticated user', () => {
    const controller = new InventoryController({ findAll: jest.fn() } as never);

    expect(() => controller.findAll(otherBusinessId, {}, user)).toThrow(
      ForbiddenException,
    );
  });

  it('allows matching business ids through to the inventory service', () => {
    const inventoryService = { findAll: jest.fn().mockReturnValue({ data: [] }) };
    const controller = new InventoryController(inventoryService as never);

    const result = controller.findAll(businessId, {}, user);

    expect(result).toEqual({ data: [] });
    expect(inventoryService.findAll).toHaveBeenCalledWith(businessId, {});
  });
});
