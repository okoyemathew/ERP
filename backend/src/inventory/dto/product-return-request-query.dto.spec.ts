import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductReturnRequestQueryDto } from './product-return-request-query.dto';

describe('ProductReturnRequestQueryDto', () => {
  it('accepts mobile query string pagination values', async () => {
    const dto = plainToInstance(ProductReturnRequestQueryDto, {
      status: 'PENDING',
      page: '1',
      limit: '100',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(100);
  });
});
