UPDATE "Customer" AS customer
SET "createdById" = creator."userId"
FROM (
  SELECT DISTINCT ON ("entityId")
    "entityId",
    "userId"
  FROM "AuditLog"
  WHERE "entity" = 'Customer'
    AND "action" = 'CREATE'
    AND "entityId" IS NOT NULL
    AND "userId" IS NOT NULL
  ORDER BY "entityId", "createdAt" ASC
) AS creator
WHERE customer."id"::text = creator."entityId"
  AND customer."businessId" IN (
    SELECT "businessId"
    FROM "User"
    WHERE "User"."id" = creator."userId"
  )
  AND customer."createdById" IS DISTINCT FROM creator."userId";
