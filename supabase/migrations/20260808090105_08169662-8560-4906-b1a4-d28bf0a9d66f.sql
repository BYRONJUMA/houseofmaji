CREATE SEQUENCE IF NOT EXISTS public.delivery_no_seq START WITH 1000 INCREMENT BY 1;

CREATE TABLE public.delivery_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fulfillment_id uuid NOT NULL UNIQUE REFERENCES public.fulfillments(id) ON DELETE CASCADE,
  delivery_no text NOT NULL DEFAULT ('HOM/UF/' || nextval('public.delivery_no_seq')::text),
  date_delivered date,
  capacity_lph numeric,
  machine_serial_no text,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  remarks text,
  engineer_signoff_name text,
  engineer_signoff_at timestamp with time zone,
  client_signature_data text,
  client_signoff_at timestamp with time zone,
  chief_signoff_name text,
  chief_signoff_at timestamp with time zone,
  started_by uuid REFERENCES public.profiles(id),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.delivery_checklists TO authenticated;
GRANT ALL ON public.delivery_checklists TO service_role;
GRANT USAGE ON SEQUENCE public.delivery_no_seq TO authenticated, service_role;

ALTER TABLE public.delivery_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklists readable" ON public.delivery_checklists
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "engineers and chief create checklists" ON public.delivery_checklists
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'engineer')
    OR public.has_role(auth.uid(), 'chief_engineer')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "engineers and chief edit checklists" ON public.delivery_checklists
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'engineer')
    OR public.has_role(auth.uid(), 'chief_engineer')
    OR public.has_role(auth.uid(), 'admin')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'engineer')
    OR public.has_role(auth.uid(), 'chief_engineer')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER delivery_checklists_touch
  BEFORE UPDATE ON public.delivery_checklists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
