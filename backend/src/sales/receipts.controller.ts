import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ReceiptQueryDto } from './dto/receipt-query.dto';
import { SalesService } from './sales.service';

const RECEIPT_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.SALESPERSON,
] as const;

@ApiTags('Receipts')
@ApiBearerAuth()
@Permissions('receipt.manage')
@Roles(...RECEIPT_ROLES)
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'List receipt history' })
  @ApiOkResponse({
    description:
      'Paginated immutable receipt history for completed sales in the current business',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReceiptQueryDto,
  ) {
    return this.salesService.findReceipts(user.businessId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get receipt data' })
  @ApiOkResponse({
    description:
      'Immutable receipt data including business, sale, customer, item, payment, and footer details',
  })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.salesService.getReceipt(user.businessId, id);
  }

  @Get(':id/print')
  @ApiOperation({ summary: 'Get print-ready receipt output' })
  @ApiOkResponse({
    description:
      'Print-ready receipt payload with semantic lines and formatted text for 58mm or 80mm thermal printers. Printer transport is handled by the client app.',
  })
  print(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.salesService.getReceiptPrintData(user.businessId, id);
  }

  @Get(':id/reprint')
  @ApiOperation({
    summary: 'Audit and return print-ready receipt output for reprint',
  })
  @ApiOkResponse({
    description:
      'Print-ready receipt payload marked as a reprint. The reprint action is recorded in the audit log.',
  })
  getReprint(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.salesService.reprintReceipt(user.businessId, id, user);
  }

  @Post(':id/reprint')
  @ApiOperation({
    summary: 'Audit and return print-ready receipt output for reprint',
  })
  @ApiOkResponse({
    description:
      'Print-ready receipt payload marked as a reprint. The reprint action is recorded in the audit log.',
  })
  reprint(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.salesService.reprintReceipt(user.businessId, id, user);
  }
}
