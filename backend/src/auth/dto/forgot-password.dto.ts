import { PasswordResetChannel } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  emailOrPhone!: string;

  @IsOptional()
  @IsEnum(PasswordResetChannel)
  channel?: PasswordResetChannel;
}
