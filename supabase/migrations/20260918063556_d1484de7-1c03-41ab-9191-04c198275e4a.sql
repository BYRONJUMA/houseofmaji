CREATE SEQUENCE IF NOT EXISTS public.quotation_no_seq START 1;

CREATE TABLE public.quotations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_no text NOT NULL UNIQUE,
  branch_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.pos_customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  description text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','completed')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotations_select" ON public.quotations FOR SELECT TO authenticated
  USING (public.can_use_branch(auth.uid(), branch_id));
CREATE POLICY "quotations_insert" ON public.quotations FOR INSERT TO authenticated
  WITH CHECK (public.can_write_branch_pos(auth.uid(), branch_id));
CREATE POLICY "quotations_update" ON public.quotations FOR UPDATE TO authenticated
  USING (public.can_write_branch_pos(auth.uid(), branch_id))
  WITH CHECK (public.can_write_branch_pos(auth.uid(), branch_id));
CREATE POLICY "quotations_delete" ON public.quotations FOR DELETE TO authenticated
  USING (public.can_write_branch_pos(auth.uid(), branch_id));

CREATE TABLE public.quotation_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.store_products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  tax_percent numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT ALL ON public.quotation_items TO service_role;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotation_items_select" ON public.quotation_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND public.can_use_branch(auth.uid(), q.branch_id)));
CREATE POLICY "quotation_items_write" ON public.quotation_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND public.can_write_branch_pos(auth.uid(), q.branch_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND public.can_write_branch_pos(auth.uid(), q.branch_id)));

CREATE INDEX quotations_branch_idx ON public.quotations(branch_id, created_at DESC);
CREATE INDEX quotation_items_quotation_idx ON public.quotation_items(quotation_id);

CREATE OR REPLACE FUNCTION public.quotation_assign_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.quotation_no IS NULL OR NEW.quotation_no = '' THEN
    NEW.quotation_no := 'QT-' || lpad(nextval('public.quotation_no_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER quotations_assign_no BEFORE INSERT ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.quotation_assign_no();

CREATE TRIGGER quotations_touch BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();