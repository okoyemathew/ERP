ALTER TABLE "GoodsDisbursement" ADD COLUMN "employeeId" UUID;

ALTER TABLE "GoodsDisbursement"
ADD CONSTRAINT "GoodsDisbursement_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "GoodsDisbursement_employeeId_idx" ON "GoodsDisbursement"("employeeId");
