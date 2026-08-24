import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReceiptsController } from './receipts.controller';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [PrismaModule],
  controllers: [SalesController, ReceiptsController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
