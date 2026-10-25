-- Keep existing duplicate rows intact, but make duplicate checks efficient.
CREATE INDEX "Product_businessId_normalizedName_idx"
ON "Product" ("businessId", lower(btrim("name")));

CREATE OR REPLACE FUNCTION prevent_duplicate_product_business_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Do not block edits to other fields on legacy duplicate product rows.
  IF TG_OP = 'UPDATE'
     AND OLD."businessId" = NEW."businessId"
     AND lower(btrim(OLD."name")) = lower(btrim(NEW."name")) THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent inserts/renames of the same normalized name.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW."businessId"::text || ':' || lower(btrim(NEW."name")), 0)
  );

  IF EXISTS (
    SELECT 1
    FROM "Product" p
    WHERE p."businessId" = NEW."businessId"
      AND lower(btrim(p."name")) = lower(btrim(NEW."name"))
      AND (TG_OP <> 'UPDATE' OR p."id" <> NEW."id")
  ) THEN
    RAISE EXCEPTION 'A product with this name already exists for this business'
      USING ERRCODE = '23505',
            CONSTRAINT = 'Product_businessId_normalizedName_key';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_duplicate_product_business_name
BEFORE INSERT OR UPDATE OF "businessId", "name" ON "Product"
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_product_business_name();
