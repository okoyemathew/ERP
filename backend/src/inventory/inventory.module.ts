import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryTransactionService } from './inventory-transaction.service';
import { StockAdjustmentService } from './stock-adjustment.service';

@Module({
  imports: [PrismaModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryTransactionService,
    StockAdjustmentService,
  ],
  exports: [
    InventoryService,
    InventoryTransactionService,
    StockAdjustmentService,
  ],
})
export class InventoryModule {}
