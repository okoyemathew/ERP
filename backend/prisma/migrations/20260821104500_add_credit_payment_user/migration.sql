-- Add employee/user tracking to credit payment collection.
ALTER TABLE "public"."CreditPayment" ADD COLUMN "userId" UUID;

CREATE INDEX "CreditPayment_userId_idx" ON "public"."CreditPayment"("userId");

ALTER TABLE "public"."CreditPayment"
  ADD CONSTRAINT "CreditPayment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
