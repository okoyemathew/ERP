ALTER TABLE "CreditPayment" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "CreditPayment_idempotencyKey_key" ON "CreditPayment"("idempotencyKey");
