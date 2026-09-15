-- Earlier return approvals marked the whole invoice refunded after any return.
-- Restore only invoices with linked approved returns and unreturned sale units.
-- Keep every original sale item, return, and payment record intact.
UPDATE "Sale" s
SET "status" = 'COMPLETED', "updatedAt" = CURRENT_TIMESTAMP
WHERE s."status" = 'REFUNDED'
  AND s."deletedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "ProductReturnRequest" r
    WHERE r."saleId" = s.id AND r.status = 'APPROVED'
  )
  AND EXISTS (
    SELECT 1 FROM "SaleItem" i
    WHERE i."saleId" = s.id
      AND i.quantity > COALESCE((
        SELECT SUM(r.quantity) FROM "ProductReturnRequest" r
        WHERE r."saleItemId" = i.id AND r.status = 'APPROVED'
      ), 0)
  );
