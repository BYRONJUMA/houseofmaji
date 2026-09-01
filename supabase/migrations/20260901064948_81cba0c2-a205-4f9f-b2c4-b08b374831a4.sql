-- 1. Lead scoring columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS showroom_visited_at timestamptz,
  ADD COLUMN IF NOT EXISTS water_test_or_site_visit_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS timeline_stated_at timestamptz,
  ADD COLUMN IF NOT EXISTS timeline_notes text,
  ADD COLUMN IF NOT EXISTS responded_within_agreed_period_at timestamptz,
  ADD COLUMN IF NOT EXISTS budget_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_manually_set_at timestamptz;

-- 2. Audit table
CREATE TABLE IF NOT EXISTS public.lead_scoring_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  criterion text NOT NULL,
  points integer NOT NULL,
  recorded_by uuid REFERENCES public.profiles(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_scoring_events_unique
  ON public.lead_scoring_events(lead_id, criterion);

GRANT SELECT, INSERT, DELETE ON public.lead_scoring_events TO authenticated;
GRANT ALL ON public.lead_scoring_events TO service_role;
ALTER TABLE public.lead_scoring_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM members read scoring events" ON public.lead_scoring_events;
CREATE POLICY "CRM members read scoring events" ON public.lead_scoring_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "CRM members record scoring events" ON public.lead_scoring_events;
CREATE POLICY "CRM members record scoring events" ON public.lead_scoring_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "CRM members remove scoring events" ON public.lead_scoring_events;
CREATE POLICY "CRM members remove scoring events" ON public.lead_scoring_events
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 3. Criterion -> points / column mapping helper
CREATE OR REPLACE FUNCTION public.lead_criterion_points(_criterion text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _criterion
    WHEN 'showroom_visited' THEN 5
    WHEN 'water_test_or_site_visit_paid' THEN 5
    WHEN 'timeline_stated' THEN 3
    WHEN 'responded_within_agreed_period' THEN 3
    WHEN 'budget_confirmed' THEN 2
    WHEN 'location_confirmed' THEN 2
    ELSE 0 END;
$$;

-- 4. Recompute score + timestamps + forward-only stage movement
CREATE OR REPLACE FUNCTION public.apply_lead_scoring()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lead_id uuid := COALESCE(NEW.lead_id, OLD.lead_id);
  _total integer;
  _stage text;
  _manual timestamptz;
  _next text;
BEGIN
  SELECT COALESCE(SUM(public.lead_criterion_points(criterion)), 0)
    INTO _total FROM public.lead_scoring_events WHERE lead_id = _lead_id;
  _total := LEAST(_total, 20);

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

  IF _total >= 15 THEN
    _next := 'hot';
  ELSIF _total >= 8 THEN
    _next := 'warm';
  ELSE
    RETURN NULL;
  END IF;

  -- forward only
  IF (_stage = 'new' AND _next IN ('warm', 'hot')) OR (_stage = 'warm' AND _next = 'hot') THEN
    PERFORM set_config('app.auto_lead_stage', '1', true);
    UPDATE public.leads SET stage = _next WHERE id = _lead_id;
    PERFORM set_config('app.auto_lead_stage', '', true);
    INSERT INTO public.lead_activities (lead_id, rep_id, reached, outcome_note)
    VALUES (_lead_id, NULL, true,
      'Auto-moved to ' || _next || ' — lead score reached ' || _total || '/20');
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS lead_scoring_events_apply ON public.lead_scoring_events;
CREATE TRIGGER lead_scoring_events_apply
AFTER INSERT OR DELETE ON public.lead_scoring_events
FOR EACH ROW EXECUTE FUNCTION public.apply_lead_scoring();

-- 5. Remember manual stage changes so automation never overrides them
CREATE OR REPLACE FUNCTION public.mark_manual_lead_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage
     AND COALESCE(current_setting('app.auto_lead_stage', true), '') <> '1' THEN
    NEW.stage_manually_set_at := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS leads_mark_manual_stage ON public.leads;
CREATE TRIGGER leads_mark_manual_stage
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.mark_manual_lead_stage();

-- 6. Stale-lead sweep: new + 0-7 points + 14 days old -> not_won
CREATE OR REPLACE FUNCTION public.expire_stale_leads()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), '{}') INTO _ids FROM public.leads
  WHERE stage = 'new'
    AND COALESCE(total_score, 0) <= 7
    AND stage_manually_set_at IS NULL
    AND created_at < now() - interval '14 days';

  IF array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;

  PERFORM set_config('app.auto_lead_stage', '1', true);
  UPDATE public.leads SET stage = 'not_won' WHERE id = ANY(_ids);
  PERFORM set_config('app.auto_lead_stage', '', true);

  INSERT INTO public.lead_activities (lead_id, rep_id, reached, outcome_note)
  SELECT unnest(_ids), NULL, false, 'Auto-moved: no engagement within 14 days';

  RETURN array_length(_ids, 1);
END; $$;

GRANT EXECUTE ON FUNCTION public.expire_stale_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_criterion_points(text) TO authenticated;