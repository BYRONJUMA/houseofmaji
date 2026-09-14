-- ============ 1. multi-role model ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

INSERT INTO public.user_roles (user_id, role)
SELECT id, role FROM public.profiles WHERE role IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.profiles ALTER COLUMN role DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

CREATE POLICY "user roles readable" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid()));
CREATE POLICY "user roles managed by admin" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_user_roles(_user_id uuid, _roles app_role[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND NOT (role = ANY(_roles));
  INSERT INTO public.user_roles (user_id, role)
    SELECT _user_id, r FROM unnest(_roles) AS r
    ON CONFLICT DO NOTHING;
  UPDATE public.profiles p SET role = (
    SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = _user_id
    ORDER BY array_position(ARRAY['admin','chief_engineer','sales_head','engineer','sales_rep']::text[], ur.role::text)
    LIMIT 1
  ) WHERE p.id = _user_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_user_roles(uuid, app_role[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_crm_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'sales_head');
$$;

CREATE OR REPLACE FUNCTION public.can_see_service_contact(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'chief_engineer')
      OR public.has_role(_user_id, 'sales_head');
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _requested text;
  _role public.app_role;
  _key text;
BEGIN
  _requested := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), 'sales_rep');
  _key := COALESCE(NEW.raw_user_meta_data->>'admin_key','');
  IF _requested = 'none' THEN
    _role := NULL;
  ELSE
    _role := _requested::public.app_role;
    IF _role = 'admin' AND _key <> 'HOM123' THEN
      _role := 'sales_rep';
    END IF;
  END IF;
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), _role)
  ON CONFLICT (id) DO NOTHING;
  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

-- ============ 2. settings-driven scoring ============
CREATE OR REPLACE FUNCTION public.setting_number(_key text, _default numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT NULLIF(trim(value), '')::numeric FROM public.settings WHERE key = _key),
    _default);
$$;

CREATE OR REPLACE FUNCTION public.lead_criterion_points(_criterion text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _criterion
    WHEN 'showroom_visited' THEN public.setting_number('score_points_showroom_visited', 5)
    WHEN 'water_test_or_site_visit_paid' THEN public.setting_number('score_points_water_test_or_site_visit_paid', 5)
    WHEN 'timeline_stated' THEN public.setting_number('score_points_timeline_stated', 3)
    WHEN 'responded_within_agreed_period' THEN public.setting_number('score_points_responded_within_agreed_period', 3)
    WHEN 'budget_confirmed' THEN public.setting_number('score_points_budget_confirmed', 2)
    WHEN 'location_confirmed' THEN public.setting_number('score_points_location_confirmed', 2)
    ELSE 0 END::integer;
$$;

CREATE OR REPLACE FUNCTION public.max_lead_score()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.setting_number('score_points_showroom_visited', 5)
        + public.setting_number('score_points_water_test_or_site_visit_paid', 5)
        + public.setting_number('score_points_timeline_stated', 3)
        + public.setting_number('score_points_responded_within_agreed_period', 3)
        + public.setting_number('score_points_budget_confirmed', 2)
        + public.setting_number('score_points_location_confirmed', 2))::integer;
$$;

CREATE OR REPLACE FUNCTION public.apply_lead_scoring()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lead_id uuid := COALESCE(NEW.lead_id, OLD.lead_id);
  _total integer;
  _stage text;
  _manual timestamptz;
  _next text;
  _hot integer := public.setting_number('score_threshold_hot', 15)::integer;
  _warm integer := public.setting_number('score_threshold_warm', 8)::integer;
BEGIN
  SELECT COALESCE(SUM(public.lead_criterion_points(criterion)), 0)
    INTO _total FROM public.lead_scoring_events WHERE lead_id = _lead_id;
  _total := LEAST(_total, public.max_lead_score());

  UPDATE public.leads SET
    total_score = _total,
    showroom_visited_at = (SELECT MIN(recorded_at) FROM public.lead_scoring_events e WHERE e.lead_id = _lead_id AND e.criterion = 'showroom_visited'),
    water_test_or_site_visit_paid_at = (SELECT MIN(recorded_at) FROM public.lead_scoring_events e WHERE e.lead_id = _lead_id AND e.criterion = 'water_test_or_site_visit_paid'),
    timeline_stated_at = (SELECT MIN(recorded_at) FROM public.lead_scoring_events e WHERE e.lead_id = _lead_id AND e.criterion = 'timeline_stated'),
    responded_within_agreed_period_at = (SELECT MIN(recorded_at) FROM public.lead_scoring_events e WHERE e.lead_id = _lead_id AND e.criterion = 'responded_within_agreed_period'),
    budget_confirmed_at = (SELECT MIN(recorded_at) FROM public.lead_scoring_events e WHERE e.lead_id = _lead_id AND e.criterion = 'budget_confirmed'),
    location_confirmed_at = (SELECT MIN(recorded_at) FROM public.lead_scoring_events e WHERE e.lead_id = _lead_id AND e.criterion = 'location_confirmed')
  WHERE id = _lead_id;

  IF TG_OP <> 'INSERT' THEN RETURN NULL; END IF;

  SELECT stage, stage_manually_set_at INTO _stage, _manual FROM public.leads WHERE id = _lead_id;
  IF _manual IS NOT NULL THEN RETURN NULL; END IF;
  IF _stage IN ('won', 'not_won') THEN RETURN NULL; END IF;

  IF _total >= _hot THEN
    _next := 'hot';
  ELSIF _total >= _warm THEN
    _next := 'warm';
  ELSE
    RETURN NULL;
  END IF;

  IF (_stage = 'new' AND _next IN ('warm', 'hot')) OR (_stage = 'warm' AND _next = 'hot') THEN
    PERFORM set_config('app.auto_lead_stage', '1', true);
    UPDATE public.leads SET stage = _next WHERE id = _lead_id;
    PERFORM set_config('app.auto_lead_stage', '', true);
    INSERT INTO public.lead_activities (lead_id, rep_id, reached, outcome_note)
    VALUES (_lead_id, NULL, true,
      'Auto-moved to ' || _next || ' — lead score reached ' || _total || '/' || public.max_lead_score());
  END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.expire_stale_leads()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ids uuid[];
  _days integer := public.setting_number('new_lead_timeout_days', 14)::integer;
  _max integer := public.setting_number('new_lead_timeout_max_score', 7)::integer;
BEGIN
  SELECT COALESCE(array_agg(id), '{}') INTO _ids FROM public.leads
  WHERE stage = 'new'
    AND COALESCE(total_score, 0) <= _max
    AND stage_manually_set_at IS NULL
    AND created_at < now() - (_days || ' days')::interval;

  IF array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;

  PERFORM set_config('app.auto_lead_stage', '1', true);
  UPDATE public.leads SET stage = 'not_won' WHERE id = ANY(_ids);
  PERFORM set_config('app.auto_lead_stage', '', true);

  INSERT INTO public.lead_activities (lead_id, rep_id, reached, outcome_note)
  SELECT unnest(_ids), NULL, false,
    'Auto-moved: no engagement within ' || _days || ' days';

  RETURN array_length(_ids, 1);
END; $$;

-- ============ 3. roleless users: own profile + own equipment only ============
DROP POLICY "profiles readable by signed in" ON public.profiles;
CREATE POLICY "profiles readable by signed in" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_any_role(auth.uid()));

DROP POLICY "equipment readable by signed in" ON public.assigned_equipment;
CREATE POLICY "equipment readable by signed in" ON public.assigned_equipment FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid()));

DROP POLICY "commissions readable" ON public.commissions;
CREATE POLICY "commissions readable" ON public.commissions FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "checklists readable" ON public.delivery_checklists;
CREATE POLICY "checklists readable" ON public.delivery_checklists FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "fulfillment edits readable" ON public.fulfillment_edits;
CREATE POLICY "fulfillment edits readable" ON public.fulfillment_edits FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "fulfillments readable" ON public.fulfillments;
CREATE POLICY "fulfillments readable" ON public.fulfillments FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "inventory readable" ON public.inventory;
CREATE POLICY "inventory readable" ON public.inventory FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "invoices readable" ON public.invoices;
CREATE POLICY "invoices readable" ON public.invoices FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "invoices insert" ON public.invoices;
CREATE POLICY "invoices insert" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));
DROP POLICY "lead activities readable" ON public.lead_activities;
CREATE POLICY "lead activities readable" ON public.lead_activities FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "CRM members read scoring events" ON public.lead_scoring_events;
CREATE POLICY "CRM members read scoring events" ON public.lead_scoring_events FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "CRM members record scoring events" ON public.lead_scoring_events;
CREATE POLICY "CRM members record scoring events" ON public.lead_scoring_events FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));
DROP POLICY "CRM members remove scoring events" ON public.lead_scoring_events;
CREATE POLICY "CRM members remove scoring events" ON public.lead_scoring_events FOR DELETE TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "leads readable" ON public.leads;
CREATE POLICY "leads readable" ON public.leads FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "leads insert" ON public.leads;
CREATE POLICY "leads insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));
DROP POLICY "taxonomy cap read" ON public.machine_capacities;
CREATE POLICY "taxonomy cap read" ON public.machine_capacities FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "taxonomy cat read" ON public.machine_categories;
CREATE POLICY "taxonomy cat read" ON public.machine_categories FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "taxonomy type read" ON public.machine_types;
CREATE POLICY "taxonomy type read" ON public.machine_types FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "targets readable" ON public.monthly_targets;
CREATE POLICY "targets readable" ON public.monthly_targets FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "payments readable" ON public.payments;
CREATE POLICY "payments readable" ON public.payments FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "projects readable" ON public.projects;
CREATE POLICY "projects readable" ON public.projects FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "projects insert" ON public.projects;
CREATE POLICY "projects insert" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));
DROP POLICY "purchase_order_items_read" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_read" ON public.purchase_order_items FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "purchase_orders_read" ON public.purchase_orders;
CREATE POLICY "purchase_orders_read" ON public.purchase_orders FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "schools readable" ON public.schools;
CREATE POLICY "schools readable" ON public.schools FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "schools insert" ON public.schools;
CREATE POLICY "schools insert" ON public.schools FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));
DROP POLICY "settings read" ON public.settings;
CREATE POLICY "settings read" ON public.settings FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "stage events readable" ON public.stage_events;
CREATE POLICY "stage events readable" ON public.stage_events FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "stock_take_read" ON public.stock_take_variances;
CREATE POLICY "stock_take_read" ON public.stock_take_variances FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "store access readable by signed in" ON public.store_access;
CREATE POLICY "store access readable by signed in" ON public.store_access FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "store products readable by signed in" ON public.store_products;
CREATE POLICY "store products readable by signed in" ON public.store_products FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "requisition_items_read" ON public.store_requisition_items;
CREATE POLICY "requisition_items_read" ON public.store_requisition_items FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "requisitions_read" ON public.store_requisitions;
CREATE POLICY "requisitions_read" ON public.store_requisitions FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "store entries readable by signed in" ON public.store_stock_entries;
CREATE POLICY "store entries readable by signed in" ON public.store_stock_entries FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "suppliers_read" ON public.suppliers;
CREATE POLICY "suppliers_read" ON public.suppliers FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "wa recipients read" ON public.whatsapp_recipients;
CREATE POLICY "wa recipients read" ON public.whatsapp_recipients FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "wa step read" ON public.whatsapp_sequence_steps;
CREATE POLICY "wa step read" ON public.whatsapp_sequence_steps FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY "wa seq read" ON public.whatsapp_sequences;
CREATE POLICY "wa seq read" ON public.whatsapp_sequences FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));