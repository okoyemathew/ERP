import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { CreateProductBarcodeDto } from './dto/create-product-barcode.dto';
import { ProductSearchDto } from './dto/product-search.dto';
import { ProductQueryDto } from './product-query.dto';
import { ProductImageUploadService } from './product-image-upload.service';
import type { UploadedProductImage } from './product-image-upload.service';
import { BarcodeGenerationService } from './barcode-generation.service';
import { ProductImportService } from './product-import.service';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('businesses/:businessId/products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly productImageUploadService: ProductImageUploadService,
    private readonly barcodeGenerationService: BarcodeGenerationService,
    private readonly productImportService: ProductImportService,
  ) {}

  @Post()
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Create product' })
  create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.create(businessId, dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List active products' })
  findAll(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() query: ProductQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.findAll(businessId, query, user);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search products by barcode, SKU, category, brand, or unit',
  })
  search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() query: ProductSearchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    if (query.barcode) {
      return this.productService.searchByBarcode(businessId, query.barcode, user);
    }
    if (query.sku) {
      return this.productService.searchBySku(businessId, query.sku, user);
    }
    if (query.category) {
      return this.productService.searchByCategory(
        businessId,
        query.category,
        user,
      );
    }
    if (query.brand) {
      return this.productService.searchByBrand(businessId, query.brand, user);
    }
    if (query.unit) {
      return this.productService.searchByUnit(businessId, query.unit, user);
    }

    return this.productService.findAll(businessId, undefined, user);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'List products below or at reorder level' })
  findLowStockProducts(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.findLowStockProducts(businessId, user);
  }

  @Get('available')
  @ApiOperation({ summary: 'List products currently available in inventory' })
  findAvailableProducts(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.findAvailableProducts(businessId, user);
  }

  @Get('barcode/generate')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Generate barcode for a product' })
  generateBarcode(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return { barcode: this.barcodeGenerationService.generateEan13() };
  }

  @Post('bulk-import/prepare')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Prepare bulk product import payload' })
  prepareBulkImport(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() records: Array<Record<string, unknown>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productImportService.prepareBulkImport(records);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by id' })
  findOne(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.findOne(businessId, id, user);
  }

  @Patch(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Update product' })
  update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.update(businessId, id, dto, user);
  }

  @Delete(':id')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN)
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Delete product' })
  remove(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.remove(businessId, id, user);
  }

  @Post(':id/images')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Add product image' })
  addImage(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductImageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.addImage(businessId, productId, dto);
  }

  @Patch(':id/images/:imageId/primary')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Set primary product image' })
  setPrimaryImage(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.setPrimaryImage(businessId, productId, imageId);
  }

  @Delete(':id/images/:imageId')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Delete product image' })
  removeImage(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.removeImage(businessId, productId, imageId);
  }

  @Post(':id/barcodes')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Add product barcode' })
  addBarcode(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductBarcodeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.addBarcode(businessId, productId, dto);
  }

  @Delete(':id/barcodes/:barcodeId')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('products.manage')
  @ApiOperation({ summary: 'Delete product barcode' })
  removeBarcode(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('barcodeId', ParseUUIDPipe) barcodeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    return this.productService.removeBarcode(businessId, productId, barcodeId);
  }

  @Post(':id/upload-image')
  @Roles(SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.INVENTORY_OFFICER)
  @Permissions('products.manage')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload product image' })
  async uploadImage(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) productId: string,
    @UploadedFile() file: UploadedProductImage,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertBusinessAccess(businessId, user);
    const prepared = this.productImageUploadService.prepareUpload({
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });

    return this.productService.addImage(businessId, productId, {
      imageUrl: prepared.url,
      isPrimary: true,
    });
  }

  private assertBusinessAccess(businessId: string, user: AuthenticatedUser) {
    if (businessId !== user.businessId) {
      throw new ForbiddenException('Access denied to this business');
    }
  }
}
