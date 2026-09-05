import { PartialType } from '@nestjs/swagger';
import { CreateGoodsDisbursementDto } from './create-goods-disbursement.dto';

export class UpdateGoodsDisbursementDto extends PartialType(
  CreateGoodsDisbursementDto,
) {}
