ALTER TABLE "Product" ADD COLUMN "baseSellingPrice" DECIMAL(12, 2);

UPDATE "Product"
SET "baseSellingPrice" = "sellingPrice"
WHERE "baseSellingPrice" IS NULL;

ALTER TABLE "Product" ALTER COLUMN "baseSellingPrice" SET NOT NULL;
