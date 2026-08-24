import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { BusinessLogoService } from './business-logo.service';
import { BusinessDashboardService } from './business-dashboard.service';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessController],
  providers: [
    BusinessService,
    BusinessLogoService,
    BusinessDashboardService,
    AuditLogService,
  ],
  exports: [BusinessService, BusinessDashboardService, AuditLogService],
})
export class BusinessModule {}
