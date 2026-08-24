import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { SyncBatchDto } from './dto/sync-operation.dto';
import { SyncService } from './sync.service';

@ApiTags('Sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  @ApiOperation({ summary: 'Synchronize queued offline operations' })
  sync(@CurrentUser() user: AuthenticatedUser, @Body() dto: SyncBatchDto) {
    return this.syncService.sync(user.businessId, dto, user);
  }
}
