ALTER TABLE "public"."Sale" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Sale_businessId_idempotencyKey_key"
  ON "public"."Sale"("businessId", "idempotencyKey");
