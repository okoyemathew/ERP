import {
  BadRequestException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

export type UploadedProductImage = {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  path?: string;
};

@Injectable()
export class ProductImageUploadService {
  validate(file: UploadedProductImage): void {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Product image file is required');
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        'Unsupported image type. Use JPEG, PNG, WEBP, or GIF.',
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Product image must be 5MB or smaller');
    }
  }

  prepareUpload(file: UploadedProductImage): { url: string; filename: string } {
    this.validate(file);

    const safeName = file.originalname.replace(/\s+/g, '-').toLowerCase();
    const filename = `${Date.now()}-${safeName}`;

    return {
      url: `/uploads/products/${filename}`,
      filename,
    };
  }
}
