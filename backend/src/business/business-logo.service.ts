import { Injectable, UnsupportedMediaTypeException } from '@nestjs/common';

interface UploadFile {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}

@Injectable()
export class BusinessLogoService {
  prepareUpload(businessId: string, file: UploadFile) {
    if (!file) {
      throw new UnsupportedMediaTypeException('Logo file is required');
    }

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException('Unsupported logo file type');
    }

    return {
      businessId,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    };
  }
}
