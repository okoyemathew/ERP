ALTER TABLE "ProductReturnRequest"
ADD COLUMN "saleId" UUID,
ADD COLUMN "saleItemId" UUID,
ADD COLUMN "creditSaleId" UUID,
ADD COLUMN "customerId" UUID,
ADD COLUMN "originalSellerId" UUID;

CREATE INDEX "ProductReturnRequest_saleId_idx" ON "ProductReturnRequest"("saleId");
CREATE INDEX "ProductReturnRequest_saleItemId_idx" ON "ProductReturnRequest"("saleItemId");
CREATE INDEX "ProductReturnRequest_creditSaleId_idx" ON "ProductReturnRequest"("creditSaleId");
CREATE INDEX "ProductReturnRequest_customerId_idx" ON "ProductReturnRequest"("customerId");
CREATE INDEX "ProductReturnRequest_originalSellerId_idx" ON "ProductReturnRequest"("originalSellerId");

ALTER TABLE "ProductReturnRequest"
ADD CONSTRAINT "ProductReturnRequest_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductReturnRequest"
ADD CONSTRAINT "ProductReturnRequest_saleItemId_fkey"
FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductReturnRequest"
ADD CONSTRAINT "ProductReturnRequest_creditSaleId_fkey"
FOREIGN KEY ("creditSaleId") REFERENCES "CreditSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductReturnRequest"
ADD CONSTRAINT "ProductReturnRequest_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductReturnRequest"
ADD CONSTRAINT "ProductReturnRequest_originalSellerId_fkey"
FOREIGN KEY ("originalSellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
