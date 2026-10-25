CREATE OR REPLACE FUNCTION prevent_duplicate_product_business_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Deactivated products are retained for history and do not reserve a name.
  IF NOT NEW."isActive" THEN
    RETURN NEW;
  END IF;

  -- Allow edits to other fields on existing active legacy duplicates.
  IF TG_OP = 'UPDATE'
     AND OLD."isActive"
     AND OLD."businessId" = NEW."businessId"
     AND lower(btrim(OLD."name")) = lower(btrim(NEW."name")) THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent inserts, renames, and reactivations of the same name.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW."businessId"::text || ':' || lower(btrim(NEW."name")), 0)
  );

  IF EXISTS (
    SELECT 1
    FROM "Product" p
    WHERE p."businessId" = NEW."businessId"
      AND p."isActive" = true
      AND lower(btrim(p."name")) = lower(btrim(NEW."name"))
      AND (TG_OP <> 'UPDATE' OR p."id" <> NEW."id")
  ) THEN
    RAISE EXCEPTION 'An active product with this name already exists for this business'
      USING ERRCODE = '23505',
            CONSTRAINT = 'Product_businessId_normalizedName_key';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_product_business_name ON "Product";
CREATE TRIGGER prevent_duplicate_product_business_name
BEFORE INSERT OR UPDATE OF "businessId", "name", "isActive" ON "Product"
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_product_business_name();
