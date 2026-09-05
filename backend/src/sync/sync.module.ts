import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { SalesModule } from '../sales/sales.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [PrismaModule, SalesModule, ExpensesModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
