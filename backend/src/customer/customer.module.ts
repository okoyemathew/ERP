import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerController } from './customer.controller';
import { CustomerApiController } from './customer-api.controller';
import { CustomerService } from './customer.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CustomerController, CustomerApiController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
