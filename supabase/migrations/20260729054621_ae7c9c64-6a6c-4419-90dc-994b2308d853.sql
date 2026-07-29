CREATE TYPE public.app_role AS ENUM ('sales_rep','chief_engineer','engineer','admin');
CREATE TYPE public.commission_role AS ENUM ('sales','assembly','installation');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role public.app_role NOT NULL DEFAULT 'sales_rep',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role);
$fn$;

CREATE POLICY "profiles readable by signed in" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  location text NOT NULL,
  water_analysis_notes text,
  machine_type text NOT NULL,
  agreed_price numeric(14,2) NOT NULL,
  agreed_delivery_date date NOT NULL,
  sales_rep_id uuid NOT NULL REFERENCES public.profiles(id),
  chief_engineer_id uuid REFERENCES public.profiles(id),
  assembly_engineer_id uuid REFERENCES public.profiles(id),
  installation_engineer_id uuid REFERENCES public.profiles(id),
  frame_ordered_at timestamptz,
  current_stage text NOT NULL DEFAULT 'received',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.fulfillments TO authenticated;
GRANT ALL ON public.fulfillments TO service_role;
ALTER TABLE public.fulfillments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fulfillments readable" ON public.fulfillments FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales reps create" ON public.fulfillments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'sales_rep') AND sales_rep_id = auth.uid());
CREATE POLICY "chief engineer updates" ON public.fulfillments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'chief_engineer')) WITH CHECK (public.has_role(auth.uid(),'chief_engineer'));
CREATE POLICY "assigned engineer updates" ON public.fulfillments FOR UPDATE TO authenticated
  USING (auth.uid() IN (assembly_engineer_id, installation_engineer_id))
  WITH CHECK (auth.uid() IN (assembly_engineer_id, installation_engineer_id));

CREATE TABLE public.stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES public.fulfillments(id) ON DELETE CASCADE,
  stage text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz,
  notes text
);
GRANT SELECT ON public.stage_events TO authenticated;
GRANT ALL ON public.stage_events TO service_role;
ALTER TABLE public.stage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage events readable" ON public.stage_events FOR SELECT TO authenticated USING (true);

CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES public.fulfillments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  role public.commission_role NOT NULL,
  amount numeric(14,2) NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  UNIQUE (fulfillment_id, role)
);
GRANT SELECT, UPDATE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commissions readable" ON public.commissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins and chiefs toggle paid" ON public.commissions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'chief_engineer'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'chief_engineer'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _role public.app_role;
  _key text;
BEGIN
  _role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), 'sales_rep')::public.app_role;
  _key := COALESCE(NEW.raw_user_meta_data->>'admin_key','');
  IF _role = 'admin' AND _key <> 'HOM123' THEN
    RAISE EXCEPTION 'Invalid admin key';
  END IF;
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), _role);
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;
CREATE TRIGGER fulfillments_touch BEFORE UPDATE ON public.fulfillments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.fulfillment_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.stage_events (fulfillment_id, stage, actor_id)
  VALUES (NEW.id, 'received', NEW.sales_rep_id);
  INSERT INTO public.commissions (fulfillment_id, user_id, role, amount)
  VALUES (NEW.id, NEW.sales_rep_id, 'sales', ROUND(NEW.agreed_price * 0.02, 2))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $fn$;
CREATE TRIGGER fulfillments_created AFTER INSERT ON public.fulfillments
FOR EACH ROW EXECUTE FUNCTION public.fulfillment_created();

CREATE OR REPLACE FUNCTION public.fulfillment_stage_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _actor uuid;
  _installer uuid;
BEGIN
  IF NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage THEN RETURN NEW; END IF;
  _installer := COALESCE(NEW.installation_engineer_id, NEW.assembly_engineer_id);
  _actor := CASE NEW.current_stage
    WHEN 'waiting_for_frame' THEN NEW.chief_engineer_id
    WHEN 'assembling' THEN NEW.assembly_engineer_id
    WHEN 'delivery' THEN _installer
    WHEN 'installed' THEN _installer
    ELSE auth.uid() END;

  UPDATE public.stage_events SET exited_at = now()
  WHERE fulfillment_id = NEW.id AND exited_at IS NULL;

  INSERT INTO public.stage_events (fulfillment_id, stage, actor_id)
  VALUES (NEW.id, NEW.current_stage, _actor);

  IF NEW.current_stage = 'delivery' AND NEW.assembly_engineer_id IS NOT NULL THEN
    INSERT INTO public.commissions (fulfillment_id, user_id, role, amount)
    VALUES (NEW.id, NEW.assembly_engineer_id, 'assembly', 1000)
    ON CONFLICT DO NOTHING;
  END IF;

  IF NEW.current_stage = 'installed' AND _installer IS NOT NULL THEN
    INSERT INTO public.commissions (fulfillment_id, user_id, role, amount)
    VALUES (NEW.id, _installer, 'installation', 1000)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $fn$;
CREATE TRIGGER fulfillments_stage_changed AFTER UPDATE ON public.fulfillments
FOR EACH ROW EXECUTE FUNCTION public.fulfillment_stage_changed();