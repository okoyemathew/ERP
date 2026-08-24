import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditSalesController } from './credit-sales.controller';
import { CreditSalesService } from './credit-sales.service';

@Module({
  imports: [PrismaModule],
  controllers: [CreditSalesController],
  providers: [CreditSalesService],
  exports: [CreditSalesService],
})
export class CreditSalesModule {}
