import { CreditSalesService } from './credit-sales.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

const businessId = '11111111-1111-1111-1111-111111111111';
const employeeUserId = '22222222-2222-2222-2222-222222222222';
const ownerUserId = '33333333-3333-3333-3333-333333333333';

const employee: AuthenticatedUser = {
  id: employeeUserId,
  username: 'cashier',
  businessId,
  branchId: null,
  roleId: null,
  roleName: 'Cashier',
  employeeId: '44444444-4444-4444-4444-444444444444',
};

describe('CreditSalesService authenticated ownership', () => {
  it('scopes employee credit sale queries to the authenticated user sale records', () => {
    const service = new CreditSalesService({} as never);
    const where = (
      service as unknown as {
        buildWhere: (
          businessId: string,
          query: Record<string, unknown>,
          viewer?: AuthenticatedUser,
        ) => { sale?: { userId?: string } };
      }
    ).buildWhere(businessId, {}, employee);

    expect(where.sale).toEqual(
      expect.objectContaining({
        businessId,
        userId: employeeUserId,
      }),
    );
  });

  it('allows owners to query business-wide credit sales', () => {
    const service = new CreditSalesService({} as never);
    const owner: AuthenticatedUser = {
      ...employee,
      id: ownerUserId,
      roleName: 'Owner',
      employeeId: null,
    };
    const where = (
      service as unknown as {
        buildWhere: (
          businessId: string,
          query: Record<string, unknown>,
          viewer?: AuthenticatedUser,
        ) => { sale?: { userId?: string } };
      }
    ).buildWhere(businessId, {}, owner);

    expect(where.sale).toEqual(
      expect.objectContaining({
        businessId,
      }),
    );
    expect(where.sale?.userId).toBeUndefined();
  });
});
