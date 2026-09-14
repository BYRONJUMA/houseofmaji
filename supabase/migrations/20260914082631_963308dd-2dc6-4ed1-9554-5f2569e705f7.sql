CREATE TABLE public.service_commissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_kes numeric NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.service_commissions TO authenticated;
GRANT ALL ON public.service_commissions TO service_role;

ALTER TABLE public.service_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own or managers can read service commissions"
ON public.service_commissions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'chief_engineer')
  OR public.has_role(auth.uid(), 'sales_head')
);

CREATE POLICY "Role holders can record service commissions"
ON public.service_commissions FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid()));

CREATE POLICY "Admins and chiefs can update service commissions"
ON public.service_commissions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'chief_engineer'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'chief_engineer'));

CREATE INDEX service_commissions_user_idx ON public.service_commissions (user_id, computed_at DESC);
CREATE INDEX service_commissions_service_idx ON public.service_commissions (service_id);

CREATE OR REPLACE FUNCTION public.service_commission_paid_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.paid IS DISTINCT FROM OLD.paid THEN
    NEW.paid_at := CASE WHEN NEW.paid THEN now() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_commissions_paid_stamp
BEFORE UPDATE ON public.service_commissions
FOR EACH ROW EXECUTE FUNCTION public.service_commission_paid_stamp();

INSERT INTO public.settings (key, value) VALUES
  ('service_commission_undersink_kes', '200'),
  ('service_commission_commercial_kes', '500')
ON CONFLICT (key) DO NOTHING;