CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product categories read" ON public.product_categories
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "product categories manage" ON public.product_categories
  FOR ALL TO authenticated
  USING (public.can_manage_taxonomy(auth.uid()))
  WITH CHECK (public.can_manage_taxonomy(auth.uid()));

CREATE TRIGGER product_categories_touch BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.product_categories (name)
SELECT DISTINCT btrim(category) FROM public.store_products
WHERE category IS NOT NULL AND btrim(category) <> ''
ON CONFLICT (name) DO NOTHING;