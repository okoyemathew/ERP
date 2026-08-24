import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CategoryController } from './category.controller';
import { BrandController } from './brand.controller';
import { UnitController } from './unit.controller';
import { ProductController } from './product.controller';
import { CategoryService } from './category.service';
import { BrandService } from './brand.service';
import { UnitService } from './unit.service';
import { ProductService } from './product.service';
import { ProductImageUploadService } from './product-image-upload.service';
import { BarcodeGenerationService } from './barcode-generation.service';
import { ProductImportService } from './product-import.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    CategoryController,
    BrandController,
    UnitController,
    ProductController,
  ],
  providers: [
    CategoryService,
    BrandService,
    UnitService,
    ProductService,
    ProductImageUploadService,
    BarcodeGenerationService,
    ProductImportService,
  ],
  exports: [
    CategoryService,
    BrandService,
    UnitService,
    ProductService,
    ProductImageUploadService,
    BarcodeGenerationService,
    ProductImportService,
  ],
})
export class ProductModule {}
