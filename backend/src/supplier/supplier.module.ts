import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';
import { PurchaseOrderController } from './purchase-order.controller';
import { PurchaseOrderService } from './purchase-order.service';
import { GoodsSuppliedController } from './goods-supplied.controller';
import { GoodsSuppliedService } from './goods-supplied.service';

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [
    SupplierController,
    PurchaseOrderController,
    GoodsSuppliedController,
  ],
  providers: [SupplierService, PurchaseOrderService, GoodsSuppliedService],
  exports: [SupplierService, PurchaseOrderService, GoodsSuppliedService],
})
export class SupplierModule {}
