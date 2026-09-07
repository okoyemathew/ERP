CREATE TYPE "ProductReturnRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "ProductReturnRequest" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "reviewedById" UUID,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2),
    "referenceNumber" TEXT,
    "remarks" TEXT,
    "status" "ProductReturnRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "inventoryTransactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductReturnRequest_businessId_idx" ON "ProductReturnRequest"("businessId");
CREATE INDEX "ProductReturnRequest_productId_idx" ON "ProductReturnRequest"("productId");
CREATE INDEX "ProductReturnRequest_requestedById_idx" ON "ProductReturnRequest"("requestedById");
CREATE INDEX "ProductReturnRequest_reviewedById_idx" ON "ProductReturnRequest"("reviewedById");
CREATE INDEX "ProductReturnRequest_status_idx" ON "ProductReturnRequest"("status");

ALTER TABLE "ProductReturnRequest" ADD CONSTRAINT "ProductReturnRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReturnRequest" ADD CONSTRAINT "ProductReturnRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReturnRequest" ADD CONSTRAINT "ProductReturnRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductReturnRequest" ADD CONSTRAINT "ProductReturnRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
