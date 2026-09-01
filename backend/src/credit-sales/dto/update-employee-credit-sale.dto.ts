import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEmployeeCreditSaleDto {
  @ApiPropertyOptional({ description: 'Updated credit due date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  @ApiPropertyOptional({ description: 'Updated sale remarks' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}
