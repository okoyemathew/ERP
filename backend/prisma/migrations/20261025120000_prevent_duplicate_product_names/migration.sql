-- Product names identify one catalog item per business, regardless of case
-- or accidental surrounding whitespace.
CREATE UNIQUE INDEX "Product_businessId_normalizedName_key"
ON "Product" ("businessId", lower(btrim("name")));
