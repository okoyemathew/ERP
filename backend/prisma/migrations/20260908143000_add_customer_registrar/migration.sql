ALTER TABLE "Customer"
ADD COLUMN "createdById" UUID;

UPDATE "Customer" AS customer
SET "createdById" = owner."userId"
FROM (
  SELECT DISTINCT ON (employee."businessId")
    employee."businessId",
    employee."userId"
  FROM "Employee" AS employee
  INNER JOIN "User" AS user_account ON user_account."id" = employee."userId"
  INNER JOIN "Role" AS role ON role."id" = user_account."roleId"
  WHERE role."name" = 'Owner'
  ORDER BY employee."businessId", employee."createdAt" ASC
) AS owner
WHERE customer."businessId" = owner."businessId"
  AND customer."createdById" IS NULL;

UPDATE "Customer" AS customer
SET "createdById" = first_sale."userId"
FROM (
  SELECT DISTINCT ON ("customerId")
    "customerId",
    "userId"
  FROM "Sale"
  WHERE "customerId" IS NOT NULL
    AND "deletedAt" IS NULL
  ORDER BY "customerId", "saleDate" ASC, "createdAt" ASC
) AS first_sale
WHERE customer."id" = first_sale."customerId";

UPDATE "Customer" AS customer
SET "createdById" = first_credit_payment."userId"
FROM (
  SELECT DISTINCT ON ("customerId")
    "customerId",
    "userId"
  FROM "CreditPayment"
  WHERE "userId" IS NOT NULL
  ORDER BY "customerId", "paymentDate" ASC, "createdAt" ASC
) AS first_credit_payment
WHERE customer."id" = first_credit_payment."customerId"
  AND customer."createdById" IS NULL;

CREATE INDEX "Customer_createdById_idx" ON "Customer"("createdById");

ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
