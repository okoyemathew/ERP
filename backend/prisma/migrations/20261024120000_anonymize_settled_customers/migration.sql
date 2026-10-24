UPDATE "Customer" AS customer
SET
  "customerCode" = NULL,
  "firstName" = 'Former',
  "lastName" = 'Customer',
  "companyName" = NULL,
  "email" = NULL,
  "phone" = 'REDACTED-' || customer."id"::text,
  "address" = NULL,
  "city" = NULL,
  "state" = NULL,
  "country" = NULL,
  "creditLimit" = 0,
  "notes" = NULL,
  "status" = 'INACTIVE',
  "deletedAt" = NOW(),
  "isSynced" = TRUE,
  "syncVersion" = customer."syncVersion" + 1,
  "updatedAt" = NOW()
WHERE customer."deletedAt" IS NULL
  AND customer."outstandingBalance" <= 0
  AND EXISTS (
    SELECT 1
    FROM "Sale" AS sale
    WHERE sale."customerId" = customer."id"
      AND sale."businessId" = customer."businessId"
      AND sale."status" = 'COMPLETED'
      AND sale."paymentStatus" = 'PAID'
      AND sale."balanceDue" <= 0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Sale" AS sale
    WHERE sale."customerId" = customer."id"
      AND sale."businessId" = customer."businessId"
      AND (
        sale."status" = 'PENDING'
        OR (sale."status" = 'COMPLETED' AND sale."balanceDue" > 0)
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "CreditSale" AS credit_sale
    WHERE credit_sale."customerId" = customer."id"
      AND credit_sale."balance" > 0
      AND credit_sale."status" <> 'PAID'
      AND credit_sale."deletedAt" IS NULL
  );

UPDATE "AuditLog" AS audit
SET "description" = CASE
  WHEN audit."entity" = 'CustomerStatus' THEN 'Changed customer status'
  WHEN audit."action" = 'CREATE' THEN 'Created customer record'
  ELSE 'Updated customer record'
END
WHERE audit."entity" IN ('Customer', 'CustomerStatus')
  AND EXISTS (
    SELECT 1
    FROM "Customer" AS customer
    WHERE customer."id"::text = audit."entityId"
      AND customer."phone" LIKE 'REDACTED-%'
  );

UPDATE "AuditLog" AS audit
SET "description" = 'Created credit sale transaction'
WHERE audit."entity" = 'CreditSale'
  AND audit."entityId" IN (
    SELECT credit_sale."id"::text
    FROM "CreditSale" AS credit_sale
    JOIN "Customer" AS customer ON customer."id" = credit_sale."customerId"
    WHERE customer."phone" LIKE 'REDACTED-%'
  );

UPDATE "AuditLog" AS audit
SET "description" = 'Collected customer credit payment'
WHERE audit."entity" = 'CreditPayment'
  AND EXISTS (
    SELECT 1
    FROM "Customer" AS customer
    WHERE customer."id"::text = audit."entityId"
      AND customer."phone" LIKE 'REDACTED-%'
  );
