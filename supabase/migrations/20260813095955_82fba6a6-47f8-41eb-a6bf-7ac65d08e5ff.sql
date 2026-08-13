-- new role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_manager';

-- avoids referencing the new enum label in the same transaction
CREATE OR REPLACE FUNCTION public.is_crm_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role::text IN ('admin','sales_manager')
  );
$$;

-- ============================ LEADS ============================
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  machine_interest text,
  location text,
  source text,
  temp text NOT NULL DEFAULT 'warm',
  stage text NOT NULL DEFAULT 'new',
  rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  follow_up_due_at timestamptz,
  deal_value numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads readable" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "leads insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "leads update own or manager" ON public.leads FOR UPDATE TO authenticated
  USING (rep_id = auth.uid() OR rep_id IS NULL OR public.is_crm_manager(auth.uid()))
  WITH CHECK (rep_id = auth.uid() OR rep_id IS NULL OR public.is_crm_manager(auth.uid()));
CREATE POLICY "leads delete manager" ON public.leads FOR DELETE TO authenticated
  USING (public.is_crm_manager(auth.uid()));
CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX leads_rep_idx ON public.leads(rep_id);
CREATE INDEX leads_stage_idx ON public.leads(stage);

CREATE TABLE public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reached boolean NOT NULL DEFAULT false,
  outcome_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead activities readable" ON public.lead_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead activities insert own" ON public.lead_activities FOR INSERT TO authenticated
  WITH CHECK (rep_id = auth.uid());
CREATE POLICY "lead activities update own or manager" ON public.lead_activities FOR UPDATE TO authenticated
  USING (rep_id = auth.uid() OR public.is_crm_manager(auth.uid()))
  WITH CHECK (rep_id = auth.uid() OR public.is_crm_manager(auth.uid()));
CREATE POLICY "lead activities delete manager" ON public.lead_activities FOR DELETE TO authenticated
  USING (public.is_crm_manager(auth.uid()));
CREATE INDEX lead_activities_lead_idx ON public.lead_activities(lead_id);

-- ============================ INVOICES ============================
CREATE SEQUENCE public.invoice_no_seq;
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE DEFAULT ('INV-' || lpad(nextval('public.invoice_no_seq')::text, 6, '0')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  client_name text NOT NULL DEFAULT '',
  machine text,
  rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  balance numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices readable" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "invoices insert" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "invoices update own or manager" ON public.invoices FOR UPDATE TO authenticated
  USING (rep_id = auth.uid() OR public.is_crm_manager(auth.uid()))
  WITH CHECK (rep_id = auth.uid() OR public.is_crm_manager(auth.uid()));
CREATE POLICY "invoices delete own or manager" ON public.invoices FOR DELETE TO authenticated
  USING (rep_id = auth.uid() OR public.is_crm_manager(auth.uid()));
CREATE TRIGGER invoices_touch BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX invoices_date_idx ON public.invoices(date DESC);

-- ============================ INVENTORY ============================
CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL DEFAULT '',
  model text,
  in_stock integer NOT NULL DEFAULT 0,
  buying_price numeric,
  selling_price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory readable" ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory managed" ON public.inventory FOR ALL TO authenticated
  USING (public.is_crm_manager(auth.uid())) WITH CHECK (public.is_crm_manager(auth.uid()));
CREATE TRIGGER inventory_touch BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================ SERVICES ============================
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL DEFAULT '',
  contact text,
  machine_type text,
  last_service_date date,
  next_due_date date,
  visit_count integer NOT NULL DEFAULT 0,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services readable" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "services insert" ON public.services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "services update" ON public.services FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "services delete manager" ON public.services FOR DELETE TO authenticated
  USING (public.is_crm_manager(auth.uid()));
CREATE TRIGGER services_touch BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================ PROJECTS ============================
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  client_name text,
  machine_description text,
  location text,
  total numeric NOT NULL DEFAULT 0,
  balance numeric,
  status text NOT NULL DEFAULT 'ongoing',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects readable" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects insert" ON public.projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "projects update own or manager" ON public.projects FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_crm_manager(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_crm_manager(auth.uid()));
CREATE POLICY "projects delete own or manager" ON public.projects FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_crm_manager(auth.uid()));
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================ SCHOOLS ============================
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL DEFAULT '',
  county text,
  area text,
  tier text,
  status text NOT NULL DEFAULT 'prospect',
  rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_contact_date date,
  next_follow_up_date date,
  visit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schools readable" ON public.schools FOR SELECT TO authenticated USING (true);
CREATE POLICY "schools insert" ON public.schools FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "schools update own or manager" ON public.schools FOR UPDATE TO authenticated
  USING (rep_id = auth.uid() OR rep_id IS NULL OR public.is_crm_manager(auth.uid()))
  WITH CHECK (rep_id = auth.uid() OR rep_id IS NULL OR public.is_crm_manager(auth.uid()));
CREATE POLICY "schools delete manager" ON public.schools FOR DELETE TO authenticated
  USING (public.is_crm_manager(auth.uid()));
CREATE TRIGGER schools_touch BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================ MONTHLY TARGETS ============================
CREATE TABLE public.monthly_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE,
  revenue_target numeric NOT NULL DEFAULT 0,
  deals_target integer NOT NULL DEFAULT 0,
  set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_targets TO authenticated;
GRANT ALL ON public.monthly_targets TO service_role;
ALTER TABLE public.monthly_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "targets readable" ON public.monthly_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "targets managed" ON public.monthly_targets FOR ALL TO authenticated
  USING (public.is_crm_manager(auth.uid())) WITH CHECK (public.is_crm_manager(auth.uid()));
CREATE TRIGGER monthly_targets_touch BEFORE UPDATE ON public.monthly_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();