import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GoodsDisbursementController } from './goods-disbursement.controller';
import { GoodsDisbursementService } from './goods-disbursement.service';

@Module({
  imports: [PrismaModule],
  controllers: [GoodsDisbursementController],
  providers: [GoodsDisbursementService],
})
export class GoodsDisbursementModule {}
