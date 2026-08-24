import { Injectable } from '@nestjs/common';

@Injectable()
export class ProductImportService {
  prepareBulkImport(records: Array<Record<string, unknown>>) {
    return records.map((record, index) => ({
      rowNumber: index + 1,
      payload: record,
      status: 'pending',
    }));
  }
}
