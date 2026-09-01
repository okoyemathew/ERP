-- CreateEnum
CREATE TYPE "CreditSaleEmployeeAction" AS ENUM ('EDIT', 'DELETE');

-- CreateEnum
CREATE TYPE "CreditSaleActionApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'USED');

-- AlterTable
ALTER TABLE "CreditSale"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" UUID,
ADD COLUMN "deletionReason" TEXT;

-- CreateTable
CREATE TABLE "CreditSaleActionRequest" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "creditSaleId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "approvedById" UUID,
    "action" "CreditSaleEmployeeAction" NOT NULL,
    "status" "CreditSaleActionApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decisionNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditSaleActionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditSale_deletedAt_idx" ON "CreditSale"("deletedAt");

-- CreateIndex
CREATE INDEX "CreditSaleActionRequest_businessId_idx" ON "CreditSaleActionRequest"("businessId");

-- CreateIndex
CREATE INDEX "CreditSaleActionRequest_creditSaleId_idx" ON "CreditSaleActionRequest"("creditSaleId");

-- CreateIndex
CREATE INDEX "CreditSaleActionRequest_requestedById_idx" ON "CreditSaleActionRequest"("requestedById");

-- CreateIndex
CREATE INDEX "CreditSaleActionRequest_approvedById_idx" ON "CreditSaleActionRequest"("approvedById");

-- CreateIndex
CREATE INDEX "CreditSaleActionRequest_action_idx" ON "CreditSaleActionRequest"("action");

-- CreateIndex
CREATE INDEX "CreditSaleActionRequest_status_idx" ON "CreditSaleActionRequest"("status");

-- CreateIndex
CREATE INDEX "CreditSaleActionRequest_expiresAt_idx" ON "CreditSaleActionRequest"("expiresAt");

-- AddForeignKey
ALTER TABLE "CreditSaleActionRequest" ADD CONSTRAINT "CreditSaleActionRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSaleActionRequest" ADD CONSTRAINT "CreditSaleActionRequest_creditSaleId_fkey" FOREIGN KEY ("creditSaleId") REFERENCES "CreditSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSaleActionRequest" ADD CONSTRAINT "CreditSaleActionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSaleActionRequest" ADD CONSTRAINT "CreditSaleActionRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
