UPDATE "Sale"
SET
  "status" = 'REFUNDED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (
  SELECT DISTINCT "saleId"
  FROM "ProductReturnRequest"
  WHERE "status" = 'APPROVED'
    AND "saleId" IS NOT NULL
)
AND "status" <> 'REFUNDED';
