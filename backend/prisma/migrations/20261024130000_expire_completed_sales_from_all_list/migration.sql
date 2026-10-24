ALTER TABLE "Sale"
ADD COLUMN "completedAt" TIMESTAMP(3);

-- Existing sales do not have an exact completion timestamp. saleDate is the
-- closest historical completion-time value available for completed sales.
UPDATE "Sale"
SET "completedAt" = COALESCE("saleDate", "updatedAt", "createdAt")
WHERE "status" IN ('COMPLETED', 'REFUNDED');

CREATE INDEX "Sale_businessId_completedAt_idx"
ON "Sale"("businessId", "completedAt");
