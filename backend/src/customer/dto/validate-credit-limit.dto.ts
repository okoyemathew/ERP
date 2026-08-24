import { ApiProperty } from '@nestjs/swagger';
import { Min } from 'class-validator';

export class ValidateCreditLimitDto {
  @ApiProperty({ description: 'Credit amount to validate', minimum: 0.01 })
  @Min(0.01)
  amount!: number;
}
