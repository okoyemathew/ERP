import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class EmployeeLoginAccessDto {
  @ApiProperty({ description: 'Whether the employee is allowed to login' })
  @IsBoolean()
  canLogin!: boolean;

  @ApiPropertyOptional({ description: 'Reason for login access change' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
