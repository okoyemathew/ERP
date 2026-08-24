import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BusinessModule } from './business/business.module';
import { CashRegisterModule } from './cash-register/cash-register.module';
import { CreditSalesModule } from './credit-sales/credit-sales.module';
import { CustomerModule } from './customer/customer.module';
import { EmployeeModule } from './employee/employee.module';
import { ExpensesModule } from './expenses/expenses.module';
import { GoodsDisbursementModule } from './goods-disbursement/goods-disbursement.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProductModule } from './product/product.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { SyncModule } from './sync/sync.module';
import { SupplierModule } from './supplier/supplier.module';
import { GlobalAuthMiddleware } from './auth/middleware/global-auth.middleware';
import { RateLimitMiddleware } from './auth/middleware/rate-limit.middleware';
import { validateEnvironment } from './config/environment';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    BusinessModule,
    CashRegisterModule,
    CreditSalesModule,
    CustomerModule,
    EmployeeModule,
    ExpensesModule,
    GoodsDisbursementModule,
    InventoryModule,
    NotificationsModule,
    ProductModule,
    ReportsModule,
    SalesModule,
    SyncModule,
    SupplierModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(GlobalAuthMiddleware, RateLimitMiddleware).forRoutes('*');
  }
}
