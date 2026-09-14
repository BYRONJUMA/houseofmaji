DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_product_type') THEN
    CREATE TYPE public.store_product_type AS ENUM ('finished_product', 'raw_material', 'service');
  END IF;
END $$;

ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS buying_price numeric,
  ADD COLUMN IF NOT EXISTS selling_price numeric,
  ADD COLUMN IF NOT EXISTS tax_category_percent numeric NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS product_type public.store_product_type NOT NULL DEFAULT 'finished_product';

ALTER TABLE public.store_products ALTER COLUMN brand SET DEFAULT 'House of Maji';