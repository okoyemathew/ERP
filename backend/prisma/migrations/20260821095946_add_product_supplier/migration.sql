-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "supplierId" UUID;

-- CreateIndex
CREATE INDEX "Product_supplierId_idx" ON "public"."Product"("supplierId");

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
